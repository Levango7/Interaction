/**
 * mobile-chat-drawer.test.js —— 窄屏聊天抽屉可达性（台账 R-31，2026-10-22 修）
 * ----------------------------------------------------------------------------
 * 缺陷（先于布局 v2 存在）：≤767 的面板靠 `.chat-panel.show` 滑入，但全仓没有任何代码
 * 给它加 `.show` —— 场景头「问 AI 助手」只清 `.collapsed`，抽屉仍停在 `translateX(100%)`。
 * 本文件钉**类契约**（jsdom 无排版引擎，几何判据在 tests/e2e/layout-v2.spec.js）：
 *   ① 窄屏从真实入口打开 → `.show` + 遮罩显示，且移除 `.collapsed`（否则手机上仍是收起态）；
 *   ② 关闭路径三条：折叠键、遮罩、Esc；
 *   ③ 桌面行为不变：折叠键仍切换 `.collapsed`，不碰 `.show`。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const AI_CFG = JSON.stringify({ enabled: true, base: "https://example.invalid/v1", key: "test-key" });

async function boot(width) {
  const win = loadApp({ storage: { wb_agent_cfg: AI_CFG } });
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  win.innerWidth = width;
  win.__test.setActive("office");
  win.__test.render();
  return win;
}

const shown = (win) => win.document.getElementById("chatPanel").classList.contains("show");
const backdropShown = (win) => {
  const bd = win.document.getElementById("chatBackdrop");
  return !!bd && bd.hidden === false && bd.classList.contains("show");
};

describe("窄屏聊天抽屉（R-31）", () => {
  it("从「问 AI 助手」打开：.show + 遮罩，且不再是 collapsed", async () => {
    const win = await boot(600);
    const panel = win.document.getElementById("chatPanel");
    expect(panel.classList.contains("collapsed"), "默认态是收起（布局 v2）").toBe(true);
    const btn = win.document.getElementById("phAiAskBtn");
    expect(btn, "场景头应有「问 AI 助手」").toBeTruthy();
    btn.click();
    await vi.waitFor(() => expect(shown(win)).toBe(true));
    expect(panel.classList.contains("collapsed"), "打开抽屉必须同时展开历史").toBe(false);
    expect(backdropShown(win), "遮罩应显示").toBe(true);
  });

  it("三条关闭路径：折叠键 / 遮罩 / Esc", async () => {
    const win = await boot(600);
    win.document.getElementById("phAiAskBtn").click();
    await vi.waitFor(() => expect(shown(win)).toBe(true));
    win.document.getElementById("chatPanelCollapse").click();
    expect(shown(win)).toBe(false);
    expect(backdropShown(win)).toBe(false);

    win.__aiPanelExpand();
    expect(shown(win)).toBe(true);
    win.document.getElementById("chatBackdrop").click();
    expect(shown(win)).toBe(false);

    win.__aiPanelExpand();
    expect(shown(win)).toBe(true);
    win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(shown(win), "Esc 应关闭抽屉").toBe(false);
  });

  it("桌面行为不变：折叠键切 .collapsed，不碰 .show", async () => {
    const win = await boot(1280);
    const panel = win.document.getElementById("chatPanel");
    win.document.getElementById("chatPanelCollapse").click();
    expect(panel.classList.contains("collapsed")).toBe(false);
    expect(panel.classList.contains("show")).toBe(false);
    win.document.getElementById("chatPanelCollapse").click();
    expect(panel.classList.contains("collapsed")).toBe(true);
  });
});
