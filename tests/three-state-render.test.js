/**
 * three-state-render.test.js —— 三态渲染的**机械预检**（3.7.133 走查门槛的机械化部分）
 * ----------------------------------------------------------------------------
 * 背景（评审第八项后半段）：「逐屏走查三态」是真机人工 QA——jsdom 没有布局引擎，
 * 溢出/对齐/"别不别扭"替代不了。但三态里有四件事完全可机械化，先在这里拦掉：
 *   ① 每个视图都渲染得出东西（不是空白页）；
 *   ② 渲染结果不得漏出 `undefined` / `NaN` / `[object Object]` ——这类漏出**只在特定数据形态下
 *      出现**，而人工走查恰好最容易漏（要造出那种数据才看得见）；
 *   ③ 空态必须出现空态块（`.empty-state`），而不是一片空白让用户以为页面坏了；
 *   ④ 体量与极端长度不得崩：200 条任务、200 字标题、12 个标签、缺字段的脏数据。
 *
 * 剩下的（溢出、对齐、对比度、视觉舒适）归真机走查，见 `docs/qa-walkthrough.md`。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const tick = (ms = 70) => new Promise((r) => setTimeout(r, ms));

/** 17 个菜单选项里除「设置」「说明」外的全部视图（走查覆盖面与此一致） */
const VIEWS = ["office", "data", "design", "study", "code", "life", "health",
  "overview", "tasks", "chainpage", "timeline", "ai", "toolbox", "store", "recycle"];

/** 脏数据：缺 title / tags 非数组 / 各种 undefined —— 真实数据里都出现过 */
function dirtyTask(id) {
  return { id: "d" + id, createdAt: Date.now(), status: "todo" };
}
/** 极端长度：200 字标题 + 12 个标签 + 长备注 */
function longTask(id) {
  return {
    id: "l" + id, title: "任".repeat(100), due: "2026-12-31", priority: "P1",
    tags: Array.from({ length: 12 }, (_, i) => "标签" + i),
    note: "备注".repeat(80), status: "todo", createdAt: Date.now(),
  };
}

function load(extra) {
  return loadApp({ storage: Object.assign({ [PREFIX + "tasks"]: "[]" }, extra || {}) });
}
async function renderView(win, view) {
  win.setActive(view);
  win.render();
  await tick();
  const main = win.document.getElementById("main");
  return { html: main ? main.innerHTML : "", text: main ? main.textContent : "" };
}
/** 渲染结果里漏出的占位/对象字符串（只在特定数据形态下现形，正是机械检查的价值） */
const GARBAGE = [/undefined/, /NaN/, /\[object Object\]/];

describe("三态 · 每个视图都渲染得出东西", () => {
  it.each(VIEWS)("① %s：空数据下有非空主区", async (view) => {
    const win = load();
    const { html } = await renderView(win, view);
    expect(html.length, `${view} 渲染出空白页`).toBeGreaterThan(50);
  });

  it.each(VIEWS)("② %s：渲染结果不漏出 undefined / NaN / [object Object]", async (view) => {
    const win = load({ [PREFIX + "tasks"]: JSON.stringify([dirtyTask(1), longTask(2)]) });
    const { text } = await renderView(win, view);
    for (const re of GARBAGE) {
      expect(re.test(text), `${view} 的渲染文本里出现 ${re}（脏数据/极端长度下的漏出）`).toBe(false);
    }
  });
});

describe("三态 · 空态必须看得见", () => {
  it("③ 七个场景空数据时渲染 .empty-state（不是一片空白）", async () => {
    for (const sc of ["office", "data", "design", "study", "code", "life", "health"]) {
      const win = load();
      const { html } = await renderView(win, sc);
      expect(html, `${sc} 空数据时应出现空态块`).toMatch(/class="empty-state"/);
    }
  });

  it("④ 任务页「看板」页签空数据时不留三条空栏（整块为空就给空态）", async () => {
    /* 实测缺陷（本次修）：看板三列此前是 `${cards || ""}` —— 一条任务都没有时三列全空，
       只有「待办 0」这种计数标题，没有任何引导；而场景页（render-scene-main.js）早有
       `if(!tasks.length) return renderEmpty("no-tasks")`。两处口径不一致，任务页是漏的那个。 */
    const win = load();
    const { html } = await renderView(win, "tasks");
    expect(html, "任务页看板空数据时应出现空态").toMatch(/class="empty-state"/);
    expect(html).toContain("还没有任务");
  });

  /** 切到任务页的某个页签（看板 / 日历 / 待办） */
  async function switchTasksTab(win, tab) {
    const btn = win.document.querySelector(`#main .tasks-tab[data-tasks-view="${tab}"]`);
    expect(btn, `任务页应有「${tab}」页签`).toBeTruthy();
    btn.click();
    await tick();
    return win.document.getElementById("main").innerHTML;
  }

  it("④b 任务页「待办」页签：全做完了 → 空态说「待办已清空」，不是一张空卡", async () => {
    /* 实测缺陷（本次修）：这里原本调用 renderEmpty("no-today")，而该类型**从未登记**
       ⇒ 落到 renderEmpty 末尾 `return ""`，渲染出一张只有标题和「0」的空卡。 */
    const win = load({
      [PREFIX + "tasks"]: JSON.stringify([{ id: "x1", title: "已完成的", status: "done", createdAt: Date.now() }]),
    });
    await renderView(win, "tasks");
    const html = await switchTasksTab(win, "todo");
    expect(html).toMatch(/class="empty-state"/);
    expect(html).toContain("待办已清空");
  });

  it("④c 任务页「待办」页签：一条任务都没有 → 引导新建（不谎报「都做完了」）", async () => {
    const win = load();
    await renderView(win, "tasks");
    const html = await switchTasksTab(win, "todo");
    expect(html).toMatch(/class="empty-state"/);
    expect(html).toContain("还没有任务");
  });

  it("④d 空态里的「+ 新建任务」在任务页不是死按钮（会把你带到有表单的场景页）", async () => {
    /* 空态按钮是文档级委托（ui-global-events.js），此前只把 overview/stats/recycle 切到 office；
       任务页没有内联新建表单，所以点了只是重渲染一次——看着像没反应（同"死按钮"一族）。 */
    const win = load();
    await renderView(win, "tasks");
    const btn = win.document.querySelector('#main [data-empty-action="new-task"]');
    expect(btn, "空态应给出新建入口").toBeTruthy();
    btn.click();
    await tick();
    expect(win.document.getElementById("taskForm"), "点完应落在能填任务的地方").toBeTruthy();
  });
});

describe("空态类型登记表", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("⑨ 未登记的空态类型不再静默返回空串（控制台留痕）", () => {
    const win = load();
    const warn = vi.spyOn(win.console, "warn").mockImplementation(() => {});
    expect(win.__test.renderEmpty("no-such-type")).toBe("");
    expect(warn, "漏登记必须现形，否则下次还会出现 no-today 那样的静默空白").toHaveBeenCalled();
  });

  it("⑩ 已登记的九个类型都渲染得出 .empty-state（登记表与调用点不得脱节）", () => {
    const win = load();
    for (const type of ["no-tasks", "no-today", "no-records", "no-search", "no-stats",
      "no-links", "no-search-result", "no-notes", "no-backup", "no-history"]) {
      expect(win.__test.renderEmpty(type), `${type} 应渲染出空态`).toMatch(/class="empty-state"/);
    }
  });
});

describe("三态 · 体量与极端长度", () => {
  it("⑤ 办公场景 200 条任务：不抛错，且虚拟滚动如实报全量（data-vcount=200）", async () => {
    /* 看板超阈值走虚拟滚动（render-scene-main.js 的 VIRTUAL_SCROLL_THRESHOLD）：
       DOM 里只渲染视口内那十几张，**data-vcount 记全量**。所以断言不是"200 张卡"，
       而是"卡数 ≤ 视口上限 + vcount 等于 200" —— 否则会把自己产品的性能设计当成 bug 改回去。 */
    const win = load({
      [PREFIX + "tasks"]: JSON.stringify(Array.from({ length: 200 }, (_, i) => longTask(i))),
    });
    const { html } = await renderView(win, "office");
    expect(html, "应进入虚拟滚动分支").toMatch(/data-vcount="200"/);
    const cards = (html.match(/class="kcard"/g) || []).length;
    expect(cards, "虚拟滚动：DOM 只留视口内的卡（不该 200 张全渲染）").toBeGreaterThan(0);
    expect(cards).toBeLessThan(200);
  });

  it("⑤b 低于阈值时全量渲染（虚拟滚动不得把本该直接渲染的列表也吞掉）", async () => {
    const win = load({
      [PREFIX + "tasks"]: JSON.stringify(Array.from({ length: 8 }, (_, i) => longTask(i))),
    });
    const { html } = await renderView(win, "office");
    expect(html).not.toMatch(/data-vcount=/);
    expect((html.match(/class="kcard"/g) || []).length, "8 条应全量渲染出 8 张卡").toBe(8);
  });

  it("⑥ 200 字标题完整进入 DOM（不被截断成空/半句）", async () => {
    const win = load({ [PREFIX + "tasks"]: JSON.stringify([longTask(0)]) });
    const { text } = await renderView(win, "office");
    expect(text).toContain("任".repeat(100));
  });

  it("⑦ 缺字段的脏任务不得让看板崩（渲染照常 + 有占位）", async () => {
    const win = load({ [PREFIX + "tasks"]: JSON.stringify([dirtyTask(1), dirtyTask(2)]) });
    const { html } = await renderView(win, "office");
    expect((html.match(/class="kcard"/g) || []).length).toBe(2);
    expect(html).not.toMatch(/undefined/);
  });

  it("⑧ 功能页在极端数据下也不漏 garbage（任务/时间轴/回收站）", async () => {
    const win = load({
      [PREFIX + "tasks"]: JSON.stringify([longTask(0), dirtyTask(1)]),
    });
    for (const view of ["tasks", "timeline", "recycle"]) {
      const { text } = await renderView(win, view);
      for (const re of GARBAGE) {
        expect(re.test(text), `${view} 出现 ${re}`).toBe(false);
      }
    }
  });
});

describe("三态 · 同一条任务在两个页面的卡片上口径一致", () => {
  /** 一条"该有标签"的任务：场景页与任务页看板都会画它 */
  const tagged = () => ({
    id: "g1", sc: "office", title: "带标签的任务", status: "todo", priority: "P1",
    due: "2026-12-31", tags: ["周报", "重点客户"], createdAt: Date.now(),
  });

  it("⑪ 任务页看板卡片也画 tags（此前只有场景页画，切过去标签就没了）", async () => {
    /* 实测缺陷（2026-10-18 修）：render-overview.js 的看板卡只画"场景徽标 + 优先级 +
       截止日期"，render-scene-main.js 的卡片才画 tags —— 同一条任务换个页面，用户打上的
       标签凭空消失。这里钉住"两处同口径"，不是钉某一处的实现。 */
    const win = load({ [PREFIX + "tasks"]: JSON.stringify([tagged()]) });
    const scene = await renderView(win, "office");
    for (const tag of ["周报", "重点客户"]) {
      expect(scene.html, `场景页卡片应显示标签「${tag}」`).toContain(tag);
    }
    const tasks = await renderView(win, "tasks");
    for (const tag of ["周报", "重点客户"]) {
      expect(tasks.html, `任务页看板卡片应显示标签「${tag}」（换个页面标签不该消失）`).toContain(tag);
    }
  });

  it("⑪b 无标签的任务不画空 chip（既不漏 undefined，也不留空 span）", async () => {
    const win = load({
      [PREFIX + "tasks"]: JSON.stringify([{ id: "g2", sc: "office", title: "无标签", status: "todo", createdAt: Date.now() }]),
    });
    const { html } = await renderView(win, "tasks");
    expect(html).not.toMatch(/undefined/);
    expect(html, "无标签时属性行不该出现空 chip").not.toMatch(/<span class="tag"><\/span>/);
  });

  it("⑪c tags 非数组（脏数据）不得让卡片渲染出 [object Object] 或 undefined", async () => {
    const win = load({
      [PREFIX + "tasks"]: JSON.stringify([{ id: "g3", sc: "office", title: "脏标签", status: "todo", tags: "周报", createdAt: Date.now() }]),
    });
    const { text } = await renderView(win, "tasks");
    for (const re of GARBAGE) {
      expect(re.test(text), `tags 非数组时任务页出现 ${re}`).toBe(false);
    }
  });
});
