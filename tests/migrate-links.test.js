// 阶段二·迁移与联动边界测试
// 目标：验证 migrate() 旧字段补全、runLinks() 联动触发/防重复/关键词匹配/disabled 跳过/fromSc 过滤。
// 策略：每个 it 用 loadApp 取独立 window，win.localStorage.clear() 重置后手动写数据，
//       从 win.__test 取被测函数，断言 localStorage 与 getTasks() 结果。
// 注意：DEFAULT_LINKS 第一条 fromSc="office" kw="交付"，runLinks 用 title.toLowerCase().includes(kw.toLowerCase())
//       做子串匹配，故标题须包含完整 "交付" 子串才能触发（仅含 "交" 不匹配）。

import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

describe("migrate() 边界", () => {
  it("A1a: 旧任务 done=true 缺 status/doneAt/tags → 补 status='done'、doneAt=created、tags=[]", () => {
    const win = loadApp();
    const { migrate } = win.__test;
    win.localStorage.clear();
    const created = 1700000000000;
    win.localStorage.setItem(
      PREFIX + "tasks",
      JSON.stringify([{ id: "x1", sc: "office", title: "旧任务", done: true, created }])
    );
    migrate();
    const tasks = JSON.parse(win.localStorage.getItem(PREFIX + "tasks"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("done");
    expect(tasks[0].doneAt).toBe(created);
    expect(tasks[0].tags).toEqual([]);
  });

  it("A1b: 旧任务 done=false 缺 status/doneAt/tags → 补 status='todo'、doneAt=null、tags=[]", () => {
    const win = loadApp();
    const { migrate } = win.__test;
    win.localStorage.clear();
    win.localStorage.setItem(
      PREFIX + "tasks",
      JSON.stringify([{ id: "x2", sc: "office", title: "未完成旧任务", done: false, created: Date.now() }])
    );
    migrate();
    const tasks = JSON.parse(win.localStorage.getItem(PREFIX + "tasks"));
    expect(tasks[0].status).toBe("todo");
    expect(tasks[0].doneAt).toBeNull();
    expect(tasks[0].tags).toEqual([]);
  });

  it("A1c: 旧任务 done=true 且无 created → doneAt 回退为 Date.now()", () => {
    const win = loadApp();
    const { migrate } = win.__test;
    win.localStorage.clear();
    const before = Date.now();
    win.localStorage.setItem(
      PREFIX + "tasks",
      JSON.stringify([{ id: "x3", sc: "office", title: "无created旧任务", done: true }])
    );
    migrate();
    const tasks = JSON.parse(win.localStorage.getItem(PREFIX + "tasks"));
    expect(tasks[0].status).toBe("done");
    expect(typeof tasks[0].doneAt).toBe("number");
    expect(tasks[0].doneAt).toBeGreaterThanOrEqual(before);
    expect(tasks[0].tags).toEqual([]);
  });

  it("A2: 已是新格式时 migrate() 不改动", () => {
    const win = loadApp();
    const { migrate } = win.__test;
    win.localStorage.clear();
    const original = [
      { id: "n1", sc: "code", title: "新任务", status: "todo", doneAt: null, tags: ["x"], created: 12345 },
      { id: "n2", sc: "study", title: "已完成新任务", status: "done", doneAt: 999, tags: [], created: 67890 }
    ];
    win.localStorage.setItem(PREFIX + "tasks", JSON.stringify(original));
    migrate();
    const tasks = JSON.parse(win.localStorage.getItem(PREFIX + "tasks"));
    expect(tasks).toEqual(original);
  });

  it("A3: 无 tasks 键时 migrate() 不报错且不写入", () => {
    const win = loadApp();
    const { migrate } = win.__test;
    win.localStorage.clear();
    expect(() => migrate()).not.toThrow();
    expect(win.localStorage.getItem(PREFIX + "tasks")).toBeNull();
  });
});

describe("runLinks() 边界", () => {
  it("B1: 联动触发——office 任务完成且 title 含 '交付' → study 新增联动任务且原任务 linked=true", () => {
    const win = loadApp();
    const { setTasks, completeTask, getTasks } = win.__test;
    win.localStorage.clear();
    const id = "h1";
    setTasks([{ id, sc: "office", title: "交付项目里程碑", status: "todo", doneAt: null, tags: [], created: Date.now() }]);

    const ok = completeTask(id);
    expect(ok).toBe(true);

    const tasks = getTasks();
    const src = tasks.find(t => t.id === id);
    expect(src.status).toBe("done");
    expect(src.doneAt).toBeTypeOf("number");
    expect(src.linked).toBe(true);

    const rewardTasks = tasks.filter(t => t.sc === "study" && t.tags && t.tags.includes("联动"));
    expect(rewardTasks.length).toBe(1);
    const reward = rewardTasks[0];
    expect(reward.title).toContain("奖励");
    expect(reward.title).toContain("技术分享视频");
    expect(reward.tags).toContain("联动");
    expect(reward.note).toBe("由场景联动自动生成");
    expect(reward.status).toBe("todo");
  });

  it("B2: 防重复触发——src.linked=true 时 runLinks 不再新增联动任务", () => {
    const win = loadApp();
    const { setTasks, runLinks, getTasks } = win.__test;
    win.localStorage.clear();
    const id = "h2";
    setTasks([
      { id, sc: "health", title: "跑步", status: "done", doneAt: Date.now(), tags: [], linked: true, created: Date.now() }
    ]);

    const before = getTasks().length;
    const src = getTasks().find(t => t.id === id);
    runLinks(src);
    const after = getTasks().length;
    expect(after).toBe(before);
  });

  it("B3: 关键词不匹配——title 不含规则 kw 时不生成联动且不标记 linked", () => {
    const win = loadApp();
    const { setTasks, completeTask, getTasks } = win.__test;
    win.localStorage.clear();
    const id = "h3";
    setTasks([{ id, sc: "health", title: "睡觉8小时", status: "todo", doneAt: null, tags: [], created: Date.now() }]);

    completeTask(id);

    const tasks = getTasks();
    const rewardTasks = tasks.filter(t => t.sc === "study" && t.tags && t.tags.includes("联动"));
    expect(rewardTasks.length).toBe(0);
    const src = tasks.find(t => t.id === id);
    expect(src.linked).toBeUndefined();
  });

  it("B4: disabled 规则跳过——第一条 enabled=false 时即使 kw 匹配也不触发", () => {
    const win = loadApp();
    const { setTasks, completeTask, getTasks, DEFAULT_LINKS } = win.__test;
    win.localStorage.clear();
    const links = DEFAULT_LINKS.map((l, i) => (i === 0 ? { ...l, enabled: false } : l));
    win.localStorage.setItem(PREFIX + "links", JSON.stringify(links));

    const id = "h4";
    setTasks([{ id, sc: "health", title: "跑步5公里", status: "todo", doneAt: null, tags: [], created: Date.now() }]);

    completeTask(id);

    const tasks = getTasks();
    const rewardTasks = tasks.filter(t => t.sc === "study" && t.tags && t.tags.includes("联动"));
    expect(rewardTasks.length).toBe(0);
    const src = tasks.find(t => t.id === id);
    expect(src.linked).toBeUndefined();
  });

  it("B5: fromSc 不匹配——office 任务完成不会触发 health→study 规则", () => {
    const win = loadApp();
    const { setTasks, completeTask, getTasks } = win.__test;
    win.localStorage.clear();
    const id = "o1";
    // office 任务 title 含 "跑步"（health 规则的 kw），但 fromSc=office ≠ health，
    // health 规则应被 fromSc 过滤跳过；office 默认规则 kw="交付" 不匹配 "跑步"。
    setTasks([{ id, sc: "office", title: "跑步", status: "todo", doneAt: null, tags: [], created: Date.now() }]);

    completeTask(id);

    const tasks = getTasks();
    const rewardTasks = tasks.filter(t => t.tags && t.tags.includes("联动"));
    expect(rewardTasks.length).toBe(0);
    const src = tasks.find(t => t.id === id);
    expect(src.linked).toBeUndefined();
  });
});