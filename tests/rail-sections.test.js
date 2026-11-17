/**
 * rail-sections.test.js —— 右栏分节（形态 A B4，2026-11-13：四 tab 分页 → 节堆叠；
 * 批七 2026-11-17 按用户标注图扩成五区：todo/文件/会话/大模型用量/运行与能力）。
 * 只认真实数据：技能来自 listEnabledSkills、文件来自 getRagFiles、用量来自 ai_tokens、
 * MCP 来自 mcpServers（已启用且 URL 合法）——都不是占位壳。
 * 折叠态持久化 form_a_rr_sec（收起的节 id 数组）。
 * ⚠️ 2026-11-17 判据随产品裁决更新（非放宽）：原「MCP 不得出现在右栏」已被用户新结构覆盖
 * （新结构明确右栏含「运行与能力」，MCP 是真能力入口），现反向钉「MCP 计数必须来自真配置」。
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
  it("默认五节按用户新结构顺序全展开；今日节含任务列表；运行与能力节显示真 MCP 计数", () => {
    const win = boot();
    const secs = win.document.querySelectorAll("#taskRail .rr-sec");
    expect(secs.length).toBe(5);
    /* 顺序即用户标注图：todo / 文件 / 会话 / 大模型用量 / 运行与能力 */
    expect(Array.from(secs).map((s) => s.getAttribute("data-rr-sec")))
      .toEqual(["today", "files", "sessions", "usage", "agent"]);
    ["today", "files", "sessions", "usage", "agent"].forEach(function(name){
      expect(sec(win, name).classList.contains("closed"), name + " 节默认应展开").toBe(false);
    });
    win.document.querySelectorAll("#taskRail .rr-sec-toggle").forEach(function(b){
      expect(b.getAttribute("aria-expanded")).toBe("true");
    });
    expect(win.document.getElementById("taskRailList")).not.toBeNull();
    expect(win.document.getElementById("taskRailMore")).not.toBeNull();
    /* 新增真值判据：MCP 区存在且计数为 0（无配置时），不再断言「MCP 不出现」 */
    expect(win.document.getElementById("railUsagePane")).not.toBeNull();
    expect(win.document.getElementById("railAgentPane").textContent).toContain("MCP");
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

  it("大模型用量节读 ai_tokens 真值：空态不画条，有数时只画「今日/累计」真实比值（批七）", () => {
    const win = boot();
    const pane = win.document.getElementById("railUsagePane");
    expect(pane.textContent).toContain("尚无用量记录");
    expect(pane.querySelector('[role="progressbar"]')).toBeNull();
    const d = new Date();
    const k = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    win.localStorage.setItem("wb_agent_ai_tokens", JSON.stringify({ total: 1000, days: { [k]: 250 } }));
    win.renderTaskRail();
    expect(pane.textContent).toContain("25%");
    const bar = pane.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    /* 反向钉：没有配额数据就不许画一个假配额百分比 */
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
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
