// T3.3 数据统计测试
// 覆盖：calcTrend（7/30 天趋势 + 空边界）、calcSceneDist（4 场景分布 + 空边界）、
//       calcChainSuccess（链成功率 + 无触发）、calcStats（汇总指标 + 空边界）、
//       renderTrendChart/renderPieChart/renderStats（SVG 渲染 + 侧边栏入口）。
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
// YYYY-MM-DD of today (offsetDays=0 是今天)
function ymd(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

describe("calcTrend() 任务完成趋势", () => {
  it("T1: 7 天趋势——返回 7 项，每项含 date/count，今天完成的任务计入最后一天", () => {
    const win = loadApp();
    const { setTasks, calcTrend } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "code", "x", 0),
      mkTask("t2", "code", "x", 0),
      mkTask("t3", "code", "x", 2)
    ]);
    const data = calcTrend(7);
    expect(data).toHaveLength(7);
    data.forEach(d => {
      expect(d).toHaveProperty("date");
      expect(d).toHaveProperty("count");
      expect(typeof d.date).toBe("string");
      expect(typeof d.count).toBe("number");
    });
    // 最后一天是今天，count=2
    expect(data[6].count).toBe(2);
    // 3 天前（index 4）count=1
    expect(data[4].count).toBe(1);
    // 其他天 count=0
    expect(data[5].count).toBe(0);
  });

  it("T2: 30 天趋势——返回 30 项，包含 20 天前的完成", () => {
    const win = loadApp();
    const { setTasks, calcTrend } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "code", "x", 0),
      mkTask("t2", "code", "x", 20)
    ]);
    const data = calcTrend(30);
    expect(data).toHaveLength(30);
    expect(data[29].count).toBe(1); // 今天
    expect(data[9].count).toBe(1);  // 20 天前（30-1-20=9）
    // 总完成数 = 2
    const sum = data.reduce((s, d) => s + d.count, 0);
    expect(sum).toBe(2);
  });

  it("T3: 空数据边界——无任务返回全 0", () => {
    const win = loadApp();
    const { calcTrend } = win.__test;
    win.localStorage.clear();
    const data = calcTrend(7);
    expect(data).toHaveLength(7);
    data.forEach(d => expect(d.count).toBe(0));
  });

  it("T4: 参数边界——非法值回退默认 7，上限 365", () => {
    const win = loadApp();
    const { calcTrend } = win.__test;
    win.localStorage.clear();
    expect(calcTrend(0)).toHaveLength(7);      // 0 → 默认 7
    expect(calcTrend("bad")).toHaveLength(7);  // NaN → 默认 7
    expect(calcTrend(1000)).toHaveLength(365); // 上限 365
  });
});

describe("calcSceneDist() 场景分布", () => {
  it("S1: 4 场景分布——返回 4 项，count/pct 正确，pct 之和约等于 100", () => {
    const win = loadApp();
    const { setTasks, calcSceneDist, ORDER } = win.__test;
    win.localStorage.clear();
    // office:3, code:2, study:1, life:0 → 总 6
    setTasks([
      mkTask("a1", "office", "x", 0, { status: "todo" }),
      mkTask("a2", "office", "x", 0, { status: "todo" }),
      mkTask("a3", "office", "x", 0),
      mkTask("b1", "code", "x", 0),
      mkTask("b2", "code", "x", 0),
      mkTask("c1", "study", "x", 0)
    ]);
    const dist = calcSceneDist();
    expect(dist).toHaveLength(4);
    // 顺序与 ORDER 一致
    expect(dist.map(d => d.sc)).toEqual(ORDER);
    const bySc = Object.fromEntries(dist.map(d => [d.sc, d]));
    expect(bySc.office.count).toBe(3);
    expect(bySc.code.count).toBe(2);
    expect(bySc.study.count).toBe(1);
    expect(bySc.life.count).toBe(0);
    // pct = round(count/total*100)
    expect(bySc.office.pct).toBe(50);  // 3/6=50%
    expect(bySc.code.pct).toBe(33);    // 2/6≈33.33→33
    expect(bySc.study.pct).toBe(17);   // 1/6≈16.67→17
    expect(bySc.life.pct).toBe(0);
    // pct 之和约等于 100（四舍五入误差 ±1）
    const sum = dist.reduce((s, d) => s + d.pct, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1);
  });

  it("S2: 空数据边界——无任务时所有 count=0, pct=0", () => {
    const win = loadApp();
    const { calcSceneDist } = win.__test;
    win.localStorage.clear();
    const dist = calcSceneDist();
    expect(dist).toHaveLength(4);
    dist.forEach(d => {
      expect(d.count).toBe(0);
      expect(d.pct).toBe(0);
    });
  });

  it("S3: 已删除任务（deletedAt）不计入分布", () => {
    const win = loadApp();
    const { setTasks, calcSceneDist } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("a1", "office", "x", 0),
      mkTask("a2", "office", "x", 0, { deletedAt: Date.now() }) // 已删除
    ]);
    const dist = calcSceneDist();
    const bySc = Object.fromEntries(dist.map(d => [d.sc, d]));
    expect(bySc.office.count).toBe(1);
  });
});

describe("calcChainSuccess() 习惯链成功率", () => {
  it("C1: 链成功率——源场景完成 4 个，触发 2 个 → rate=50%", () => {
    const win = loadApp();
    const { setTasks, calcChainSuccess, getLinks } = win.__test;
    win.localStorage.clear();
    // 默认链 l1: office 交付 → study
    // office 近 30 天完成 4 个，其中 2 个标题含"交付"且 linked=true
    setTasks([
      mkTask("a1", "office", "交付项目 A", 0, { linked: true }),
      mkTask("a2", "office", "交付里程碑 B", 1, { linked: true }),
      mkTask("a3", "office", "开会", 2, { linked: true }),
      mkTask("a4", "office", "写周报", 3)  // 无 linked
    ]);
    const chains = calcChainSuccess();
    // 至少有一条 office → study 的链
    const l = chains.find(c => c.fromSc === "office" && c.toSc === "study");
    expect(l).toBeTruthy();
    expect(l.sourceDone).toBe(4);
    expect(l.triggered).toBe(2);
    expect(l.rate).toBe(50);
  });

  it("C2: 链无触发——源场景无完成任务 → rate=0%", () => {
    const win = loadApp();
    const { setTasks, calcChainSuccess } = win.__test;
    win.localStorage.clear();
    // 只在 code 场景完成任务，office 链源完成数=0
    setTasks([mkTask("a1", "code", "写代码", 0)]);
    const chains = calcChainSuccess();
    const l = chains.find(c => c.fromSc === "office");
    expect(l).toBeTruthy();
    expect(l.sourceDone).toBe(0);
    expect(l.triggered).toBe(0);
    expect(l.rate).toBe(0);
  });

  it("C3: 返回结构包含 id/name/fromSc/toSc/kw/enabled/triggered/sourceDone/rate", () => {
    const win = loadApp();
    const { calcChainSuccess } = win.__test;
    win.localStorage.clear();
    const chains = calcChainSuccess();
    expect(chains.length).toBeGreaterThan(0);
    chains.forEach(c => {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("fromSc");
      expect(c).toHaveProperty("toSc");
      expect(c).toHaveProperty("kw");
      expect(c).toHaveProperty("enabled");
      expect(c).toHaveProperty("triggered");
      expect(c).toHaveProperty("sourceDone");
      expect(c).toHaveProperty("rate");
      expect(c.rate).toBeGreaterThanOrEqual(0);
      expect(c.rate).toBeLessThanOrEqual(100);
    });
  });
});

describe("calcStats() 关键指标汇总", () => {
  it("K1: 汇总指标——total/done/rate/bestStreak/weekDone 正确", () => {
    const win = loadApp();
    const { setTasks, calcStats } = win.__test;
    win.localStorage.clear();
    // 6 个任务：4 已完成（其中 3 个今天完成，1 个 5 天前完成），2 待办
    // life 场景连续 3 天完成 → bestStreak >= 3
    setTasks([
      mkTask("a1", "life", "跑步", 0),
      mkTask("a2", "life", "跑步", 1),
      mkTask("a3", "life", "跑步", 2),
      mkTask("a4", "code", "写代码", 5),
      mkTask("a5", "office", "开会", 0, { status: "todo", doneAt: null }),
      mkTask("a6", "office", "周报", 0, { status: "todo", doneAt: null })
    ]);
    const s = calcStats();
    expect(s.total).toBe(6);
    expect(s.done).toBe(4);
    expect(s.rate).toBe(67);  // round(4/6*100)=67
    expect(s.bestStreak).toBeGreaterThanOrEqual(3);
    // weekDone：今天完成的 3 个 + 5 天前完成的 1 个（都在本周内，假设 5 天前还在本周）
    // 周一为本周起点，5 天前可能跨周，所以只断言 >= 3（今天的 3 个一定在本周）
    expect(s.weekDone).toBeGreaterThanOrEqual(3);
  });

  it("K2: 空数据边界——无任务时 total=0, done=0, rate=0, bestStreak=0, weekDone=0", () => {
    const win = loadApp();
    const { calcStats } = win.__test;
    win.localStorage.clear();
    const s = calcStats();
    expect(s.total).toBe(0);
    expect(s.done).toBe(0);
    expect(s.rate).toBe(0);
    expect(s.bestStreak).toBe(0);
    expect(s.weekDone).toBe(0);
  });

  it("K3: 已删除任务不计入 total/done", () => {
    const win = loadApp();
    const { setTasks, calcStats } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("a1", "office", "x", 0),
      mkTask("a2", "office", "x", 0, { deletedAt: Date.now() })
    ]);
    const s = calcStats();
    expect(s.total).toBe(1);
    expect(s.done).toBe(1);
  });
});

describe("renderTrendChart / renderPieChart / renderStats 渲染", () => {
  it("R1: renderTrendChart 返回 SVG，含 polyline + circle + 网格 line", () => {
    const win = loadApp();
    const { calcTrend, renderTrendChart } = win.__test;
    win.localStorage.clear();
    const data = calcTrend(7);
    const html = renderTrendChart(data, "var(--accent)");
    expect(html).toContain("<svg");
    expect(html).toContain("polyline");
    expect(html).toContain("circle");
    expect(html).toContain("<line");  // 网格线
    expect(html).toContain("stats-trend-svg");
  });

  it("R2: renderPieChart 返回 SVG 饼图 + 图例，含 path + 场景名", () => {
    const win = loadApp();
    const { setTasks, calcSceneDist, renderPieChart } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("a1", "office", "x", 0),
      mkTask("a2", "code", "x", 0),
      mkTask("a3", "study", "x", 0),
      mkTask("a4", "life", "x", 0)
    ]);
    const dist = calcSceneDist();
    const html = renderPieChart(dist);
    expect(html).toContain("<svg");
    expect(html).toContain("path");
    expect(html).toContain("办公");
    expect(html).toContain("编程");
    expect(html).toContain("学习");
    expect(html).toContain("生活");
    expect(html).toContain("stats-pie-legend");
  });

  it("R3: renderPieChart 空数据返回空状态文案", () => {
    const win = loadApp();
    const { calcSceneDist, renderPieChart } = win.__test;
    win.localStorage.clear();
    const dist = calcSceneDist();
    const html = renderPieChart(dist);
    expect(html).toContain("stats-pie-empty");
    expect(html).toContain("暂无任务数据");
  });

  it("R4: renderStats 渲染主内容区——含指标卡片 + 趋势图 + 饼图 + 链成功率", () => {
    const win = loadApp();
    const { setTasks, renderStats } = win.__test;
    win.localStorage.clear();
    setTasks([mkTask("a1", "office", "交付项目", 0, { linked: true })]);
    renderStats();
    const main = win.document.getElementById("main");
    const html = main.innerHTML;
    expect(html).toContain("stats-cards");
    expect(html).toContain("stats-card");
    expect(html).toContain("任务完成趋势");
    expect(html).toContain("场景分布");
    expect(html).toContain("习惯链成功率");
    // 周/月切换按钮
    expect(html).toContain("stats-tab");
    expect(html).toContain("data-trend-days=\"7\"");
    expect(html).toContain("data-trend-days=\"30\"");
  });

  it("R5: 侧边栏含「统计」入口，点击切换到 stats 视图", () => {
    const win = loadApp();
    const { render, setActive, getActive, setTasks } = win.__test;
    win.localStorage.clear();
    // T4.2：有任务数据时统计视图渲染指标卡片；先添加一条任务避免 no-stats 空状态
    setTasks([{ id:"t1", sc:"office", title:"测试任务", status:"todo", due:"", priority:"", tags:[], doneAt:null, created:Date.now() }]);
    render();
    const side = win.document.getElementById("side");
    const statsBtn = side.querySelector('[data-sc="stats"]');
    expect(statsBtn).toBeTruthy();
    expect(statsBtn.textContent).toContain("统计");
    // 点击切换
    statsBtn.click();
    expect(getActive()).toBe("stats");
    // 主内容区应渲染统计视图
    const main = win.document.getElementById("main");
    expect(main.innerHTML).toContain("stats-cards");
  });
});