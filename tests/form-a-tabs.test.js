/**
 * form-a-tabs.test.js —— 形态 A B2：视图注册表 + data-action 委托（功能设计 §1/§2/§3）
 * ----------------------------------------------------------------------------
 * 守的契约：
 *  ① 默认注册表一个「今日」视图（scene=office——§1 字面 today 无此场景，11-12 裁 office，
 *     render-entry.js FORM_A_DEFAULT_SCENE 注释同）；单 tab 不渲染 ×；
 *  ② 切 tab = setActive(scene)+render()：wb_agent_active 变 + is-on/aria-selected 跟随
 *     （is-on 翻转本身即 render() 重绘的证据——renderFormATabs 由 render() 调用）；
 *  ③ ＋ 追加默认场景视图并落盘（wb_agent_form_a_tabs，JSON），非默认场景活跃时拉回 office；
 *  ④ × 移除且常驻 ≥1（单 tab 直接调 formATabClose 是 no-op；存储不变）；关活跃项
 *     setActive 兜底剩余首项；重复场景只亮首个；
 *  ⑤ 委托真通路：el.click() 经 document 级 [data-action] 委托命中 FORM_A_ACTIONS
 *     （faTabSwitch/faTabAdd/faTabClose/faRailToggle 四键首落）；
 *  ⑥ faRailToggle 只转发不重写：#btnTaskRail 原处理器真执行（rail-collapsed 类 + 落盘）；
 *  ⑦ 未登记 action 点击无异常无副作用（委托表查不到即 return）；
 *  ⑧ §3 焦点序：tabbar 内 DOM 序 pill → tabs → ＋ → railbtn，无正 tabindex；
 *  ⑨ 存储键登记契约（data-keys-registry 同口径）。
 * 运行：npm test -- form-a-tabs
 */
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const TABS_KEY = PREFIX + "form_a_tabs";
const DFLT = [{ id: "today", scene: "office", title: "今日" }];

function boot(extra) {
  return loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });
}
async function ready(win) {
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}
const tabBtns = (win) => Array.from(win.document.querySelectorAll("#formATabs [data-action='faTabSwitch']"));
const xBtns = (win) => Array.from(win.document.querySelectorAll("#formATabs [data-action='faTabClose']"));
const onIds = (win) => tabBtns(win).filter((b) => b.classList.contains("is-on")).map((b) => b.getAttribute("data-tab-id"));
const stored = (win) => JSON.parse(win.localStorage.getItem(TABS_KEY) || "null");
const SEED2 = [{ id: "t1", scene: "office", title: "今日" }, { id: "o1", scene: "overview", title: "总览" }];

describe("视图注册表：默认与渲染", () => {
  it("① 默认一个今日视图（office）；单 tab 无 ×；is-on/aria-selected 落在它身上", async () => {
    const win = await ready(boot());
    expect(win.getFormATabs()).toEqual(DFLT);
    expect(tabBtns(win)).toHaveLength(1);
    expect(xBtns(win)).toHaveLength(0);
    const b = tabBtns(win)[0];
    expect(b.getAttribute("data-tab-id")).toBe("today");
    expect(b.classList.contains("is-on")).toBe(true);
    expect(b.getAttribute("aria-selected")).toBe("true");
  });

  it("① 重复场景视图只亮首个（active 是唯一事实源）", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify([{ id: "a", scene: "office", title: "今日" }, { id: "b", scene: "office", title: "今日 2" }]) }));
    expect(onIds(win)).toEqual(["a"]);
  });

  it("⑧ tabbar 焦点序＝DOM 序（pill → tabs → ＋ → railbtn），无正 tabindex", async () => {
    const win = await ready(boot());
    const kids = Array.from(win.document.querySelector(".tabbar").children);
    expect(kids.map((k) => k.id || k.getAttribute("data-action"))).toEqual(["uiModePill", "formATabs", "faTabAdd", "faRailToggle"]);
    kids.forEach((k) => {
      const ti = k.getAttribute && k.getAttribute("tabindex");
      expect(ti === null || Number(ti) <= 0).toBe(true);
    });
    expect(win.document.querySelector('[data-action="faTabAdd"]').getAttribute("data-action")).toBe("faTabAdd");
    expect(win.document.querySelector('[data-action="faRailToggle"]').getAttribute("data-action")).toBe("faRailToggle");
  });

  it("③ 脏存储降级：非数组 / 空数组 / 元素缺字段 ⇒ 回默认", async () => {
    for (const bad of ["not-json", "[]", '[{"id":"x"}]', '[{"id":"x","scene":"office"}]']) {
      const win = await ready(boot({ [TABS_KEY]: bad }));
      expect(win.getFormATabs()).toEqual(DFLT);
    }
  });

  it("③ 预置合法数组原样读入并渲染（形状守卫保留合法条目）", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    expect(win.getFormATabs()).toEqual(SEED2);
    expect(tabBtns(win)).toHaveLength(2);
    expect(onIds(win)).toEqual(["t1"]); // active 默认 office
  });
});

describe("切 tab（§1：setActive(scene)+render）", () => {
  it("② 真实点击委托 ⇒ wb_agent_active 变 + is-on 跟随", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    tabBtns(win).find((b) => b.getAttribute("data-tab-id") === "o1").click();
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "active"))).toBe("overview"); // save() 存 JSON 串
    expect(onIds(win)).toEqual(["o1"]);
  });

  it("② 切不存在的 id ⇒ 无变化不抛", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    expect(() => win.formATabSwitch("ghost")).not.toThrow();
    expect(win.localStorage.getItem(PREFIX + "active")).toBe(null); // 未发生 setActive ⇒ 从不落盘
    expect(onIds(win)).toEqual(["t1"]);
  });
});

describe("＋ 追加默认场景视图", () => {
  it("③ 真实点击 ＋ ⇒ 追加 office 视图、标题「今日 N」、落盘", async () => {
    const win = await ready(boot());
    win.document.querySelector('[data-action="faTabAdd"]').click();
    const tabs = win.getFormATabs();
    expect(tabs).toHaveLength(2);
    expect(tabs[1].scene).toBe("office");
    expect(tabs[1].title).toBe("今日 2");
    expect(stored(win)).toEqual(tabs);
    expect(tabBtns(win)).toHaveLength(2); // 重绘后两 tab 在条上
  });

  it("③ 非默认场景活跃时点 ＋ ⇒ active 拉回 office", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2), [PREFIX + "active"]: JSON.stringify("overview") }));
    win.document.querySelector('[data-action="faTabAdd"]').click();
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "active"))).toBe("office");
    expect(onIds(win)[0]).toBe("t1"); // active=office ⇒ 首个 office 场景 tab 亮起（重复场景只亮首个）
  });
});

describe("× 移除（常驻 ≥1）", () => {
  it("④ 单 tab 直接调 formATabClose ⇒ no-op，存储不被写", async () => {
    const win = await ready(boot());
    win.formATabClose("today");
    expect(win.getFormATabs()).toEqual(DFLT);
    expect(win.localStorage.getItem(TABS_KEY)).toBe(null);
  });

  it("④ 关非活跃项 ⇒ 长度减 1、active 不变、落盘", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    win.formATabClose("o1");
    expect(win.getFormATabs()).toEqual([SEED2[0]]);
    expect(win.localStorage.getItem(PREFIX + "active")).toBe(null); // active 未变，无 setActive 落盘
    expect(stored(win)).toEqual([SEED2[0]]);
  });

  it("④ 关活跃项 ⇒ setActive 兜底剩余首项 + is-on 跟随", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    win.formATabClose("t1"); // t1.scene=office=active
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "active"))).toBe("overview"); // save() 存 JSON 串
    expect(onIds(win)).toEqual(["o1"]);
  });

  it("④ 关到只剩一个 ⇒ × 从 DOM 消失（多 tab 才渲染 ×）", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    expect(xBtns(win)).toHaveLength(2);
    win.formATabClose("o1");
    expect(xBtns(win)).toHaveLength(0);
  });

  it("④ × 按钮形状：aria-label=关闭标签页、内容是 SVG（lint-icons 只扫 src，运行时钉住这处 JS 发射）", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    const x = xBtns(win)[0];
    expect(x.getAttribute("aria-label")).toBe("关闭标签页");
    expect(x.innerHTML).toContain("<svg");
  });
});

describe("faRailToggle 转发（行项不重写行为）", () => {
  it("⑥ 点 tabbar 把手 ⇒ #btnTaskRail 原处理器真执行（类 + 落盘双证）", async () => {
    const win = await ready(boot()); // jsdom innerWidth=1024 ⇒ isWide() 走桌面分支
    const layoutBody = win.document.querySelector(".body"); // collapseDesktop 加类在 .body 布局层
    expect(win.localStorage.getItem(PREFIX + "task_rail_collapsed")).toBe(null);
    win.document.querySelector('[data-action="faRailToggle"]').click();
    expect(layoutBody.classList.contains("rail-collapsed")).toBe(true);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "task_rail_collapsed"))).toBe("1");
    win.document.querySelector('[data-action="faRailToggle"]').click();
    expect(layoutBody.classList.contains("rail-collapsed")).toBe(false);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "task_rail_collapsed"))).toBe("0");
  });
});

describe("委托表边界", () => {
  it("⑦ 未登记 action 点击 ⇒ 无异常、无副作用", async () => {
    const win = await ready(boot());
    const ghost = win.document.createElement("button");
    ghost.setAttribute("data-action", "faGhost");
    win.document.body.appendChild(ghost);
    expect(() => ghost.click()).not.toThrow();
    expect(win.getFormATabs()).toEqual(DFLT);
    ghost.remove();
  });

  it("⑨ form_a_tabs 已在 DATA_KEY_REGISTRY 登记", async () => {
    const win = await ready(boot());
    expect(win.__test.dataKeyRegistered("form_a_tabs")).toBe(true);
  });
});
