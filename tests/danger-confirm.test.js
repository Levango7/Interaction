/**
 * danger-confirm.test.js —— 通用危险操作确认组件（2026-10-20 P1-4）
 * ----------------------------------------------------------------------------
 * 组件契约来自 docs/DESIGN-SYSTEM.md §4：确认类是 Modal（居中、阻断），必须
 * role/aria-modal 齐备、Esc 取消、焦点陷阱与归还、**不吃遮罩点击**（要显式二选一）。
 *
 * 为什么还要这一层（jsdom 只能证明"契约字段"，证明不了"看得见点得到"）：
 *   AI 那个旧确认框用的是 `.recycle-modal`（position:static），在 jsdom 里
 *   `getElementById` 恒真、测试全绿；真浏览器实测却是 —— 插到 body 末端时
 *   top == 视口高度（完全在视口外），375×667 下「确认执行」按钮被固定底部导航
 *   压住（elementFromPoint 命中 mob-bar-btn）。可见性判据在 `tests/e2e/danger-confirm.spec.js`。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

async function boot() {
  const win = loadApp();
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

const MODAL = "dangerConfirmModal";

describe("dangerConfirm 组件契约", () => {
  it("确认 → resolve(true)，节点移除，焦点归还触发元素", async () => {
    const win = await boot();
    const trigger = win.document.createElement("button");
    win.document.body.appendChild(trigger);
    trigger.focus();
    expect(win.document.activeElement).toBe(trigger);

    const p = win.dangerConfirm({ message: "删除这条任务？", confirmText: "确认执行" });
    const modal = win.document.getElementById(MODAL);
    expect(modal, "确认框应已插入").toBeTruthy();
    expect(modal.classList.contains("viz-modal"), "必须用真浮层骨架（fixed + 遮罩 + z-modal）").toBe(true);
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    /* 焦点应被圈进浮层，而不是留在背后的页面上 */
    expect(modal.contains(win.document.activeElement), "打开后焦点应进入浮层").toBe(true);

    modal.querySelector("#" + MODAL + "Yes").click();
    expect(await p).toBe(true);
    expect(win.document.getElementById(MODAL), "确认后应移除").toBeFalsy();
    expect(win.document.activeElement, "焦点应归还触发元素").toBe(trigger);
  });

  it("取消 → resolve(false)", async () => {
    const win = await boot();
    const p = win.dangerConfirm({ message: "清空画布？" });
    win.document.getElementById(MODAL).querySelector("#" + MODAL + "No").click();
    expect(await p).toBe(false);
    expect(win.document.getElementById(MODAL)).toBeFalsy();
  });

  it("Esc → resolve(false)（键盘可达，不只给鼠标）", async () => {
    const win = await boot();
    const p = win.dangerConfirm({ message: "吊销此 API Key？" });
    const modal = win.document.getElementById(MODAL);
    modal.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await p).toBe(false);
    expect(win.document.getElementById(MODAL)).toBeFalsy();
  });

  it("点遮罩不关闭 —— 危险确认必须显式二选一", async () => {
    const win = await boot();
    const p = win.dangerConfirm({ message: "用云端数据覆盖本机数据？" });
    const modal = win.document.getElementById(MODAL);
    modal.click(); /* target 就是遮罩本身 */
    await new Promise((r) => setTimeout(r, 0));
    expect(win.document.getElementById(MODAL), "遮罩点击不应关掉确认框").toBeTruthy();
    modal.querySelector("#" + MODAL + "No").click();
    expect(await p).toBe(false);
  });

  it("message 里的 HTML 被转义（任务标题是用户输入，不能成为注入面）", async () => {
    const win = await boot();
    const payload = '<img src=x onerror="window.__pwned=1">';
    win.dangerConfirm({ message: payload, detail: payload, title: payload });
    const modal = win.document.getElementById(MODAL);
    expect(modal.querySelector("img"), "注入的 img 不应存在").toBeFalsy();
    expect(modal.textContent).toContain("__pwned"); /* 作为纯文本呈现 = 确实走了转义 */
    expect(win.__pwned, "onerror 不得执行").toBeUndefined();
    modal.querySelector("#" + MODAL + "No").click();
  });

  it("连开两次不叠层：前一个自动按取消关掉", async () => {
    const win = await boot();
    const first = win.dangerConfirm({ message: "第一条" });
    const second = win.dangerConfirm({ message: "第二条" });
    expect(await first, "第一条应被后者顶掉并按取消结算").toBe(false);
    expect(win.document.querySelectorAll("#" + MODAL).length).toBe(1);
    win.document.getElementById(MODAL).querySelector("#" + MODAL + "Yes").click();
    expect(await second).toBe(true);
  });

  it("dismissDangerConfirm 供 Esc 热键/场景切换复用，无框时返回 false", async () => {
    const win = await boot();
    expect(win.dismissDangerConfirm(), "没打开时不能假装关掉了").toBe(false);
    const p = win.dangerConfirm({ message: "删除该会话？" });
    expect(win.dismissDangerConfirm()).toBe(true);
    expect(await p).toBe(false);
    expect(win.dismissDangerConfirm(), "重复调用必须返回 false（幂等）").toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   dangerPrompt 组件契约（R-33）
   ---------------------------------------------------------------------
   与 dangerConfirm 的**本质差异**：那个是布尔语义（确认/取消），这个要**返回字符串**。
   所以它不是"给确认框加个输入框"，而是独立的 resolve(string)/resolve(null) 契约。
   契约里最容易被做错的三条，各有用例钉住：
     · required 默认 true —— 空值不关框、只出内联提示（本仓调用点没有一处接受空值）；
       但 `required:false` 必须真的能放行空值（导图节点改字要把文字清空，是合法操作）；
     · o.value 走 input.value 属性，绝不进 innerHTML（默认值可能是用户数据）；
     · secret:true → type=password（导出密码；原生 prompt 不遮是缺陷不是契约）。
   ═══════════════════════════════════════════════════════════════════════ */
const PMODAL = "dangerPromptModal";

describe("dangerPrompt 组件契约", () => {
  it("确认 → resolve(输入的字符串)，节点移除，焦点归还触发元素", async () => {
    const win = await boot();
    const trigger = win.document.createElement("button");
    win.document.body.appendChild(trigger);
    trigger.focus();

    const p = win.dangerPrompt({ title: "重命名会话" });
    const modal = win.document.getElementById(PMODAL);
    expect(modal, "输入框应已插入").toBeTruthy();
    expect(modal.classList.contains("viz-modal"), "必须用真浮层骨架（fixed + 遮罩 + z-modal）").toBe(true);
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    expect(modal.contains(win.document.activeElement), "打开后焦点应进入浮层").toBe(true);

    modal.querySelector("#" + PMODAL + "Input").value = "周会纪要";
    modal.querySelector("#" + PMODAL + "Yes").click();
    expect(await p).toBe("周会纪要");
    expect(win.document.getElementById(PMODAL), "确认后应移除").toBeFalsy();
    expect(win.document.activeElement, "焦点应归还触发元素").toBe(trigger);
  });

  it("取消 / Esc → resolve(null)（与原生 prompt 的取消同形）", async () => {
    const win = await boot();
    const p1 = win.dangerPrompt({ title: "视图名称：" });
    win.document.getElementById(PMODAL).querySelector("#" + PMODAL + "No").click();
    expect(await p1).toBe(null);

    const p2 = win.dangerPrompt({ title: "视图名称：" });
    win.document.getElementById(PMODAL).dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await p2).toBe(null);
    expect(win.document.getElementById(PMODAL)).toBeFalsy();
  });

  it("Enter = 确认（对齐原生 prompt 在桌面端的习惯）", async () => {
    const win = await boot();
    const p = win.dangerPrompt({ title: "输入 Key 名称：" });
    const input = win.document.getElementById(PMODAL).querySelector("#" + PMODAL + "Input");
    input.value = "我的 Key";
    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(await p).toBe("我的 Key");
  });

  it("空值默认不收：点确认只出内联提示、框不关（required 默认 true）", async () => {
    const win = await boot();
    const p = win.dangerPrompt({ title: "输入 Key 名称：" });
    const modal = win.document.getElementById(PMODAL);
    modal.querySelector("#" + PMODAL + "Yes").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(win.document.getElementById(PMODAL), "空值不得关框").toBeTruthy();
    const err = modal.querySelector("#" + PMODAL + "Err");
    expect(err, "应有内联错误提示").toBeTruthy();
    expect(err.textContent).toContain("空");
    modal.querySelector("#" + PMODAL + "No").click();
    expect(await p).toBe(null);
  });

  it("required:false 真的能放行空值（导图节点改字：清空文字是合法操作）", async () => {
    const win = await boot();
    const p = win.dangerPrompt({ title: "修改节点文字", value: "旧文字", required: false });
    const modal = win.document.getElementById(PMODAL);
    expect(modal.querySelector("#" + PMODAL + "Input").value, "o.value 必须回填").toBe("旧文字");
    modal.querySelector("#" + PMODAL + "Input").value = "";
    modal.querySelector("#" + PMODAL + "Yes").click();
    expect(await p, "空字符串应被 resolve 出来，而不是 null").toBe("");
  });

  it("打开即全选输入内容（对齐原生 prompt；也让「复制分享链接」Ctrl+C 一步到位）", async () => {
    const win = await boot();
    const p = win.dangerPrompt({ title: "复制此链接分享任务：", value: "https://x/y#share=abc", required: false });
    const input = win.document.getElementById(PMODAL).querySelector("#" + PMODAL + "Input");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("https://x/y#share=abc".length);
    win.document.getElementById(PMODAL).querySelector("#" + PMODAL + "No").click();
    expect(await p).toBe(null);
  });

  it("secret:true → type=password（导出密码那一处；原生 prompt 不遮是缺陷不是契约）", async () => {
    const win = await boot();
    const p = win.dangerPrompt({ title: "请输入导出密码（用于加密）", secret: true });
    const input = win.document.getElementById(PMODAL).querySelector("#" + PMODAL + "Input");
    expect(input.type).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("off");
    win.document.getElementById(PMODAL).querySelector("#" + PMODAL + "No").click();
    expect(await p).toBe(null);
  });

  it("title/value 里的 HTML 不进 innerHTML（默认值可能是用户数据）", async () => {
    const win = await boot();
    const payload = '<img src=x onerror="window.__pwned2=1">';
    const p = win.dangerPrompt({ title: payload, value: payload, required: false });
    const modal = win.document.getElementById(PMODAL);
    expect(modal.querySelector("img"), "注入的 img 不应存在").toBeFalsy();
    expect(win.__pwned2, "onerror 不得执行").toBeUndefined();
    expect(modal.querySelector("#" + PMODAL + "Input").value, "value 走属性，作为纯值存在").toBe(payload);
    modal.querySelector("#" + PMODAL + "No").click();
    expect(await p).toBe(null);
  });

  it("与 dangerConfirm 共用一层互斥：后开的一个把前一个顶掉", async () => {
    const win = await boot();
    const first = win.dangerPrompt({ title: "第一个" });
    const second = win.dangerConfirm({ message: "第二个" });
    expect(win.document.getElementById(PMODAL), "输入框应被后开的确认框顶掉").toBeFalsy();
    expect(win.document.getElementById("dangerConfirmModal")).toBeTruthy();
    win.document.getElementById("dangerConfirmModal").querySelector("#dangerConfirmModalNo").click();
    expect(await first).toBe(null);
    expect(await second).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   原生对话框债务棘轮（confirm / prompt / alert 三个口径）
   ---------------------------------------------------------------------
   confirm 的 39 处已由六个批次迁完（39→35→27→24→22→12→0，迁移记录见各批提交与
   CHANGELOG），现值 0。R-33（2026-10-24）按同口径重扫时抓到一条**真缺口**：
   **prompt 还剩下 10 处没迁**，而棘轮只盯 confirm —— 一条只覆盖三分之一的门禁，
   和没有门禁差不多。本批把 prompt 10 处迁完，并把 alert 一并纳入登记（现值 0）。
   三个口径登记值现在都是 0 ⇒ 语义比之前更强：新增任何一个原生对话框都当场红，
   不再依赖"调低常量"这个容易忘的动作。

   计数口径（踩过的坑都固化在下面的阳性/阴性对照里，改口径前先跑那条）：
     ① 先剥注释 —— 组件自己的文档注释里就写着"原生 confirm()"，不剥会把 0 数成 1（实测踩过）；
     ② 归一 window. 前缀 —— `window.prompt(` 与 `prompt(` 是同一个调用，漏了它就会漏数；
     ③ 负向预查 (?<![.\w$]) —— 排除两类**不是原生对话框**的命中：
        · `Sysprompt(` / `setCustomSysprompt(`：只是函数名以 prompt 结尾（第一版粗口径
          把它们数成 16 处，实际只有 11，其中还有 1 处是下一条）；
        · `_deferredInstallPrompt.prompt()`：PWA 的 BeforeInstallPromptEvent.prompt()，
          是浏览器**唯一**合法的安装提示入口 —— 为了迎合计数器去动它，等于把 PWA 安装弄坏。
   ═══════════════════════════════════════════════════════════════════════ */
describe("原生对话框债务棘轮（confirm / prompt / alert）", () => {
  const REGISTRY = { confirm: 0, prompt: 0, alert: 0 };
  const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

  const stripComments = (code) => code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); /* 前缀排除 ":" → 不吃 http:// 里的 // */

  /* window. 归一：window.prompt( 与 prompt( 是同一个调用 */
  const normalize = (code) => code.replace(/\bwindow\./g, "");

  const count = (code, name) => {
    const re = new RegExp("(?<![.\\w$])" + name + "\\s*\\(", "g");
    return [...normalize(stripComments(code)).matchAll(re)].length;
  };

  it("计数函数有射程：真调用要数到，注释/词尾/PWA 安装提示不能数进来", () => {
    const sample = [
      'if(confirm("a")){}',
      'window.prompt("b");',
      'alert("c");',
      '// 原生 confirm("d") 是坏的',
      '/* prompt("e") */',
      'setCustomSysprompt("f");',
      'await _deferredInstallPrompt.prompt();',
      'const u="http://x/y";'
    ].join("\n");
    expect(count(sample, "confirm"), "真 confirm 一处；注释里那处不能算").toBe(1);
    expect(count(sample, "prompt"), "window.prompt 要数到；注释里、Sysprompt 词尾、.prompt() 都不能算").toBe(1);
    expect(count(sample, "alert"), "真 alert 一处；注释里那处不能算").toBe(1);
    expect(count("function closeConfirmModal(){} openConfirmModal(); dismissDangerConfirm();", "confirm"),
      "大小写不同的 CloseConfirmModal / dismissDangerConfirm 不是原生调用").toBe(0);
  });

  it("src/ 里的原生对话框调用点必须等于登记值（三个口径都只准减少）", () => {
    const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".js"));
    for (const [name, registered] of Object.entries(REGISTRY)) {
      let total = 0;
      for (const f of files) total += count(readFileSync(join(SRC_DIR, f), "utf8"), name);
      expect(total, `原生 ${name}() 现存 ${total} 处 ≠ 登记值 ${registered}。`
        + "变多了 = 新代码该用 dangerConfirm / dangerPrompt；变少了 = 把登记值一起调低")
        .toBe(registered);
    }
  });
});
