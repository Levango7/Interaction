/**
 * toolbox-labs.test.js —— 工具箱「常用 + 实验」分层（2026-10-20 P1-2）
 * ----------------------------------------------------------------------------
 * 背景：工具箱曾与主流程抢首屏（36 张卡平铺）。P1-2 把它降为「实验室」：
 *   5 个高频工具进"常用"，其余进"实验"折叠区（默认收起、卡片标"实验"）。
 * 三条硬判据：
 *   ① 默认态：常用卡在页面上、实验卡在 hidden 容器里（不是"看不见但仍在布局里"）；
 *   ② 展开后：实验卡仍可点开（不能因为折叠把入口弄死）；
 *   ③ 搜索：命中实验工具时**自动展开**（搜到了却还藏着 = 用户以为没有）。
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

async function startToolbox() {
  const win = loadApp();
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  win.__test.setActive("toolbox");
  win.__test.render();
  return win;
}

describe("工具箱：常用 + 实验分层", () => {
  it("默认只展示常用，实验区折叠且标「实验」；常用里的 JSON 卡可达", async () => {
    const win = await startToolbox();
    const main = win.document.getElementById("main");
    expect(main.textContent).toContain("常用");
    const labs = win.document.getElementById("toolboxLabs");
    expect(labs, "应有实验区容器").toBeTruthy();
    expect(labs.hasAttribute("hidden"), "实验区默认必须收起").toBe(true);
    expect(main.querySelector('[data-toolbox="cod-json"]'), "JSON 在常用区").toBeTruthy();
    expect(labs.querySelector('[data-toolbox="x-gantt"]'), "甘特图在实验区").toBeTruthy();
    expect(labs.textContent, "实验卡要带标注").toContain("实验");
  });

  it("展开实验区后仍可点开（不能被折叠弄成死入口）", async () => {
    const win = await startToolbox();
    const toggle = win.document.getElementById("toolboxLabsToggle");
    expect(toggle, "应有展开按钮").toBeTruthy();
    toggle.click();
    const labs = win.document.getElementById("toolboxLabs");
    expect(labs.hasAttribute("hidden"), "点击后应展开").toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const gantt = labs.querySelector('[data-toolbox="x-gantt"]');
    gantt.click();
    expect(win.document.getElementById("ganttModal").classList.contains("show")).toBe(true);
  });

  it("搜索命中实验工具时自动展开（搜到了不能藏起来）", async () => {
    const win = await startToolbox();
    const q = win.document.getElementById("toolboxQ");
    q.value = "甘特";
    q.dispatchEvent(new win.Event("input", { bubbles: true }));
    const labs = win.document.getElementById("toolboxLabs");
    expect(labs, "搜索命中时应有实验区").toBeTruthy();
    expect(labs.hasAttribute("hidden"), "搜索命中实验工具时必须自动展开").toBe(false);
    expect(labs.querySelector('[data-toolbox="x-gantt"]')).toBeTruthy();
  });
});
