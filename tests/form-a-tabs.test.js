/**
 * form-a-tabs.test.js —— 批八：视图注册表（数据层）+ tabbar 退役契约
 * ----------------------------------------------------------------------------
 * 用户 2026-11-17 裁定「取消 tabbar 那一栏 / 工作区入口不需要了，直接常驻聊天」。
 * 顶部标签页 UI（#formATabs / #tabChat / ＋ / 右栏把手 / .workspace-open）整条删除；
 * 视图注册表 getFormATabs / formATabAdd / formATabClose / formATabOpenScene 保留为数据层，
 * 工作台 tile 仍按场景开/切视图，只是不再渲染成可见标签页。
 *
 * 本文件守的契约：
 *  ① 默认注册表一个「今日」视图（scene=office——§1 字面 today 无此场景，11-12 裁 office）；
 *  ② 脏存储降级 / 合法数组原样读入（形状守卫）；
 *  ③ formATabSwitch = setActive(scene)+render()，不存在 id 是 no-op；
 *  ④ ＋ 追加默认场景视图并落盘；× 移除且常驻 ≥1；关活跃项兜底剩余首项；
 *  ⑤ 静态骨架无 tabbar / 无 tab 发射点 / 无 workspace-open 类；
 *  ⑥ 模式胶囊迁入左栏且 renderSide 重绘后仍存活（id 复用既有绑定）；
 *  ⑦ 未登记 data-action 点击无异常无副作用；
 *  ⑧ 存储键登记契约（data-keys-registry 同口径）。
 * 运行：npm test -- form-a-tabs
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const TABS_KEY = PREFIX + "form_a_tabs";
const DFLT = [{ id: "today", scene: "office", title: "今日" }];
const SEED2 = [{ id: "t1", scene: "office", title: "今日" }, { id: "o1", scene: "overview", title: "总览" }];

function boot(extra) {
  return loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });
}
async function ready(win) {
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}
const stored = (win) => JSON.parse(win.localStorage.getItem(TABS_KEY) || "null");

describe("视图注册表：数据层默认与形状守卫", () => {
  it("① 默认一个今日视图（scene=office）", async () => {
    const win = await ready(boot());
    expect(win.getFormATabs()).toEqual(DFLT);
  });

  it("② 脏存储降级：非数组 / 空数组 / 元素缺字段 ⇒ 回默认", async () => {
    for (const bad of ["not-json", "[]", '[{"id":"x"}]', '[{"id":"x","scene":"office"}]']) {
      const win = await ready(boot({ [TABS_KEY]: bad }));
      expect(win.getFormATabs()).toEqual(DFLT);
    }
  });

  it("② 预置合法数组原样读入", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    expect(win.getFormATabs()).toEqual(SEED2);
  });
});

describe("切场景（数据层 API）", () => {
  it("③ formATabSwitch(id) ⇒ setActive(scene) 并落盘", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    win.formATabSwitch("o1");
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "active"))).toBe("overview");
  });

  it("③ 切不存在的 id ⇒ 无变化不抛", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    expect(() => win.formATabSwitch("ghost")).not.toThrow();
    expect(win.localStorage.getItem(PREFIX + "active")).toBe(null);
  });
});

describe("＋ 追加 / × 移除（常驻 ≥1）", () => {
  it("④ formATabAdd 追加 office 视图、标题「今日 2」并落盘", async () => {
    const win = await ready(boot());
    win.formATabAdd();
    const tabs = win.getFormATabs();
    expect(tabs).toHaveLength(2);
    expect(tabs[1].scene).toBe("office");
    expect(tabs[1].title).toBe("今日 2");
    expect(stored(win)).toEqual(tabs);
  });

  it("④ 非默认场景活跃时追加 ⇒ active 拉回 office", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2), [PREFIX + "active"]: JSON.stringify("overview") }));
    win.formATabAdd();
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "active"))).toBe("office");
  });

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
    expect(win.localStorage.getItem(PREFIX + "active")).toBe(null);
    expect(stored(win)).toEqual([SEED2[0]]);
  });

  it("④ 关活跃项 ⇒ setActive 兜底剩余首项", async () => {
    const win = await ready(boot({ [TABS_KEY]: JSON.stringify(SEED2) }));
    win.formATabClose("t1");
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "active"))).toBe("overview");
  });
});

describe("批八骨架：tabbar 整条退役", () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  it("⑤ 静态 HTML 无 .tabbar / #formATabs / #tabChat / tab 发射点 / workspace-open 规则", () => {
    const HTML = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
    for (const token of ['class="tabbar"', 'id="formATabs"', 'id="tabChat"',
      'data-action="faTabAdd"', 'data-action="faTabSwitch"', 'data-action="faTabClose"',
      'data-action="faRailToggle"', 'data-action="faChatFocus"', '.workspace-open']) {
      expect(HTML, `批八应彻底移除 ${token}`).not.toContain(token);
    }
  });

  it("⑤ 运行时 DOM 同样无残留（tab 条节点不因渲染复活）", async () => {
    const win = await ready(boot());
    for (const sel of [".tabbar", "#formATabs", "#tabChat", '[data-action="faTabSwitch"]',
      '[data-action="faTabAdd"]', '[data-action="faRailToggle"]']) {
      expect(win.document.querySelector(sel), `批八不应存在 ${sel}`).toBeNull();
    }
    expect(win.document.querySelector(".body").classList.contains("workspace-open")).toBe(false);
  });

  it("⑥ 模式胶囊在左栏内，且 renderSide 重绘后仍存活（id 复用既有绑定）", async () => {
    const win = await ready(boot());
    const side = win.document.querySelector("#side");
    expect(side.querySelector("#uiModePill"), "胶囊应是 #side 的直接后代").toBeTruthy();
    win.__test.render();
    const after = win.document.querySelector("#side #uiModePill");
    expect(after, "renderSide 重建 innerHTML 时须保留胶囊节点").toBeTruthy();
    expect(after.querySelectorAll(".mode-pill-item")).toHaveLength(3);
  });
});

describe("委托边界", () => {
  it("⑦ 未登记 data-action 点击 ⇒ 无异常、无副作用", async () => {
    const win = await ready(boot());
    const ghost = win.document.createElement("button");
    ghost.setAttribute("data-action", "faGhost");
    win.document.body.appendChild(ghost);
    expect(() => ghost.click()).not.toThrow();
    expect(win.getFormATabs()).toEqual(DFLT);
    ghost.remove();
  });

  it("⑧ form_a_tabs 已在 DATA_KEY_REGISTRY 登记", async () => {
    const win = await ready(boot());
    expect(win.__test.dataKeyRegistered("form_a_tabs")).toBe(true);
  });
});
