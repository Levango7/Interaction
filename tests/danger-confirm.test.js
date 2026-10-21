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
   原生 confirm() 债务棘轮
   ---------------------------------------------------------------------
   39 处调用点正分批迁到 dangerConfirm（原生框不可样式化、无 i18n、窄屏由系统渲染）。
   2026-10-21 首批迁掉 4 处（会话删除 / 日历源删除 / 笔记删除 / 知识库文件删除）⇒ 35；
   第二批迁掉 8 处（GitHub token 清除 / WebDAV 配置清除 / API Key 吊销 ×2 / AI 会话历史清除 /
   工作记忆清空 / 联动规则重置 / 联动规则删除）⇒ 27；
   第三批迁掉 3 处（导入覆盖确认 / 恢复前快照回滚 / 恢复前快照删除）⇒ 27→24；
   第四批迁掉 2 处（清空全部数据 doClear / 集成任务推送 [data-int-push]）⇒ 27→24→22；
   第五批迁掉 10 处（ui-drawer 5：场景删除 / Profile 删除 / 模板导入 / 插件卸载 /
   自定义主题删除；ui-scene-bind 5：删除任务 ×3 / 删除记录 / 批量删除）⇒ 现值 12。
   第五批最值得记的一处：`batchDelete()` 有返回值（`return n`），改 async 后返回的是
   **Promise<number>** —— 它唯一的调用方 `ui-scene-bind.js` 里原本写的是
   `batchDelete(); render();`，不 await 的话 `render()` 会抢在确认框之前执行，
   而用户点完确认、删除真正发生之后反倒**没人刷新界面**（batchDelete 内部只
   `_renderBatchUI()`，不做整体 render）。已改为 `await batchDelete(); render();`。
   第四批的两个特殊点，改之前值得先看一眼：
     · `doClear` 改 async 后，两个调用方（`ui-global-events.js:34` 的 `onclick = doClear`、
       `ui-palette.js:153` 命令面板 `run:doClear`）**刻意不 await** —— 清空是"点了就走"的
       一次性动作，调用方不关心结果，且 doClear 内部不抛，不会引入新的失败模式；
     · 两个既有用例在 `vi.useFakeTimers()` 下调 doClear，`autoDangerConfirm` 接盘器在那里
       **失效**（它靠 setTimeout 轮询，而 fake timers 把 setTimeout 也假掉了）。
       正解是"先拿 Promise → 同步点掉确认按钮 → 再 await"：浮层在 Promise executor 里
       同步挂 DOM，点掉之后的后续走微任务，而微任务不受 fake timers 影响。
   上限钉成**相等**而不是"≤"：新增原生确认要红，迁移掉一处不 lowering 常量也要红。
   计数前必须剥注释 —— 组件自己的文档注释里就写着"原生 confirm()"，
   不剥会把 39 数成 40（实测踩过）。
   ═══════════════════════════════════════════════════════════════════════ */
describe("原生 confirm() 债务棘轮", () => {
  const NATIVE_CONFIRM_TOTAL = 12;
  const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

  const stripComments = (code) => code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); /* 前缀排除 ":" → 不吃 http:// 里的 // */

  const countNativeConfirm = (code) =>
    [...stripComments(code).matchAll(/(?:window\.)?confirm\s*\(/g)].length;

  it("计数函数有射程：调用要数到、注释里的字面量不能数进来", () => {
    const sample = 'if(confirm("a")){}\nwindow.confirm("b");\n// 原生 confirm("c") 是坏的\n/* confirm("d") */\nconst u="http://x/y";';
    expect(countNativeConfirm(sample), "两处真调用要数到，注释里那两处字面量不能数").toBe(2);
    /* 已知粗口径：字符串字面量里真写了 "confirm(" 也会被数进来。
       靠"常量与实际相等"兜住 —— 一旦误报就当场显形，不会静默累积。 */
    expect(countNativeConfirm("function closeConfirmModal(){} openConfirmModal(); dismissDangerConfirm();"))
      .toBe(0);
  });

  it("src/ 里的原生 confirm 调用点必须等于登记值（只准减少）", () => {
    const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".js"));
    let total = 0;
    for (const f of files) total += countNativeConfirm(readFileSync(join(SRC_DIR, f), "utf8"));
    expect(total, `原生 confirm 现存 ${total} 处 ≠ 登记值 ${NATIVE_CONFIRM_TOTAL}。`
      + "变多了 = 新代码该用 dangerConfirm；变少了 = 把 NATIVE_CONFIRM_TOTAL 一起调低")
      .toBe(NATIVE_CONFIRM_TOTAL);
  });
});
