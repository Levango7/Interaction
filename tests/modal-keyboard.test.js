/**
 * modal-keyboard.test.js —— 高频浮层的键盘可达性（2026-10-20 P1-4）
 * ----------------------------------------------------------------------------
 * 此前报表/日历等浮层只能点 × 关闭，Tab 焦点会跑到背后的页面里。
 * 本轮加了一条委托键控（ui-global-events 尾部）：
 *   · Esc 关闭最上层已打开的浮层（走它自己的关闭按钮，复用既有清理）；
 *   · Tab / Shift+Tab 在浮层内循环。
 * 这里用真实打开路径（工具箱卡片 → 浮层）验证，不直接调用 openReportModal。
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

async function openToolboxCard(win, id) {
  win.__test.setActive("toolbox");
  win.__test.render();
  const card = win.document.querySelector(`[data-toolbox="${id}"]`);
  expect(card, `工具箱应有 ${id} 卡片`).toBeTruthy();
  card.click();
}

const press = (win, key, opts = {}) =>
  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, ...opts }));

describe("浮层键盘可达性", () => {
  it("报表浮层：Esc 关闭；Tab 把焦点圈进浮层", async () => {
    const win = loadApp();
    windows.push(win);
    await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
    await openToolboxCard(win, "x-report");
    const modal = win.document.getElementById("reportModal");
    expect(modal.classList.contains("show"), "报表应已打开").toBe(true);

    /* 焦点在浮层外时按 Tab → 落到浮层内第一个可聚焦元素 */
    if (win.document.activeElement && win.document.activeElement.blur) win.document.activeElement.blur();
    press(win, "Tab");
    expect(modal.contains(win.document.activeElement), "Tab 后焦点应在浮层内").toBe(true);

    press(win, "Escape");
    expect(modal.classList.contains("show"), "Esc 后报表应关闭").toBe(false);
  });

  it("日历浮层：Esc 关闭", async () => {
    const win = loadApp();
    windows.push(win);
    await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
    await openToolboxCard(win, "x-cal");
    const modal = win.document.getElementById("calendarModal");
    expect(modal.classList.contains("show"), "日历应已打开").toBe(true);
    press(win, "Escape");
    expect(modal.classList.contains("show"), "Esc 后日历应关闭").toBe(false);
  });

  it("未打开任何浮层时 Esc 不产生副作用", async () => {
    const win = loadApp();
    windows.push(win);
    await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
    const before = win.document.querySelectorAll(".show").length;
    press(win, "Escape");
    expect(win.document.querySelectorAll(".show").length).toBe(before);
  });
});
