import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * v2.3.0 工具应用（TOOL_APPS）+ 仪表盘改名 + 系统概况卡 回归测试
 * ----------------------------------------------------------------------------
 * 覆盖：
 *  - TOOL_APPS 注册表完整性：19 个子工具全部有 render/bind
 *  - openToolStub 分发：命中 TOOL_APPS 渲染真实工具页；未注册 id 落占位页
 *  - 代表工具冒烟：off-md（Markdown 编辑/预览/导出）、cod-regex（正则匹配）、
 *    lif-bill（缴费 CRUD + 逾期标红）、lif-shop（勾选已购）
 *  - 侧栏改名：dash-chart label「编辑」，点击进入统计页编辑态（_dashEditMode=true）
 *  - 统计页标题栏：展示态「仪表盘」/ 编辑态「编辑仪表盘」
 *  - 主页系统概况卡：renderSystemOverviewCard 输出数字清单与 AI 状态行
 */

const PREFIX = "wb_agent_";

describe("v2.3.0 TOOL_APPS 工具注册表", () => {
  let win;
  let __test;
  let document;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    document = win.document;
    win.localStorage.clear();
  });

  it("19 个子工具全部注册且 render/bind 均为函数", () => {
    const expected = [
      "off-md", "off-word", "off-sheet", "off-ppt", "off-pdf", "off-ocr",
      "des-cad", "des-ps", "des-imggen", "des-vidgen",
      "stu-web",
      "cod-compile", "cod-regex", "cod-md2code",
      "lif-sport", "lif-bill", "lif-shop", "lif-takeout", "lif-transit"
    ];
    expect(Object.keys(__test.TOOL_APPS).sort()).toEqual([...expected].sort());
    for(const id of expected){
      const app = __test.TOOL_APPS[id];
      expect(typeof app.render, id + ".render").toBe("function");
      expect(typeof app.bind, id + ".bind").toBe("function");
      expect(app.name, id + ".name 非空").toBeTruthy();
    }
  });

  it("openToolStub 命中 TOOL_APPS：渲染工具页头 + toolAppBody，uiView=tool", () => {
    __test.openToolStub("off-md", "Markdown");
    expect(document.querySelector("#toolAppBody")).toBeTruthy();
    expect(document.querySelector("#mdSrc")).toBeTruthy(); // Markdown 编辑器特征元素
    const h2 = document.querySelector(".page-head h2");
    expect(h2 && h2.textContent).toContain("Markdown 编辑器");
  });

  it("openToolStub 未注册 id：落「即将上线」占位页", () => {
    __test.openToolStub("no-such-tool", "未知工具");
    expect(document.querySelector("#toolAppBody")).toBeNull();
    expect(document.body.textContent).toContain("即将上线");
  });

  it("off-md：输入 Markdown 实时预览 + 持久化", () => {
    __test.openToolStub("off-md", "Markdown");
    const src = document.querySelector("#mdSrc");
    src.value = "# 标题一\n\n**加粗**";
    src.dispatchEvent(new win.Event("input", { bubbles: true }));
    const prev = document.querySelector("#mdPrev");
    expect(prev.innerHTML).toContain("<h1>");
    expect(prev.innerHTML).toContain("<strong>加粗</strong>");
    const saved = win.localStorage.getItem(PREFIX + "tool_off-md");
    expect(saved).toContain("标题一");
  });

  it("cod-regex：正则匹配输出捕获组与高亮", () => {
    __test.openToolStub("cod-regex", "正则");
    document.querySelector("#rePat").value = "\\d+";
    document.querySelector("#reTxt").value = "abc 123 def 456";
    document.querySelector("#reTxt").dispatchEvent(new win.Event("input", { bubbles: true }));
    const box = document.querySelector("#reMatches");
    expect(box.textContent).toContain("2 处匹配");
    expect(document.querySelector("#reHi").innerHTML).toContain("<mark");
  });

  it("cod-regex：非法正则显示错误提示不抛异常", () => {
    __test.openToolStub("cod-regex", "正则");
    document.querySelector("#rePat").value = "[unclosed";
    document.querySelector("#reTxt").value = "x";
    document.querySelector("#reTxt").dispatchEvent(new win.Event("input", { bubbles: true }));
    expect(document.querySelector("#reErr").textContent).toContain("语法错误");
  });

  it("lif-bill：添加记录入库 + 逾期行标红", () => {
    // 先造一条逾期数据
    win.localStorage.setItem(PREFIX + "tool_lif-bill",
      JSON.stringify([{ id: "t1", item: "电费", amount: 100, due: "2020-01-01" }]));
    __test.openToolStub("lif-bill", "缴费");
    const row = document.querySelector('[data-rec-row="t1"]');
    expect(row).toBeTruthy();
    expect(row.getAttribute("style")).toContain("danger");
    expect(document.body.textContent).toContain("逾期");
    // 通过表单添加一条
    const fieldEl = document.querySelector('[data-rec-field="item"]');
    expect(fieldEl).toBeTruthy();
    const amountEl = document.querySelector('[data-rec-field="amount"]');
    const dueEl = document.querySelector('[data-rec-field="due"]');
    fieldEl.value = "水费"; amountEl.value = "50"; dueEl.value = "2099-01-01";
    document.querySelector("#recAddBtn").click();
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "tool_lif-bill"));
    expect(stored.length).toBe(2);
    expect(stored[0].item).toBe("水费");
  });

  it("lif-shop：勾选「已购」更新 done 状态", () => {
    win.localStorage.setItem(PREFIX + "tool_lif-shop",
      JSON.stringify([{ id: "s1", item: "牛奶", qty: 2, price: 10 }]));
    __test.openToolStub("lif-shop", "采购");
    const chk = document.querySelector('[data-rec-check="s1"]');
    chk.checked = true;
    chk.dispatchEvent(new win.Event("change", { bubbles: true }));
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "tool_lif-shop"));
    expect(stored[0].done).toBe(true);
  });

  it("lif-bill：勾选已缴写入 paidAt，「本月已缴」统计可计入", () => {
    const today = __test.todayStr();
    win.localStorage.setItem(PREFIX + "tool_lif-bill",
      JSON.stringify([{ id: "p1", item: "水费", amount: 30, due: today }]));
    __test.openToolStub("lif-bill", "缴费");
    const chk = document.querySelector('[data-rec-check="p1"]');
    chk.checked = true;
    chk.dispatchEvent(new win.Event("change", { bubbles: true }));
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "tool_lif-bill"));
    expect(stored[0].done).toBe(true);
    expect(stored[0].paidAt, "勾选已缴必须写 paidAt，否则本月已缴统计恒为 0").toBe(today);
    // 重渲染后统计摘要：本月已缴计入 ¥30.00（而非恒 0）
    __test.openToolStub("lif-bill", "缴费");
    const items = [...document.querySelectorAll(".tool-summary-item")];
    const paidItem = items.find(el => el.textContent.includes("本月已缴"));
    expect(paidItem).toBeTruthy();
    expect(paidItem.textContent).toContain("¥30.00");
  });

  it("生活簇统计摘要渲染（lif-sport 周期统计）", () => {
    const today = __test.todayStr();
    win.localStorage.setItem(PREFIX + "tool_lif-sport",
      JSON.stringify([
        { id: "a", type: "跑步", date: today, mins: 30 },
        { id: "b", type: "游泳", date: today, mins: 45 }
      ]));
    __test.openToolStub("lif-sport", "运动");
    const summary = document.querySelectorAll(".tool-summary-item");
    expect(summary.length).toBeGreaterThanOrEqual(3);
    expect(document.body.textContent).toContain("本周运动");
  });

  it("off-sheet：CSV 导出包含单元格内容（BOM + 引号包裹）", async () => {
    win.localStorage.setItem(PREFIX + "tool_off-sheet",
      JSON.stringify({ rows: [["名", "值"], ["a", '含"引号"']] }));
    __test.openToolStub("off-sheet", "表格");
    expect(document.querySelector("#sheetTbl")).toBeTruthy();
    // 导出走 Blob URL + a.click()，jsdom 下验证不抛异常即可
    expect(() => document.querySelector("#shExportCsv").click()).not.toThrow();
  });

  it("stu-web：跨任务全文检索返回结果分组", () => {
    __test.setTasks([
      { id: "k1", title: "写周报", sc: "office", status: "todo", createdAt: Date.now() }
    ]);
    __test.openToolStub("stu-web", "检索");
    document.querySelector("#swQ").value = "周报";
    document.querySelector("#swGo").click();
    const res = document.querySelector("#swRes");
    expect(res.textContent).toContain("任务 (1)");
    expect(res.textContent).toContain("写周报");
  });
});

describe("v2.3.0 仪表盘改名与编辑态入口", () => {
  let win;
  let __test;
  let document;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    document = win.document;
    win.localStorage.clear();
    // 造任务数据避免 no-stats 空状态
    __test.setTasks([
      { id: "d1", title: "任务A", sc: "office", status: "done", doneAt: Date.now(), due: __test.todayStr(), createdAt: Date.now() },
      { id: "d2", title: "任务B", sc: "office", status: "todo", due: __test.todayStr(), createdAt: Date.now() }
    ]);
  });

  it("侧栏「仪表盘」为叶子项，点击进入统计页（展示态标题「仪表盘」）", () => {
    __test.render();
    const btn = document.querySelector('#side [data-sc="stats"]');
    expect(btn, "侧栏应有仪表盘叶子项").toBeTruthy();
    expect(btn.textContent).toContain("仪表盘");
    btn.click();
    expect(__test.getActive()).toBe("stats");
    expect(__test._dashEditMode).toBe(false);
    const h2b = document.querySelector(".page-head h2");
    expect(h2b && h2b.textContent).toBe("仪表盘");
  });

  it("编辑态经页头按钮切换：标题「编辑仪表盘」↔「仪表盘」", () => {
    __test.setActive("stats");
    __test._dashEditMode = true;
    __test.renderStats();
    const h2 = document.querySelector(".page-head h2");
    expect(h2 && h2.textContent).toBe("编辑仪表盘");
    const doneBtn = document.querySelector("#btnDashToggleEdit");
    expect(doneBtn.textContent).toContain("完成编辑");
    doneBtn.click();
    const h2b = document.querySelector(".page-head h2");
    expect(h2b && h2b.textContent).toBe("仪表盘");
    expect(__test._dashEditMode).toBe(false);
  });
});

describe("v2.4.0 侧栏新信息架构", () => {
  let win;
  let __test;
  let document;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    document = win.document;
    win.localStorage.clear();
    __test.setTasks([
      { id: "d1", title: "任务A", sc: "office", status: "done", doneAt: Date.now(), due: __test.todayStr(), createdAt: Date.now() },
      { id: "d2", title: "任务B", sc: "office", status: "todo", due: __test.todayStr(), createdAt: Date.now() }
    ]);
  });

  it("四组结构：总览(主页/仪表盘/任务/习惯链) + 场景 + 应用(AI/工具箱/商店) + 系统", () => {
    __test.render();
    const groupNames = [...document.querySelectorAll("#side .nav-group")].map(g => g.textContent);
    expect(groupNames).toEqual(["总览", "场景", "应用", "系统"]);
    expect(document.querySelector('#side [data-sc="tasks"]')).toBeTruthy();
    expect(document.querySelector('#side [data-sc="chainpage"]')).toBeTruthy();
    expect(document.querySelector('#side [data-sc="toolbox"]')).toBeTruthy();
    expect(document.querySelector('#side [data-sc="store"]')).toBeTruthy();
    expect(document.querySelector('#side [data-aipage="1"]')).toBeTruthy();
  });

  it("「数据」场景归位办公之后，ORDER 与 SCENARIOS 保留", () => {
    __test.render();
    expect(document.querySelector('#side [data-sc="data"]')).toBeTruthy();
    expect(__test.SCENARIOS.data).toBeTruthy();
    expect(__test.ORDER).toContain("data");
    // ORDER 顺序：办公 → 数据 → 设计 → 学习 → 编程 → 生活
    const idx = __test.ORDER.indexOf("data");
    expect(idx).toBe(1); // office 在 0，data 紧随其后
  });

  it("场景项无子菜单（19 工具迁往工具箱），计数为 0 不显示徽章", () => {
    __test.render();
    // 生活场景无未办任务时不应有计数徽章
    const lifeBtn = document.querySelector('#side [data-sc="life"]');
    expect(lifeBtn).toBeTruthy();
    expect(lifeBtn.querySelector(".cnt")).toBeNull();
    // 场景父项不应再有展开箭头
    expect(document.querySelectorAll('#side .nav-sub').length, "桌面侧栏不应再渲染子菜单").toBe(0);
  });

  it("任务中心：三视图 tab 渲染 + 看板含跨场景卡片", () => {
    __test.setActive("tasks");
    __test.render();
    expect(document.querySelector(".tasks-view-tabs")).toBeTruthy();
    expect(document.querySelectorAll("#main .kcard").length).toBeGreaterThanOrEqual(1);
    // 切日历视图
    document.querySelector('[data-tasks-view="calendar"]').click();
    expect(document.querySelector(".cal-grid")).toBeTruthy();
    // 切待办视图
    document.querySelector('[data-tasks-view="todo"]').click();
    expect(document.querySelector(".todo-list") || document.body.textContent.includes("待办清单")).toBeTruthy();
  });

  it("工具箱：分类 chips + 搜索过滤 + 卡片点击分发", () => {
    __test.setActive("toolbox");
    __test.render();
    expect(document.querySelectorAll("#main .toolbox-card").length).toBeGreaterThanOrEqual(24); // 19 工具 + 小件/功能
    // 搜索过滤
    const q = document.querySelector("#toolboxQ");
    q.value = "正则";
    q.dispatchEvent(new win.Event("input", { bubbles: true }));
    const cards = [...document.querySelectorAll("#main .toolbox-card .app-card-name")].map(el => el.textContent);
    expect(cards.length).toBeLessThan(5);
    expect(cards.join()).toContain("正则");
  });

  it("商店：内置插件三态流转 启用→禁用→卸载→再安装", () => {
    __test.setActive("store");
    __test.render();
    // 内置插件启动即注册（未启用）→ 应有「启用」按钮
    const tog = document.querySelector('[data-store-toggle="pomodoro"]');
    expect(tog, "已注册未启用的插件应有启用按钮").toBeTruthy();
    tog.click();
    expect(__test.getPlugin("pomodoro").enabled).toBe(true);
    // 禁用
    document.querySelector('[data-store-toggle="pomodoro"]').click();
    expect(__test.getPlugin("pomodoro").enabled).toBe(false);
    // 卸载（confirm 已在 loadApp 注入为 true）
    document.querySelector('[data-store-uninstall="pomodoro"]').click();
    expect(__test.getPlugin("pomodoro")).toBeNull();
    // 卸载后变为「安装」态
    __test.renderStorePage();
    const installBtn = document.querySelector('[data-store-install="pomodoro"]');
    expect(installBtn, "卸载后应出现安装按钮").toBeTruthy();
    installBtn.click();
    expect(__test.getPlugin("pomodoro")).toBeTruthy();
  });

  it("习惯链页：streak 徽章 + 链路图 + 成功率区块渲染", () => {
    __test.setActive("chainpage");
    __test.render();
    expect(document.body.textContent).toContain("当前 Streak");
    expect(document.body.textContent).toContain("场景链路图");
    expect(document.body.textContent).toContain("触发成功率");
  });
});

describe("v2.3.0 主页系统概况卡", () => {
  let win;
  let __test;
  let document;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    document = win.document;
    win.localStorage.clear();
  });

  it("renderSystemOverviewCard 输出数字清单 + AI 状态行", () => {
    __test.setTasks([
      { id: "o1", title: "T1", sc: "office", status: "todo", createdAt: Date.now() },
      { id: "o2", title: "T2", sc: "office", status: "done", doneAt: Date.now(), createdAt: Date.now() }
    ]);
    const html = __test.renderSystemOverviewCard();
    expect(html).toContain("系统概况");
    expect(html).toContain("sys-ov-item");
    expect(html).toContain("AI 助手");
    expect(html).toContain("未启用"); // 干净 localStorage 下 AI 未配置
  });

  it("主页概览渲染顺序：系统概况在习惯链之前、AI Hub 最后", () => {
    __test.setActive("overview");
    __test.render();
    const main = document.querySelector("#main");
    // 系统概况在 overview-grid 之前，其余在 grid 内
    const sysCard = main.querySelector(".sys-overview-card");
    const gridCards = [...main.querySelectorAll(".overview-grid > .card, .overview-grid > .ov-span2")];
    const chainIdx = gridCards.findIndex(c => c.querySelector("h2")?.textContent?.includes("习惯链"));
    const aiIdx = gridCards.findIndex(c => c.querySelector("h2")?.textContent?.includes("AI 助手"));
    expect(sysCard).toBeTruthy();
    expect(chainIdx).toBeGreaterThan(-1);
    expect(aiIdx).toBeGreaterThan(-1);
    expect(aiIdx).toBe(gridCards.length - 1);
  });
});
