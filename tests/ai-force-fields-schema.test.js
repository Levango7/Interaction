import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * AI 层对齐核心价值 · 回归验证（v1.14.1）
 * ----------------------------------------------------------------------------
 * 锁定两项 schema 契约修复：
 *   ① update_task / delete_task 的 force 参数入 schema（可选 boolean，默认 false 仍走二次确认）。
 *   ② add_record.fields 从 SCENARIOS 派生场景子 schema（anyOf），提升模型调用准确率。
 *
 * 设计原则：黑盒优先——经 jsdom 全局 window.__test 访问 TOOLS / execTool / getTasks / setTasks，
 * 断言可观测行为（schema 结构 + execTool 返回 + 存储落盘）。
 */

/** 取全新 window 并清空 storage，获得干净状态（active 仍为默认 "office"） */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** 调用 execTool 并解析 JSON 结果 */
function tool(win, name, args) {
  return JSON.parse(win.__test.execTool(name, args || {}));
}

const BASE = { sc: "code", status: "todo", doneAt: null, priority: "P0", note: "", tags: [], created: Date.now(), due: "" };

describe("AI 层对齐（v1.14.1）：force 入 schema + add_record.fields 场景子 schema", () => {
  it("update_task / delete_task schema 声明可选 force（不进 required）", () => {
    const win = freshWin();
    const byName = Object.fromEntries(win.__test.TOOLS.map((t) => [t.function.name, t.function]));
    for (const name of ["update_task", "delete_task"]) {
      const fn = byName[name];
      expect(fn, `TOOLS 应含 ${name}`).toBeTruthy();
      expect(fn.parameters.properties, `${name} 应声明 force`).toHaveProperty("force");
      expect(fn.parameters.properties.force.type, `${name} force 应为 boolean`).toBe("boolean");
      expect(fn.parameters.required, `${name} force 不应进 required（默认 false 仍走确认）`).not.toContain("force");
    }
  });

  it("add_record.fields 含 6 个内置场景的 anyOf 子 schema（键随场景）", () => {
    const win = freshWin();
    const add = win.__test.TOOLS.find((t) => t.function.name === "add_record").function;
    const fields = add.parameters.properties.fields;
    expect(fields.anyOf, "fields 应有 anyOf 场景子 schema").toBeTruthy();
    expect(fields.anyOf.length, "内置场景应为 6 个").toBe(6);

    const office = fields.anyOf.find((o) => (o.description || "").includes("办公"));
    expect(office.properties, "办公字段应含 title/who/note").toMatchObject({
      title: expect.any(Object),
      who: expect.any(Object),
      note: expect.any(Object),
    });

    const code = fields.anyOf.find((o) => (o.description || "").includes("编程"));
    expect(code.properties, "编程字段应含 lang/title/code").toMatchObject({
      lang: expect.any(Object),
      title: expect.any(Object),
      code: expect.any(Object),
    });
  });

  it("execTool 经 args.force=true 跳过二次确认直接软删除", () => {
    const win = freshWin();
    win.__test.setTasks([{ id: "f1", ...BASE, title: "待删任务" }]);
    const del = tool(win, "delete_task", { task_id: "待删任务", force: true });
    expect(del.ok, "force 删除应成功").toBe(true);
    expect(win.__test.getTasks().find((t) => t.id === "f1").deletedAt, "force 删除应置 deletedAt").toBeTruthy();
  });

  it("不带 force 仍走确认流程（不变量：未确认不落地）", () => {
    const win = freshWin();
    win.__test.setTasks([{ id: "f2", ...BASE, title: "确认任务" }]);
    const del = tool(win, "delete_task", { task_id: "确认任务" });
    expect(del.ok, "未带 force 应进入确认流程").toBe(false);
    expect(del.confirm, "应返回确认提示").toBeTruthy();
    expect(win.__test.getTasks().find((t) => t.id === "f2").deletedAt, "未确认不应删除").toBeFalsy();
  });

  describe("AI 层降级重定位（v1.15）：cfg.agent=false 时关闭 Agent 工具与话术", () => {
    /** 设置 cfg 的辅助：__test 无 setCfg，走 persistCfg + 清缓存让 getCfg 重读 */
    async function setCfg(win, patch) {
      const { persistCfg, getCfg, _resetCrypto } = win.__test;
      _resetCrypto();
      const base = getCfg() || {};
      await persistCfg(Object.assign({}, base, patch));
    }

    it("effectiveTools 在 agent=false 时剔除 7 个 Agent 工具（remember/plan 等）", async () => {
      const win = freshWin();
      await setCfg(win, { enabled: true, agent: false });
      const tools = win.__test.effectiveTools();
      const names = tools.map((t) => t.function.name);
      const AGENT = ["remember", "recall", "forget", "plan", "complete_step", "complete_goal", "list_records"];
      for (const n of AGENT) expect(names, `${n} 应在 agent=false 时被剔除`).not.toContain(n);
      // 核心业务工具保留
      for (const n of ["create_task", "list_tasks", "complete_task", "update_task", "delete_task", "add_record", "search", "query_overview", "export_data"]) {
        expect(names, `${n} 应保留`).toContain(n);
      }
    });

    it("effectiveTools 在 agent 默认（未关闭）时返回全部 17 工具", () => {
      const win = freshWin();
      const tools = win.__test.effectiveTools();
      expect(tools.length, "agent 开启时应有 17 个工具").toBe(17);
    });

    it("chatSysPrompt 在 agent=false 时不引导记忆/编排话术", async () => {
      const win = freshWin();
      await setCfg(win, { agent: false });
      const prompt = win.__test.chatSysPrompt("你好");
      expect(prompt, "降级话术不应提 remember").not.toContain("remember");
      expect(prompt, "降级话术不应提 plan").not.toContain("plan");
      expect(prompt, "降级话术仍应说明可调用工具").toContain("调用工具");
    });

    it("chatSysPrompt 在 agent 默认时保留记忆/编排引导", () => {
      const win = freshWin();
      const prompt = win.__test.chatSysPrompt("你好");
      expect(prompt, "默认话术应引导 remember").toContain("remember");
      expect(prompt, "默认话术应引导 plan").toContain("plan");
    });
  });
});
