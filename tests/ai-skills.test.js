/**
 * Skills 引擎（v3.7.59）· 用例验证
 * ----------------------------------------------------------------------------
 * 验证对象：「扩展 → 技能配置」里那份自定义 JSON 从"只写不读"变成真能力之后的三条通路：
 *   ① skillsPromptBlock()/chatSysPrompt()  技能注入系统提示（模型真的看得见）
 *   ② findSkill()/buildCmds()/sendChatText()  命令面板「技能」组一键触发
 *   ③ noteSkillOffer()/commitPendingSkill()  一轮成功执行 ≥2 个工具后可固化为新技能
 * 以及"不误伤"：无技能时系统提示逐字节不变、普通输入不被命令词吞掉、坏 JSON 不抛异常、
 * 危险工具（delete/update/forget）不会被沉淀进技能。
 *
 * 访问方式：顶层 function 声明在 classic <script> 下挂到 window，直接 win.xxx 调用；
 * pendingSkillOffer / skillsJsonError 是 `let`（词法绑定，不是 window 属性），
 * 故一律通过 getPendingSkillOffer() 与可观测副作用来断言。
 * chatOnce 按 p0-regression.test.js 的既有做法直接覆盖 window.chatOnce 来 mock。
 *
 * 运行：npx vitest run tests/ai-skills.test.js
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** 干净 window（每次新 jsdom，互不污染 localStorage）；#chatForm/#chat 是静态 HTML，不必 render */
async function boot(storage = {}) {
  const win = loadApp({ storage });
  win.localStorage.clear();
  await new Promise((r) => setTimeout(r, 60));
  win.__test.setActive("office");
  return win;
}

/** 写「扩展 → 技能配置」的自定义 JSON（与生产同一条 saveAiConfig 路径） */
function putCustom(win, value) {
  win.__test.saveAiConfig("skills", { custom: typeof value === "string" ? value : JSON.stringify(value) });
}

/** 驱动 onChatSubmit（沿用 p0-regression 的 fakeEvent 契约：f=e.target、text=f.msg.value）。
 *  直接 await 比走 DOM 提交更好：能确定整条链路（含多轮工具循环）已经跑完。
 *  真实 DOM 提交路径（sendChatText → #chatForm.submit）在 ② 的用例里单独覆盖。 */
async function submitChat(win, text) {
  await win.onChatSubmit({ preventDefault() {}, target: { msg: { value: text } } });
  await new Promise((r) => setTimeout(r, 20));
}

/** 一轮 tool_calls（create_task + add_record 都成功）后再回文本的 mock；返回收到的 messages */
function mockTwoRoundTools(win, calls) {
  win.chatOnce = async (messages) => {
    calls.push(messages);
    if (calls.length === 1) {
      return { choices: [{ message: { role: "assistant", content: "", tool_calls: [
        { id: "c1", type: "function", function: { name: "create_task", arguments: JSON.stringify({ title: "技能验证任务", scenario: "office" }) } },
        { id: "c2", type: "function", function: { name: "add_record", arguments: JSON.stringify({ scenario: "office", text: "跑通技能固化" }) } },
      ] } }] };
    }
    return { choices: [{ message: { role: "assistant", content: "已完成" } }] };
  };
}

const SKILL_WEEKLY = {
  name: "周报流程",
  desc: "先汇总报表再建跟进任务",
  prompt: "1. generate_report 生成本周报表\n2. create_task 建跟进任务",
  tools: ["generate_report", "create_task"],
  trigger: ["weekly"],
  enabled: true,
};

/* =========================================================================
 * ① 注入系统提示
 * ========================================================================= */
describe("① Skills · 注入系统提示", () => {
  it("无启用技能时 skillsPromptBlock 为空串，chatSysPrompt 与改动前逐字节一致", async () => {
    const win = await boot();
    expect(win.skillsPromptBlock("随便说点什么")).toBe("");
    const sys = win.chatSysPrompt("随便说点什么");
    expect(sys).not.toContain("用户自定义技能");
    // 与"存了一条空数组"的同窗对照：两者必须完全相等，才算真的没往提示里加东西
    const win2 = await boot();
    putCustom(win2, []);
    expect(win2.chatSysPrompt("随便说点什么")).toBe(sys);
    putCustom(win2, [{ name: "禁用项", desc: "d", enabled: false }]);
    expect(win2.chatSysPrompt("随便说点什么")).toBe(sys);
  });

  it("写入 aiSkillsCustom 后 chatSysPrompt 真的带上技能（v3.7.58 之前这条是假的）", async () => {
    const win = await boot();
    const before = win.chatSysPrompt("帮我出个周报");
    putCustom(win, [SKILL_WEEKLY]);
    const after = win.chatSysPrompt("帮我出个周报");
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.startsWith(before)).toBe(true); // 原有条目一个不少，技能段追加在末尾
    expect(after).toContain("【用户自定义技能】");
    expect(after).toContain("周报流程");
    expect(after).toContain("generate_report, create_task");
  });

  it("cfg.agent=false 时技能段同样注入（技能描述的是工具用法，与 Agent 模式正交）", async () => {
    const win = await boot();
    // _resetCrypto 清掉 _cfgCache，否则 getCfg() 会读到启动时缓存的明文（沿用 ai-enhance.test.js 的做法）
    win.__test._resetCrypto();
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ agent: false }));
    putCustom(win, [SKILL_WEEKLY]);
    expect(win.chatSysPrompt("出周报")).toContain("周报流程");
    expect(win.agentContextPrompt("出周报")).toBe(""); // Agent 关时记忆/目标段仍为空
  });

  it("多种 JSON 写法都能解析：数组 / {skills:[…]} / 单对象；enabled:false 被剔除", async () => {
    const win = await boot();
    putCustom(win, [SKILL_WEEKLY]);
    expect(win.listEnabledSkills().map((s) => s.name)).toEqual(["周报流程"]);
    putCustom(win, { skills: [SKILL_WEEKLY, { name: "停用项", desc: "x", enabled: false }] });
    expect(win.listEnabledSkills().map((s) => s.name)).toEqual(["周报流程"]);
    putCustom(win, { name: "单对象写法", desc: "d" });
    expect(win.listEnabledSkills().map((s) => s.name)).toEqual(["单对象写法"]);
    // 没写 enabled 默认启用
    expect(win.normalizeSkill({ name: "n", desc: "d" }).enabled).toBe(true);
  });

  it("坏 JSON 安全降级：不抛异常、技能为空、系统提示不受影响", async () => {
    const win = await boot();
    putCustom(win, "[{\"name\":\"半截\",");
    expect(win.listEnabledSkills()).toEqual([]);
    expect(win.skillsPromptBlock("任意")).toBe("");
    expect(() => win.chatSysPrompt("任意")).not.toThrow();
  });

  it("工具名校验：拼错的名字与危险工具都不进「建议工具」（防引导模型幻觉调用/自动固化出删除流程）", async () => {
    const win = await boot();
    const sk = win.normalizeSkill({ name: "t", desc: "d", tools: ["create_task", "delete_task", "update_task", "forget", "no_such_tool", "remember"] });
    expect(sk.tools).toEqual(["create_task", "remember"]);
  });

  it("相关性优先 + 条数上限 6（防 token 膨胀）", async () => {
    const win = await boot();
    const many = [];
    for (let i = 0; i < 10; i++) many.push({ name: "流程" + i, desc: "说明" + i, prompt: "做" + i, enabled: true });
    many[9].name = "周报流程";
    many[9].desc = "生成周报";
    putCustom(win, many);
    expect(win.listEnabledSkills().length).toBe(10);
    const block = win.skillsPromptBlock("帮我写周报");
    expect(block).toContain("周报流程");
    expect(block.split("\n- ").length - 1).toBe(6); // 只注入 6 条
    expect(block.indexOf("周报流程")).toBeLessThan(block.indexOf("流程0")); // 命中的排最前
  });

  it("技能名缺失的条目被丢弃，不产生空段", async () => {
    const win = await boot();
    putCustom(win, [{ desc: "没有名字" }, { name: "", desc: "空名字" }]);
    expect(win.listSkills()).toEqual([]);
    expect(win.skillsPromptBlock("x")).toBe("");
  });
});

/* =========================================================================
 * ② 命令面板一键触发
 * ========================================================================= */
describe("② Skills · 命令面板与一键触发", () => {
  it("findSkill：精确名 / 忽略大小写 / 触发词都能命中，未定义则返回 null", async () => {
    const win = await boot();
    putCustom(win, [SKILL_WEEKLY, { name: "Reading", desc: "d", enabled: true }]);
    expect(win.findSkill("周报流程").name).toBe("周报流程");
    expect(win.findSkill(" 周报流程 ").name).toBe("周报流程");
    expect(win.findSkill("weekly").name).toBe("周报流程");
    expect(win.findSkill("reading").name).toBe("Reading");
    expect(win.findSkill("不存在的技能")).toBeNull();
  });

  it("buildCmds 里出现「技能」组，中文子串能搜到", async () => {
    const win = await boot();
    putCustom(win, [SKILL_WEEKLY]);
    const all = win.buildCmds("");
    const hit = all.find((it) => it.label === "周报流程");
    expect(hit, "命令面板应有该技能一条").toBeTruthy();
    expect(hit.group).toBe(win.t("cmd.skill", "技能"));
    expect(hit.sub).toBe(SKILL_WEEKLY.desc);
    expect(typeof hit.run).toBe("function");
    expect(win.buildCmds("周报").some((it) => it.label === "周报流程")).toBe(true);
    // 没有待固化候选时，不应出现「把上一轮固化为技能」
    expect(win.buildCmds("").some((it) => it.label === win.t("cmd.skillSaveOffer", "把上一轮固化为技能"))).toBe(false);
  });

  it("有待固化候选时，命令面板「技能」组置顶出现「把上一轮固化为技能」", async () => {
    const win = await boot();
    const o = win.noteSkillOffer([{ name: "web_fetch", ok: true }, { name: "sql_query", ok: true }], "抓数据跑个数");
    expect(o).toBeTruthy();
    const rows = win.buildCmds("").filter((it) => it.group === win.t("cmd.skill", "技能"));
    expect(rows[0].label).toBe(win.t("cmd.skillSaveOffer", "把上一轮固化为技能"));
    expect(rows[0].sub).toBe("web_fetch → sql_query");
    // 点它 = 把「存为技能」发给聊天（本地命令，不该打模型）
    let called = 0;
    win.chatOnce = async () => { called++; return { choices: [{ message: { role: "assistant", content: "x" } }] }; };
    rows[0].run();
    expect(win.document.getElementById("chatTextInput").value).toBe(win.t("cmd.skillSaveText", "存为技能"));
    await win.onChatSubmit({ preventDefault() {}, target: { msg: { value: win.document.getElementById("chatTextInput").value } } });
    expect(called, "固化命令不走模型").toBe(0);
    expect(win.listEnabledSkills().map((s) => s.name)).toEqual(["抓数据跑个数"]);
  });

  it("点命令面板的技能条目 → sendChatText 真的填好输入框并提交表单；技能被展开成执行指令发给模型", async () => {
    const win = await boot();
    putCustom(win, [SKILL_WEEKLY]);
    const received = [];
    win.chatOnce = async (messages) => {
      received.push(messages);
      return { choices: [{ message: { role: "assistant", content: "好" } }] };
    };
    const form = win.document.getElementById("chatForm");
    let submitted = 0;
    form.addEventListener("submit", () => { submitted++; });
    const item = win.buildCmds("").find((it) => it.label === "周报流程");
    item.run();
    const ta = win.document.getElementById("chatTextInput");
    expect(ta.value, "命令面板应把「技能：X」填进聊天输入框").toBe("技能：周报流程");
    expect(submitted, "命令面板应真的提交聊天表单").toBe(1);
    /* jsdom 没实现 HTMLFormElement 的具名属性（form.msg），而生产的 onChatSubmit 就是按
       f.msg.value 取值（真实浏览器可用，见 ai-retry.js 的 bindChatPanel/Ctrl+Enter 路径）。
       故这里把同一条文本按生产契约手动喂进去，验证技能展开这一段。 */
    await win.onChatSubmit({ preventDefault() {}, target: { msg: { value: ta.value } } });
    expect(received.length, "应触发一次模型请求").toBe(1);
    const userMsg = received[0].filter((m) => m.role === "user").pop();
    expect(userMsg.content).toContain("技能：周报流程");
    expect(userMsg.content).toContain("generate_report 生成本周报表"); // 做法被展开进本轮
    expect(received[0][0].content).toContain("【用户自定义技能】"); // 系统提示也带上
  });

  it("普通输入不被「技能」命令词吞掉（findSkill 未命中就走正常路径，原文发送）", async () => {
    const win = await boot();
    putCustom(win, [SKILL_WEEKLY]);
    const received = [];
    win.chatOnce = async (messages) => {
      received.push(messages);
      return { choices: [{ message: { role: "assistant", content: "好" } }] };
    };
    await submitChat(win, "技能树怎么加点");
    expect(received.length).toBe(1);
    const userMsg = received[0].filter((m) => m.role === "user").pop();
    expect(userMsg.content).toBe("技能树怎么加点"); // 未被包成技能执行指令
    // 且系统提示里的技能段照常存在（技能仍然可被模型按相关性参考）
    expect(received[0][0].content).toContain("周报流程");
  });

  it("「保存技能说明文档」这类正常句子不会被固化命令吞掉", async () => {
    const win = await boot();
    const received = [];
    win.chatOnce = async (messages) => {
      received.push(messages);
      return { choices: [{ message: { role: "assistant", content: "好" } }] };
    };
    await submitChat(win, "保存技能说明文档");
    expect(received.length, "应走正常对话路径而非固化命令").toBe(1);
    expect(received[0].filter((m) => m.role === "user").pop().content).toBe("保存技能说明文档");
  });
});

/* =========================================================================
 * ③ 自动固化（用户说的"把某些东西转化为 skills"）
 * ========================================================================= */
describe("③ Skills · 一轮成功执行后可固化为技能", () => {
  it("成功执行 2 个工具 → 挂出候选；「存为技能」落盘；落盘的技能下一轮真的进系统提示", async () => {
    const win = await boot();
    const calls = [];
    mockTwoRoundTools(win, calls);
    // 措辞刻意避开 parseNaturalLanguageTask/Action 的建任务/完成/删除拦截，才能走到真正的对话链路
    await submitChat(win, "按老规矩处理这周的事");
    expect(calls.length, "工具轮 + 收尾文本轮").toBe(2);

    const offer = win.getPendingSkillOffer();
    expect(offer, "应挂出可固化候选").toBeTruthy();
    expect(offer.steps.map((s) => s.tool)).toEqual(["create_task", "add_record"]);
    expect(offer.userText).toBe("按老规矩处理这周的事");
    // 候选不落盘：没用户确认前不能擅自往配置里写
    expect(win.listSkills()).toEqual([]);

    // 「存为技能」是本地命令，不应该再打模型
    const before = calls.length;
    await submitChat(win, "存为技能：随手记流程");
    expect(calls.length, "固化命令不走模型").toBe(before);

    const saved = win.listEnabledSkills();
    expect(saved.map((s) => s.name)).toEqual(["随手记流程"]);
    expect(saved[0].tools).toEqual(["create_task", "add_record"]);
    expect(saved[0].prompt).toContain("create_task");
    expect(win.getPendingSkillOffer()).toBeNull(); // 候选消费掉，防重复保存

    // 闭环：写回的 JSON 与设置页同源，且下一轮系统提示带上它
    const persisted = JSON.parse(win.__test.getAiConfig("skills").custom);
    expect(persisted[0].name).toBe("随手记流程");
    expect(win.chatSysPrompt("记一笔")).toContain("随手记流程");
  });

  it("候选在对话结束后被新一轮覆盖：单工具轮不挂候选", async () => {
    const win = await boot();
    const calls = [];
    win.chatOnce = async (messages) => {
      calls.push(messages);
      if (calls.length === 1) {
        return { choices: [{ message: { role: "assistant", content: "", tool_calls: [
          { id: "c1", type: "function", function: { name: "create_task", arguments: JSON.stringify({ title: "只有一个工具" }) } },
        ] } }] };
      }
      return { choices: [{ message: { role: "assistant", content: "好" } }] };
    };
    await submitChat(win, "建一个任务就好");
    expect(win.getPendingSkillOffer()).toBeNull();
  });

  it("noteSkillOffer 门槛：<2 个成功 / 全是危险工具 / 有失败 → 都不挂候选", async () => {
    const win = await boot();
    expect(win.noteSkillOffer([], "x")).toBeNull();
    expect(win.noteSkillOffer([{ name: "create_task", ok: true }], "x")).toBeNull();
    expect(win.noteSkillOffer([{ name: "create_task", ok: false }, { name: "add_record", ok: false }], "x")).toBeNull();
    expect(win.noteSkillOffer([{ name: "delete_task", ok: true }, { name: "update_task", ok: true }], "x")).toBeNull();
    expect(win.noteSkillOffer([{ name: "create_task", ok: true }, { name: "add_record", ok: true }], "x")).toBeTruthy();
  });

  it("同一条工具序列只提示一次（存过就不再打扰）", async () => {
    const win = await boot();
    expect(win.noteSkillOffer([{ name: "create_task", ok: true }, { name: "add_record", ok: true }], "第一次")).toBeTruthy();
    expect(win.commitPendingSkill("建任务记一笔")).toBeTruthy();
    expect(win.noteSkillOffer([{ name: "create_task", ok: true }, { name: "add_record", ok: true }], "又来一次")).toBeNull();
    // 序列不同（去重保序后）仍会提示
    expect(win.noteSkillOffer([{ name: "create_task", ok: true }, { name: "note_add", ok: true }], "换个流程")).toBeTruthy();
  });

  it("无候选时「存为技能」明确告知原因，且不写坏配置", async () => {
    const win = await boot();
    const received = [];
    win.chatOnce = async (messages) => {
      received.push(messages);
      return { choices: [{ message: { role: "assistant", content: "好" } }] };
    };
    await submitChat(win, "存为技能");
    expect(received.length, "本地命令不走模型").toBe(0);
    const last = win.getChat("office").filter((m) => m.role === "assistant").pop();
    expect(last.content).toContain("没有可固化的流程");
    expect(win.listSkills()).toEqual([]);
  });

  it("skillTracePush 按工具回执判成败（ok:false / 未知工具 记为失败，__CHART__ 记为成功）", async () => {
    const win = await boot();
    const tr = [];
    win.skillTracePush(tr, "create_task", { title: "a" }, JSON.stringify({ ok: true, msg: "已创建" }));
    win.skillTracePush(tr, "search", { q: "b" }, JSON.stringify({ ok: false, msg: "失败了" }));
    win.skillTracePush(tr, "zzz", {}, JSON.stringify({ ok: false, msg: "未知工具：zzz" }));
    win.skillTracePush(tr, "render_chart", { data: [] }, "__CHART__{\"type\":\"bar\"}");
    win.skillTracePush(tr, "note_add", { title: "c" }, "不是 JSON 的返回");
    expect(tr.map((x) => x.ok)).toEqual([true, false, false, true, true]);
    expect(tr[0].args).toEqual(["title"]); // 只留参数名，不留参数值
  });

  it("deleteSkill 删得掉、删错名字返回 false", async () => {
    const win = await boot();
    putCustom(win, [SKILL_WEEKLY, { name: "另一条", desc: "d", enabled: true }]);
    expect(win.deleteSkill("不存在的")).toBe(false);
    expect(win.deleteSkill("周报流程")).toBe(true);
    expect(win.listEnabledSkills().map((s) => s.name)).toEqual(["另一条"]);
  });

  it("saveSkill 同名覆盖、保留设置页存过的 builtin", async () => {
    const win = await boot();
    win.__test.saveAiConfig("skills", { builtin: [{ name: "create_task", desc: "创建任务", enabled: true }], custom: "[]" });
    win.saveSkill({ name: "A", desc: "第一版", prompt: "p1", enabled: true });
    win.saveSkill({ name: "A", desc: "第二版", prompt: "p2", enabled: true });
    const saved = win.listSkills();
    expect(saved.length).toBe(1);
    expect(saved[0].desc).toBe("第二版");
    expect(win.__test.getAiConfig("skills").builtin).toEqual([{ name: "create_task", desc: "创建任务", enabled: true }]);
  });
});
