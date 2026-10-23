/**
 * rail-tabs.test.js —— 右栏分页（今日 / Agent / 文件，2026-10-23）
 * 只认真实数据：技能来自 listEnabledSkills（真注入提示词的那份），文件来自 getRagFiles；
 * 并反向钉住「MCP 不出现」——它仍是配置壳，不能作为能力入口展示。
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

function boot() {
  const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
  windows.push(win);
  win.__test.setActive("office");
  win.render();
  return win;
}
const pane = (win, name) => win.document.querySelector('#taskRail [data-rail-pane="' + name + '"]');

describe("右栏分页", () => {
  it("默认今日；三个页签都在，Agent/文件默认隐藏", () => {
    const win = boot();
    const tabs = win.document.querySelectorAll("#taskRail [data-rail-tab]");
    expect(tabs.length).toBe(3);
    expect(pane(win, "today").classList.contains("u-hidden")).toBe(false);
    expect(pane(win, "agent").classList.contains("u-hidden")).toBe(true);
    expect(pane(win, "files").classList.contains("u-hidden")).toBe(true);
    expect(win.document.querySelector("#taskRail").textContent).not.toContain("MCP");
  });

  it("Agent 页列真实技能 + AI 状态；切换后 aria 与持久化都对", () => {
    const win = boot();
    win.saveAiConfig("skills", { custom: JSON.stringify([{ name: "周报流程", trigger: ["周报"], prompt: "写周报" }]) });
    win.renderTaskRail();
    const tab = win.document.querySelector('[data-rail-tab="agent"]');
    tab.click();
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(pane(win, "agent").classList.contains("u-hidden")).toBe(false);
    expect(win.document.getElementById("railAgentPane").textContent).toContain("周报流程");
    expect(win.document.getElementById("railAgentPane").textContent).toContain("AI 状态");
    expect(JSON.parse(win.localStorage.getItem("wb_agent_rail_tab"))).toBe("agent");
  });

  it("文件页列知识库文件（含块数），按钮能打开知识库", async () => {
    const win = boot();
    await win.ragImportText("周报.txt", "第一段\n\n第二段", { preExtracted: true });
    win.renderTaskRail();
    win.document.querySelector('[data-rail-tab="files"]').click();
    const filesPane = win.document.getElementById("railFilesPane");
    expect(filesPane.textContent).toContain("周报.txt");
    expect(filesPane.textContent).toContain("块");
    win.document.getElementById("railOpenKb").click();
    expect(win.document.getElementById("knowledgeBaseModal").classList.contains("show")).toBe(true);
  });
});
