/**
 * rail-sections.test.js —— 右栏分节（形态 A B4，2026-11-13：四 tab 分页 → 四节堆叠）
 * 只认真实数据：技能来自 listEnabledSkills（真注入提示词的那份），文件来自 getRagFiles；
 * 并反向钉住「MCP 不出现」——它仍是配置壳，不能作为能力入口展示。
 * 折叠态持久化 form_a_rr_sec（收起的节 id 数组）；本文件由 rail-tabs.test.js 逐条映射而来
 * （判据零放宽：四条用例各对应原分页契约的一条，只把「切 tab 显 pane」改写为「节常显＋可折叠」）。
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
const sec = (win, name) => win.document.querySelector('#taskRail .rr-sec[data-rr-sec="' + name + '"]');

describe("右栏分节", () => {
  it("默认四节都在且全展开；今日节含任务列表；不含 MCP", () => {
    const win = boot();
    const secs = win.document.querySelectorAll("#taskRail .rr-sec");
    expect(secs.length).toBe(4);
    ["today", "agent", "files", "sessions"].forEach(function(name){
      expect(sec(win, name).classList.contains("closed"), name + " 节默认应展开").toBe(false);
    });
    win.document.querySelectorAll("#taskRail .rr-sec-toggle").forEach(function(b){
      expect(b.getAttribute("aria-expanded")).toBe("true");
    });
    /* 首节 today 即原今日任务轨：列表与「全部任务」都在 */
    expect(win.document.getElementById("taskRailList")).not.toBeNull();
    expect(win.document.getElementById("taskRailMore")).not.toBeNull();
    expect(win.document.querySelector("#taskRail").textContent).not.toContain("MCP");
  });

  it("折叠态脏值（非法 id）被滤；退役键 rail_tab 残留值不再被读（零迁移）", () => {
    /* 窄变异自证：① 持久化数组混入非法 id 时只认合法节（防损坏值炸栏）；
       ② 旧 rail_tab 的陈旧值对新代码不可见（退役键不承载迁移负担，控制态非业务数据）。 */
    const win = loadApp({ storage: { wb_agent_onboarded: "true",
      "wb_agent_form_a_rr_sec": JSON.stringify(["bogus", "agent"]),
      "wb_agent_rail_tab": JSON.stringify("agent") } });
    windows.push(win);
    win.__test.setActive("office");
    win.render();
    expect(Array.from(win._railSecClosedSet())).toEqual(["agent"]);
    expect(sec(win, "today").classList.contains("closed")).toBe(false);
    expect(sec(win, "agent").classList.contains("closed")).toBe(true);
  });

  it("Agent 节列真实技能 + AI 状态；折叠/展开往返与持久化都对", () => {
    const win = boot();
    win.saveAiConfig("skills", { custom: JSON.stringify([{ name: "周报流程", trigger: ["周报"], prompt: "写周报" }]) });
    win.renderTaskRail();
    const btn = sec(win, "agent").querySelector(".rr-sec-toggle");
    /* 折叠前的内容判据（原「Agent 页」契约：真实技能 + AI 状态，节常显） */
    expect(win.document.getElementById("railAgentPane").textContent).toContain("周报流程");
    expect(win.document.getElementById("railAgentPane").textContent).toContain("AI 状态");
    btn.click();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(sec(win, "agent").classList.contains("closed")).toBe(true);
    expect(JSON.parse(win.localStorage.getItem("wb_agent_form_a_rr_sec"))).toEqual(["agent"]);
    /* 节间独立：折 agent 不影响 today 节 */
    expect(sec(win, "today").classList.contains("closed")).toBe(false);
    btn.click();
    expect(sec(win, "agent").classList.contains("closed")).toBe(false);
    expect(JSON.parse(win.localStorage.getItem("wb_agent_form_a_rr_sec"))).toEqual([]);
  });

  it("文件节列知识库文件（含块数），按钮能打开知识库", async () => {
    const win = boot();
    await win.ragImportText("周报.txt", "第一段\n\n第二段", { preExtracted: true });
    win.renderTaskRail();
    const body = win.document.getElementById("railFilesPane");
    expect(body.closest(".rr-sec").classList.contains("closed")).toBe(false);
    expect(body.textContent).toContain("周报.txt");
    expect(body.textContent).toContain("块");
    win.document.getElementById("railOpenKb").click();
    expect(win.document.getElementById("knowledgeBaseModal").classList.contains("show")).toBe(true);
  });

  it("会话节列真实会话，当前高亮，点击即切换（2026-11-07 起）", () => {
    const win = boot();
    const s1 = win.createSession("office", "会话甲");
    const s2 = win.createSession("office", "会话乙");
    win.switchSession(s1.id);
    win.renderTaskRail();
    const sp = win.document.getElementById("railSessionPane");
    expect(sp.closest(".rr-sec").classList.contains("closed"), "会话节默认必须可见").toBe(false);
    expect(sp.textContent).toContain("会话甲");
    expect(sp.textContent).toContain("会话乙");
    const activeLi = sp.querySelector(".rail-item.is-active");
    expect(activeLi ? activeLi.textContent.indexOf("会话甲") >= 0 : false).toBe(true);
    const target = Array.prototype.slice.call(sp.querySelectorAll("[data-rail-sess]"))
      .find((x) => x.textContent.indexOf("会话乙") >= 0);
    target.click();
    expect(win.getActiveSession()).toBe(s2.id);
  });
});
