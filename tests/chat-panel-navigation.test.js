import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
afterEach(() => {
  if (win) win.close();
  win = undefined;
});

async function startPanel() {
  win = loadApp();
  // 等启动完成再操作/关闭窗口，避免 initCrypto 的续体访问已关闭 DOM。
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  win.__test.setActive("overview");
  win.__test.render();
  return win.document;
}

describe("聊天面板真实入口回归", () => {
  it("折叠栏 AI 图标打开 AI 配置页，返回时仍是原页面", async () => {
    const doc = await startPanel();
    const panel = doc.getElementById("chatPanel");
    if (!panel.classList.contains("collapsed")) doc.getElementById("chatPanelCollapse").click();

    doc.getElementById("chatRailAi").click();

    const drawer = doc.getElementById("drawer");
    expect(panel.classList.contains("collapsed")).toBe(false);
    expect(drawer.dataset.page).toBe("ai");
    expect(drawer.classList.contains("drawer-page")).toBe(true);
    expect(doc.getElementById("main").style.display).toBe("none");
    expect(win.__test.getActive()).toBe("overview");
    expect(JSON.parse(win.localStorage.getItem("wb_agent_active"))).toBe("overview");
    win.closeDrawer();
    expect(doc.getElementById("main").style.display).not.toBe("none");
    expect(win.__test.getActive()).toBe("overview");
  });

  it("默认折叠和反复展开不会销毁折叠按钮的 SVG", async () => {
    const doc = await startPanel();
    const panel = doc.getElementById("chatPanel");
    const collapse = doc.getElementById("chatPanelCollapse");
    expect(panel.classList.contains("collapsed")).toBe(true);
    expect(collapse.querySelector("svg")).not.toBeNull();
    doc.getElementById("chatRailExpand").click();
    expect(panel.classList.contains("collapsed")).toBe(false);
    collapse.click();
    expect(panel.classList.contains("collapsed")).toBe(true);
    expect(collapse.querySelector("svg")).not.toBeNull();
  });
});
