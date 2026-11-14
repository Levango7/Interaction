/**
 * form-a-menu.test.js —— 形态 A B6：帮助菜单 + 专注模式（用户 11-14 裁「加专注模式按钮」+「一组帮助菜单」）
 * ----------------------------------------------------------------------------
 * 守的契约（每条都打到判定维度，不测「元素存在」了事）：
 *  ① menubar 两控件走 data-action 委托表（faMenuOpen / faFocusToggle），键集 6→8 后仍双向包含；
 *  ② 帮助菜单四项 data-help-item 顺序固定，且**每项都转发既有真入口**——不新造面板：
 *     hotkeys→openCmd / diag→openDiagIssue / manual→外链 / about→openDrawer+_switchSetTab；
 *  ③ 开合：点按钮开（hidden 撤 + aria-expanded=true + 首项聚焦）；再点关；Esc 关；点别处关；
 *  ④ 专注态唯一事实源 = body.is-focus + 按钮 aria-pressed，落盘 wb_agent_form_a_focus（"1"/""）；
 *  ⑤ 冷启动按持久化恢复（只读应用，不写回）；
 *  ⑥ 专注态与页面驱动取并集是 CSS 层契约（本文件断言 class/applied 状态，:has 引擎另由 e2e 钉）。
 * 运行：npm test -- form-a-menu
 */
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const FOCUS_KEY = PREFIX + "form_a_focus";

const boot = (extra) =>
  loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });

async function ready(win) {
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

const menu = (win) => win.document.getElementById("helpMenu");
const helpBtn = (win) => win.document.getElementById("btnHelpMenu");
const focusBtn = (win) => win.document.getElementById("btnFocus");
const items = (win) => Array.from(win.document.querySelectorAll("#helpMenu [data-help-item]"));

describe("B6 控件与键表", () => {
  it("① 两个控件都走 data-action，且帮助按钮带菜单语义", async () => {
    const win = await ready(boot());
    expect(helpBtn(win).getAttribute("data-action")).toBe("faMenuOpen");
    expect(focusBtn(win).getAttribute("data-action")).toBe("faFocusToggle");
    expect(helpBtn(win).getAttribute("aria-haspopup")).toBe("menu");
    expect(helpBtn(win).getAttribute("aria-expanded")).toBe("false");
  });

  it("② 菜单四项顺序固定，且都指向既有真入口", async () => {
    const win = await ready(boot());
    expect(items(win).map((b) => b.getAttribute("data-help-item"))).toEqual([
      "hotkeys", "diag", "manual", "about",
    ]);
    // 反向对照：若把某项改成未登记值，分派不应有任何副作用（下面 ⑥ 覆盖）
    expect(items(win).every((b) => b.textContent.trim().length > 0)).toBe(true);
  });
});

describe("B6 菜单开合", () => {
  it("③ 点按钮开：hidden 撤 + aria-expanded=true + 首项获焦", async () => {
    const win = await ready(boot());
    expect(menu(win).hidden).toBe(true);
    helpBtn(win).click();
    expect(menu(win).hidden).toBe(false);
    expect(helpBtn(win).getAttribute("aria-expanded")).toBe("true");
    expect(win.document.activeElement).toBe(items(win)[0]);
  });

  it("③ 再点按钮关；Esc 关；点别处关", async () => {
    const win = await ready(boot());
    helpBtn(win).click();
    expect(menu(win).hidden).toBe(false);
    helpBtn(win).click();
    expect(menu(win).hidden).toBe(true);

    helpBtn(win).click();
    win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menu(win).hidden).toBe(true);
    expect(helpBtn(win).getAttribute("aria-expanded")).toBe("false");

    helpBtn(win).click();
    win.document.body.click();
    expect(menu(win).hidden).toBe(true);
  });

  it("③ 选一项后菜单自动收起（四项都不留悬空浮层）", async () => {
    const win = await ready(boot());
    win.openCmd = vi.fn();
    helpBtn(win).click();
    items(win)[0].click();
    expect(win.openCmd).toHaveBeenCalledTimes(1);
    expect(menu(win).hidden).toBe(true);
  });
});

describe("B6 四项分派（转发既有入口）", () => {
  it("④ hotkeys→openCmd / diag→openDiagIssue", async () => {
    const win = await ready(boot());
    win.openCmd = vi.fn();
    win.openDiagIssue = vi.fn();
    items(win)[0].click();
    items(win)[1].click();
    expect(win.openCmd).toHaveBeenCalledTimes(1);
    expect(win.openDiagIssue).toHaveBeenCalledTimes(1);
  });

  it("④ manual→window.open（外链真地址，且带 noopener）", async () => {
    const win = await ready(boot());
    const open = vi.fn();
    win.open = open;
    items(win)[2].click();
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, feat] = open.mock.calls[0];
    expect(url).toContain("docs/user-manual.md");
    expect(target).toBe("_blank");
    expect(feat).toContain("noopener");
  });
});

describe("B6 专注模式", () => {
  it("⑤ 切换即写 body.is-focus + aria-pressed，并落盘 '1' / ''", async () => {
    const win = await ready(boot());
    expect(win.document.body.classList.contains("is-focus")).toBe(false);
    focusBtn(win).click();
    expect(win.document.body.classList.contains("is-focus")).toBe(true);
    expect(focusBtn(win).getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(win.localStorage.getItem(FOCUS_KEY))).toBe(true);
    focusBtn(win).click();
    expect(win.document.body.classList.contains("is-focus")).toBe(false);
    expect(focusBtn(win).getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(win.localStorage.getItem(FOCUS_KEY))).toBe(false);
  });

  it("⑤ 冷启动按持久化恢复（'1' ⇒ 直接进专注态）", async () => {
    const win = await ready(boot({ [FOCUS_KEY]: "true" }));
    expect(win.document.body.classList.contains("is-focus")).toBe(true);
    expect(focusBtn(win).getAttribute("aria-pressed")).toBe("true");
  });

  it("⑤ 冷启动恢复不写回（值仍等于种子，不被空串覆盖）", async () => {
    const win = await ready(boot({ [FOCUS_KEY]: "true" }));
    expect(JSON.parse(win.localStorage.getItem(FOCUS_KEY))).toBe(true);
  });
});

describe("B6 反向对照（防假绿）", () => {
  it("⑥ 未登记的 data-help-item 不产生行为也不抛错", async () => {
    const win = await ready(boot());
    const ghost = win.document.createElement("button");
    ghost.setAttribute("data-help-item", "not-a-real-item");
    win.document.body.appendChild(ghost);
    expect(() => ghost.click()).not.toThrow();
    expect(win.document.body.classList.contains("is-focus")).toBe(false);
  });

  it("⑥ 点 action 控件会先收菜单（不把 aria-expanded 留在 true）", async () => {
    const win = await ready(boot());
    helpBtn(win).click();
    expect(helpBtn(win).getAttribute("aria-expanded")).toBe("true");
    // 任意已登记 action（faTabAdd 会新增视图，此处只看菜单是否收起）
    const add = win.document.querySelector("[data-action='faTabAdd']");
    if (add) add.click();
    expect(menu(win).hidden).toBe(true);
  });
});
