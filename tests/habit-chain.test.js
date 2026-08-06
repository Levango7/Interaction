// 习惯链可视化测试
// 覆盖：calcStreak（连续天数/空场景）、heatmapData（84 天/level 分级）、
//       analyzeBehavior（结构/14 天窗口）、习惯链触发后链状态更新。
// 策略：每个 it 用 loadApp 取独立 window，win.localStorage.clear() 重置后手动写数据，
//       从 win.__test 取被测函数断言。doneAt 用当天 12:00 避免时区边界抖动。

import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

// 当天 12:00 的时间戳（offsetDays=0 是今天，1 是昨天，依此类推）
function noonNow(offsetDays) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d.getTime();
}
function mkTask(id, sc, title, offsetDays, extra) {
  return Object.assign(
    { id, sc, title, status: "done", doneAt: noonNow(offsetDays), tags: [], created: noonNow(offsetDays) },
    extra || {}
  );
}

describe("calcStreak() 连续天数", () => {
  it("A1: 连续 3 天完成 → current>=3，best>=3，thisWeek>=1", () => {
    const win = loadApp();
    const { setTasks, calcStreak } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "health", "跑步", 0),
      mkTask("t2", "health", "跑步", 1),
      mkTask("t3", "health", "跑步", 2)
    ]);
    const s = calcStreak("health");
    expect(s.current).toBeGreaterThanOrEqual(3);
    expect(s.best).toBeGreaterThanOrEqual(3);
    // thisWeek 依赖今天是周几（周一=本周起点），至少今天算本周
    expect(s.thisWeek).toBeGreaterThanOrEqual(1);
  });

  it("A2: 无任务 → current=0, best=0, thisWeek=0", () => {
    const win = loadApp();
    const { calcStreak } = win.__test;
    win.localStorage.clear();
    const s = calcStreak("health");
    expect(s.current).toBe(0);
    expect(s.best).toBe(0);
    expect(s.thisWeek).toBe(0);
  });

  it("A3: 今天没完成但昨天前天完成 → current=2（今天没完成不算断）", () => {
    const win = loadApp();
    const { setTasks, calcStreak } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "health", "跑步", 1),
      mkTask("t2", "health", "跑步", 2)
    ]);
    const s = calcStreak("health");
    expect(s.current).toBe(2);
    expect(s.best).toBe(2);
  });

  it("A4: 中间断了一天 → current 截断到断点之前，best 保留历史最长", () => {
    const win = loadApp();
    const { setTasks, calcStreak } = win.__test;
    win.localStorage.clear();
    // 今天、昨天完成；前天断；大前天、大大前天完成（5 天前、4 天前断、3 天前、1 天前、今天）
    setTasks([
      mkTask("t1", "health", "跑步", 0),
      mkTask("t2", "health", "跑步", 1),
      // 2 天前断
      mkTask("t3", "health", "跑步", 3),
      mkTask("t4", "health", "跑步", 4)
    ]);
    const s = calcStreak("health");
    expect(s.current).toBe(2); // 今天+昨天
    expect(s.best).toBe(2);    // 最长连续段为 2
  });
});

describe("heatmapData() 热力图数据", () => {
  it("B1: 默认返回 84 天（12 周×7 天），每项含 date/count/level", () => {
    const win = loadApp();
    const { heatmapData } = win.__test;
    win.localStorage.clear();
    const data = heatmapData("code", 12);
    expect(data).toHaveLength(84);
    data.forEach(d => {
      expect(d).toHaveProperty("date");
      expect(d).toHaveProperty("count");
      expect(d).toHaveProperty("level");
      expect(typeof d.date).toBe("string");
      expect(typeof d.count).toBe("number");
      expect(d.level).toBeGreaterThanOrEqual(0);
      expect(d.level).toBeLessThanOrEqual(4);
    });
  });

  it("B2: level 分级——0/2/4/9/10 个完成 → level 0/1/2/3/4", () => {
    const win = loadApp();
    const { setTasks, heatmapData } = win.__test;
    win.localStorage.clear();
    // 今天分 5 组场景测 level 不便（heatmapData 按 sc 过滤），改为同场景不同天构造
    // 用 code 场景：今天 2 个、昨天 4 个、前天 9 个、3 天前 10 个、4 天前 0 个
    const tasks = [];
    for (let i = 0; i < 2; i++) tasks.push(mkTask("a" + i, "code", "x", 0));
    for (let i = 0; i < 4; i++) tasks.push(mkTask("b" + i, "code", "x", 1));
    for (let i = 0; i < 9; i++) tasks.push(mkTask("c" + i, "code", "x", 2));
    for (let i = 0; i < 10; i++) tasks.push(mkTask("d" + i, "code", "x", 3));
    setTasks(tasks);
    const data = heatmapData("code", 12);
    // data 是按时间正序（最早→最近），最后一个是今天
    const today = data[data.length - 1];
    const yest = data[data.length - 2];
    const twoDaysAgo = data[data.length - 3];
    const threeDaysAgo = data[data.length - 4];
    const fourDaysAgo = data[data.length - 5];
    expect(today.count).toBe(2);   expect(today.level).toBe(1);
    expect(yest.count).toBe(4);    expect(yest.level).toBe(2);
    expect(twoDaysAgo.count).toBe(9);  expect(twoDaysAgo.level).toBe(3);
    expect(threeDaysAgo.count).toBe(10); expect(threeDaysAgo.level).toBe(4);
    expect(fourDaysAgo.count).toBe(0);  expect(fourDaysAgo.level).toBe(0);
  });

  it("B3: weeks 参数边界——weeks=2 返回 14 天，非法值回退默认 12", () => {
    const win = loadApp();
    const { heatmapData } = win.__test;
    win.localStorage.clear();
    expect(heatmapData("code", 2)).toHaveLength(14);
    expect(heatmapData("code", 0)).toHaveLength(84);  // 0 → 默认 12
    expect(heatmapData("code", "bad")).toHaveLength(84);
    expect(heatmapData("code", 100)).toHaveLength(52 * 7); // 上限 52 周
  });
});

describe("analyzeBehavior() 行为分析", () => {
  it("C1: 返回正确结构 {totalDone, byScenario, streaks, links, patterns}", () => {
    const win = loadApp();
    const { analyzeBehavior, ORDER } = win.__test;
    win.localStorage.clear();
    const r = analyzeBehavior();
    expect(r).toHaveProperty("totalDone");
    expect(r).toHaveProperty("byScenario");
    expect(r).toHaveProperty("streaks");
    expect(r).toHaveProperty("links");
    expect(r).toHaveProperty("patterns");
    expect(typeof r.totalDone).toBe("number");
    expect(Array.isArray(r.links)).toBe(true);
    expect(Array.isArray(r.patterns)).toBe(true);
    ORDER.forEach(sc => {
      expect(r.byScenario).toHaveProperty(sc);
      expect(r.streaks).toHaveProperty(sc);
      expect(r.streaks[sc]).toHaveProperty("current");
      expect(r.streaks[sc]).toHaveProperty("best");
    });
  });

  it("C2: 只算最近 14 天——20 天前的完成不计入 totalDone", () => {
    const win = loadApp();
    const { setTasks, analyzeBehavior } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("old", "code", "远古任务", 20), // 20 天前，超出窗口
      mkTask("now", "code", "今天任务", 0)
    ]);
    const r = analyzeBehavior();
    expect(r.totalDone).toBe(1);
    expect(r.byScenario.code).toBe(1);
  });

  it("C3: patterns 在连续>=3 天时给出保持洞察，在 14 天无完成时给出降门槛洞察", () => {
    const win = loadApp();
    const { setTasks, analyzeBehavior } = win.__test;
    win.localStorage.clear();
    // life 连续 3 天；code 完全没有
    setTasks([
      mkTask("h1", "life", "跑步", 0),
      mkTask("h2", "life", "跑步", 1),
      mkTask("h3", "life", "跑步", 2)
    ]);
    const r = analyzeBehavior();
    expect(r.patterns.some(p => p.includes("连续 3 天") && p.includes("生活"))).toBe(true);
    expect(r.patterns.some(p => p.includes("最近 14 天没有完成") && p.includes("编程"))).toBe(true);
  });
});

describe("习惯链触发后链状态更新", () => {
  it("D1: office 交付任务完成 → linked=true，analyzeBehavior.links 中 office→study triggered>=1", () => {
    const win = loadApp();
    const { setTasks, completeTask, analyzeBehavior } = win.__test;
    win.localStorage.clear();
    const id = "h1";
    setTasks([
      { id, sc: "office", title: "交付项目里程碑", status: "todo", doneAt: null, tags: [], created: Date.now() }
    ]);
    completeTask(id);
    const r = analyzeBehavior();
    const link = r.links.find(l => l.fromSc === "office" && l.toSc === "study");
    expect(link).toBeTruthy();
    expect(link.triggered).toBeGreaterThanOrEqual(1);
  });

  it("D2: renderHabitChainStatus 包含触发次数文案", () => {
    const win = loadApp();
    const { setTasks, completeTask, renderHabitChainStatus } = win.__test;
    win.localStorage.clear();
    const id = "h2";
    setTasks([
      { id, sc: "office", title: "交付项目里程碑", status: "todo", doneAt: null, tags: [], created: Date.now() }
    ]);
    completeTask(id);
    const html = renderHabitChainStatus();
    expect(html).toContain("触发");
    expect(html).toContain("办公");
    expect(html).toContain("学习");
  });

  it("D3: renderHeatmap 返回 SVG 且含 heat level class", () => {
    const win = loadApp();
    const { setTasks, renderHeatmap } = win.__test;
    win.localStorage.clear();
    setTasks([mkTask("t1", "code", "x", 0)]);
    const html = renderHeatmap("code");
    expect(html).toContain("<svg");
    expect(html).toContain("class=\"cell l");
    expect(html).toContain("heatmap-svg");
  });
});