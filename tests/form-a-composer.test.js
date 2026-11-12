/**
 * form-a-composer.test.js —— 形态 A B3：Composer 迁移（功能设计 §6 B3 / §3 焦点与 Esc / §4 沉浸扩展）
 * ----------------------------------------------------------------------------
 * 守的契约（壳迁 id 留：既有 id / class 语义 / 持久化键不变，只加形态与行为增量）：
 *  ① 容器带 .composer 类（沉浸规则 §4 选择器命中对象），内部既有 id 链路零改；
 *  ② faCmpToggle 发射：#chatPanelCollapse 静态 data-action + document 委托真通路 click 切态；
 *  ③ 焦点规则（§3）：展开落 #chatTextInput / 收起归还 #chatPanelCollapse；
 *  ④ aria-expanded 与态同步（HTML 初始 false，恢复段后同步）；
 *  ⑤ Esc 栈（§3）：桌面 composer 开着时 Esc 先收 composer；窄屏抽屉分支原样回归；
 *  ⑥ chat_panel_collapsed 语义映射：1=收 / 0=展（键与读写值不变，composer 态语义），恢复双向；
 *  ⑦ __aiPanelExpand / __aiPanelToggle 保名保义（外部入口不被折叠态阻挡）；
 *  ⑧ 40vh 展开口径 + 沉浸 :has() 六条选择器族（静态扫；jsdom 无排版/:has 引擎，
 *     几何真值归 tests/e2e/ui-mode-layout.spec.js 的 40vh 判据）；
 *  ⑨ 窄变异自证：删 handler / 去发射 / 改名 ⇒ 双向红（同 B2 口径，内存字符串不落盘）。
 * 运行：npm test -- form-a-composer
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";
import { scanActionsInSource, parseFormAActions, checkBindings } from "../scripts/lib/bindings-scan.mjs";

const PREFIX = "wb_agent_";
const COLLAPSED_KEY = PREFIX + "chat_panel_collapsed";
const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

function boot(extra) {
  const win = loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });
  windows.push(win);
  return win;
}
async function ready(win) {
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}
const panel = (win) => win.document.getElementById("chatPanel");
const collapseBtn = (win) => win.document.getElementById("chatPanelCollapse");
const input = (win) => win.document.getElementById("chatTextInput");
const esc = (win) => win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

describe("B3 容器契约：壳迁 id 留", () => {
  it("① #chatPanel 带 .composer（沉浸规则命中对象）+ 既有 id 链路零改", async () => {
    const win = await ready(boot());
    const p = panel(win);
    expect(p.classList.contains("composer"), "容器应带 .composer 类（§4 选择器族命中对象）").toBe(true);
    expect(p.classList.contains("chat-panel"), ".chat-panel 类保留（主题/抽屉 CSS 与 R-31 守护不失效）").toBe(true);
    ["chat", "chatForm", "chatTextInput", "chatModelSelect", "chatAttachBtn", "chatSendBtn",
     "chatCancel", "chatThinking", "chatProgress", "chatAttachStrip", "ctxBudgetChip",
     "chatPanelCollapse", "chatSessionBtn", "chatPanelRail", "chatRailExpand", "chatRailAi",
     "chatBackdrop"].forEach((id) => {
      expect(win.document.getElementById(id), "#" + id + " 应在（绑定链路零改）").toBeTruthy();
    });
  });

  it("⑧ 静态口径：40vh 展开上限 + 沉浸 :has() 六条选择器族齐", () => {
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const HTML = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
    expect(HTML, ".chat-panel 展开上限应对齐 40vh").toContain("max-height:40vh");
    ["drawer-page", "page-recycle"].forEach((page) => {
      ["tabbar", "composer", "statusbar"].forEach((shell) => {
        const sel = ":has(" + (page === "drawer-page" ? "#drawer.drawer-page" : ".main.page-recycle") + ") ." + shell;
        expect(HTML, "沉浸规则应隐藏 ." + shell + "（" + page + "）").toContain(sel);
      });
    });
  });
});

describe("B3 委托通路：faCmpToggle", () => {
  it("② click #chatPanelCollapse 经 data-action 委托切 collapsed + 落盘 0/1", async () => {
    const win = await ready(boot());
    const p = panel(win);
    expect(p.classList.contains("collapsed")).toBe(true);
    collapseBtn(win).click();
    expect(p.classList.contains("collapsed"), "展开后应去 collapsed").toBe(false);
    /* save() 内部 JSON.stringify，落盘形态带引号（与 load() 的 JSON.parse 对称） */
    expect(win.localStorage.getItem(COLLAPSED_KEY)).toBe(JSON.stringify("0"));
    collapseBtn(win).click();
    expect(p.classList.contains("collapsed"), "再点应收起").toBe(true);
    expect(win.localStorage.getItem(COLLAPSED_KEY)).toBe(JSON.stringify("1"));
  });

  it("⑨ 窄变异：handler 改名 / 去发射 / 发射改名 ⇒ 双向红（内存字符串，不落盘）", () => {
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const EVENTS = fs.readFileSync(path.join(ROOT, "src", "ui-global-events.js"), "utf8");
    const HTML = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
    const RENDER = fs.readFileSync(path.join(ROOT, "src", "render-entry.js"), "utf8");
    const usedOf = (...texts) => texts.flatMap((t) => scanActionsInSource(t, "mut"));
    const baseline = usedOf(HTML, RENDER);
    const handlers = parseFormAActions(EVENTS);
    expect(checkBindings({ used: baseline, handlers }).ok).toBe(true);

    const m1 = EVENTS.replace("faCmpToggle:", "faCmpTogglex:");
    expect(m1).not.toBe(EVENTS);
    const r1 = checkBindings({ used: baseline, handlers: parseFormAActions(m1) });
    expect(r1.ok).toBe(false);
    /* handler 改名后：发射并集仍有 faCmpToggle（无处理器）→ missing；handlers 多出 faCmpTogglex（无发射）→ dead */
    expect(r1.missingHandler).toEqual(["faCmpToggle"]);
    expect(r1.deadHandler).toEqual(["faCmpTogglex"]);

    const m2 = HTML.replace('data-action="faCmpToggle"', 'data-actionx="faCmpToggle"');
    expect(m2).not.toBe(HTML);
    const r2 = checkBindings({ used: usedOf(m2, RENDER), handlers });
    expect(r2.ok).toBe(false);
    expect(r2.deadHandler).toEqual(["faCmpToggle"]);

    const m3 = HTML.replace('data-action="faCmpToggle"', 'data-action="faCmpTogglex"');
    expect(m3).not.toBe(HTML);
    const r3 = checkBindings({ used: usedOf(m3, RENDER), handlers });
    expect(r3.ok).toBe(false);
    expect(r3.missingHandler).toEqual(["faCmpTogglex"]);
    expect(r3.deadHandler).toEqual(["faCmpToggle"]);
  });
});

describe("B3 行为契约：焦点 / Esc / aria", () => {
  it("③ 展开焦点落 #chatTextInput / 收起归还 #chatPanelCollapse", async () => {
    const win = await ready(boot());
    collapseBtn(win).click();
    expect(win.document.activeElement).toBe(input(win));
    collapseBtn(win).click();
    expect(win.document.activeElement).toBe(collapseBtn(win));
  });

  it("④ aria-expanded 与态同步（初始 false）", async () => {
    const win = await ready(boot());
    expect(collapseBtn(win).getAttribute("aria-expanded")).toBe("false");
    collapseBtn(win).click();
    expect(collapseBtn(win).getAttribute("aria-expanded")).toBe("true");
    collapseBtn(win).click();
    expect(collapseBtn(win).getAttribute("aria-expanded")).toBe("false");
  });

  it("⑤ 桌面 Esc 先收 composer（开着时），焦点随归还", async () => {
    const win = await ready(boot());
    collapseBtn(win).click();
    expect(panel(win).classList.contains("collapsed")).toBe(false);
    esc(win);
    expect(panel(win).classList.contains("collapsed"), "Esc 应收起 composer").toBe(true);
    expect(win.document.activeElement).toBe(collapseBtn(win));
  });

  it("⑤ 窄屏 Esc 分支回归：__aiPanelExpand 开抽屉 → Esc 关抽屉", async () => {
    const win = await ready(boot());
    win.innerWidth = 600;
    win.__aiPanelExpand();
    expect(panel(win).classList.contains("show")).toBe(true);
    esc(win);
    expect(panel(win).classList.contains("show")).toBe(false);
  });
});

describe("B3 外部入口保名保义", () => {
  it("⑦ __aiPanelExpand 桌面分支：收起态调用 → 展开 + 焦点落输入行", async () => {
    const win = await ready(boot());
    expect(typeof win.__aiPanelToggle).toBe("function");
    win.__aiPanelExpand();
    expect(panel(win).classList.contains("collapsed")).toBe(false);
    expect(win.document.activeElement).toBe(input(win));
  });

  it("⑦ __aiPanelToggle 与点击折叠键等价（委托真通路）", async () => {
    const win = await ready(boot());
    win.__aiPanelToggle();
    expect(panel(win).classList.contains("collapsed")).toBe(false);
    win.__aiPanelToggle();
    expect(panel(win).classList.contains("collapsed")).toBe(true);
  });
});

describe("B3 持久化语义映射：1=收 / 0=展（键与值不变）", () => {
  it("⑥ seed 0 → 启动展开 + aria true；seed 1 → 启动收起 + aria false", async () => {
    /* seed 须为落盘形态（save() 内 JSON.stringify）：load() 端 JSON.parse 回 "0"/"1" 再判等 */
    const w0 = await ready(boot({ [COLLAPSED_KEY]: JSON.stringify("0") }));
    expect(panel(w0).classList.contains("collapsed")).toBe(false);
    expect(collapseBtn(w0).getAttribute("aria-expanded")).toBe("true");
    const w1 = await ready(boot({ [COLLAPSED_KEY]: JSON.stringify("1") }));
    expect(panel(w1).classList.contains("collapsed")).toBe(true);
    expect(collapseBtn(w1).getAttribute("aria-expanded")).toBe("false");
  });
});
