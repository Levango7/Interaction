// T3.2 习惯链 UI 编辑测试
// 覆盖：getCustomLinks/saveCustomLinks 持久化、addCustomLink 添加+验证、
//       removeCustomLink 删除、updateCustomLink 修改、toggleCustomLink 启用/禁用、
//       resetCustomLinks 重置、getLinks 优先级（自定义 > DEFAULT_LINKS）。
// 策略：每个 it 用 loadApp 取独立 window，win.localStorage.clear() 重置后从 win.__test 取被测函数断言。
// 注意：自定义链存 localStorage key "wb_custom_links"（不带 PREFIX）；
//       DEFAULT_LINKS 字段为 {id,name,fromSc,kw,toSc,taskTitle,priority,enabled}。

import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const CUSTOM_KEY = "wb_custom_links";

describe("T3.2 习惯链 UI 编辑", () => {
  it("1: getCustomLinks 默认返回 null（无自定义时），getLinks 返回 DEFAULT_LINKS", () => {
    const win = loadApp();
    const { getCustomLinks, getLinks, DEFAULT_LINKS } = win.__test;
    win.localStorage.clear();
    expect(getCustomLinks()).toBeNull();
    const links = getLinks();
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBe(DEFAULT_LINKS.length);
    // 内容与 DEFAULT_LINKS 一致（按 fromSc/kw/toSc 对齐）
    DEFAULT_LINKS.forEach((d, i) => {
      expect(links[i].fromSc).toBe(d.fromSc);
      expect(links[i].kw).toBe(d.kw);
      expect(links[i].toSc).toBe(d.toSc);
    });
  });

  it("2: saveCustomLinks 持久化到 localStorage(wb_custom_links)", () => {
    const win = loadApp();
    const { saveCustomLinks, getCustomLinks } = win.__test;
    win.localStorage.clear();
    const arr = [
      { id: "c1", name: "测试链", fromSc: "office", kw: "会议", toSc: "code", taskTitle: "奖励：写代码", priority: "P2", enabled: true }
    ];
    saveCustomLinks(arr);
    // localStorage 中是 JSON.stringify
    expect(win.localStorage.getItem(CUSTOM_KEY)).toBe(JSON.stringify(arr));
    // getCustomLinks 读回相等
    expect(getCustomLinks()).toEqual(arr);
  });

  it("3: addCustomLink 添加新链（src≠dst，kw 非空）", () => {
    const win = loadApp();
    const { addCustomLink, getLinks, getCustomLinks } = win.__test;
    win.localStorage.clear();
    const r = addCustomLink("office", "交付", "study");
    expect(r.ok).toBe(true);
    expect(r.link).toBeTruthy();
    expect(r.link.fromSc).toBe("office");
    expect(r.link.kw).toBe("交付");
    expect(r.link.toSc).toBe("study");
    expect(r.link.id).toBeTruthy();
    expect(r.link.enabled).toBe(true);
    // getLinks 包含新链
    const links = getLinks();
    expect(links.some(l => l.id === r.link.id)).toBe(true);
    // 自定义链已持久化
    const custom = getCustomLinks();
    expect(custom).not.toBeNull();
    expect(custom.some(l => l.id === r.link.id)).toBe(true);
  });

  it("4: addCustomLink 拒绝无效输入（src==dst 与 kw 空）", () => {
    const win = loadApp();
    const { addCustomLink, getCustomLinks } = win.__test;
    win.localStorage.clear();
    // src == dst
    const r1 = addCustomLink("office", "x", "office");
    expect(r1.ok).toBe(false);
    expect(r1.err).toBeTruthy();
    // kw 空
    const r2 = addCustomLink("office", "", "study");
    expect(r2.ok).toBe(false);
    expect(r2.err).toBeTruthy();
    // kw 仅空白
    const r3 = addCustomLink("office", "   ", "study");
    expect(r3.ok).toBe(false);
    // 非法场景
    const r4 = addCustomLink("foo", "x", "study");
    expect(r4.ok).toBe(false);
    const r5 = addCustomLink("office", "x", "bar");
    expect(r5.ok).toBe(false);
    // 全部失败后不应写入自定义链
    expect(getCustomLinks()).toBeNull();
  });

  it("5: removeCustomLink 删除指定链", () => {
    const win = loadApp();
    const { addCustomLink, removeCustomLink, getLinks } = win.__test;
    win.localStorage.clear();
    const r = addCustomLink("code", "上线", "life");
    expect(r.ok).toBe(true);
    const id = r.link.id;
    expect(getLinks().some(l => l.id === id)).toBe(true);
    const ok = removeCustomLink(id);
    expect(ok).toBe(true);
    expect(getLinks().some(l => l.id === id)).toBe(false);
    // 删除不存在的 id 返回 false
    expect(removeCustomLink("nonexistent-id")).toBe(false);
  });

  it("6: resetCustomLinks 清除自定义恢复默认", () => {
    const win = loadApp();
    const { addCustomLink, resetCustomLinks, getCustomLinks, getLinks, DEFAULT_LINKS } = win.__test;
    win.localStorage.clear();
    addCustomLink("office", "交付", "study");
    addCustomLink("code", "上线", "life");
    expect(getCustomLinks()).not.toBeNull();
    expect(getLinks().length).toBe(DEFAULT_LINKS.length + 2);
    resetCustomLinks();
    expect(getCustomLinks()).toBeNull();
    expect(win.localStorage.getItem(CUSTOM_KEY)).toBeNull();
    // getLinks 恢复 DEFAULT_LINKS
    const links = getLinks();
    expect(links.length).toBe(DEFAULT_LINKS.length);
  });

  it("7: getLinks 优先返回自定义链（覆盖 wb_agent_links 与 DEFAULT_LINKS）", () => {
    const win = loadApp();
    const { saveCustomLinks, getLinks, DEFAULT_LINKS, PREFIX } = win.__test;
    win.localStorage.clear();
    // 同时写 wb_agent_links 和 wb_custom_links，getLinks 应优先读 wb_custom_links
    win.localStorage.setItem(PREFIX + "links", JSON.stringify(DEFAULT_LINKS));
    const custom = [
      { id: "x1", name: "自定义1", fromSc: "life", kw: "运动", toSc: "study", taskTitle: "奖励：看书", priority: "P2", enabled: true }
    ];
    saveCustomLinks(custom);
    const links = getLinks();
    expect(links).toEqual(custom);
    expect(links.length).toBe(1);
    expect(links[0].id).toBe("x1");
  });

  it("8: toggleCustomLink 切换启用/禁用状态", () => {
    const win = loadApp();
    const { addCustomLink, toggleCustomLink, getLinks } = win.__test;
    win.localStorage.clear();
    const r = addCustomLink("study", "复习", "code");
    expect(r.ok).toBe(true);
    const id = r.link.id;
    expect(getLinks().find(l => l.id === id).enabled).toBe(true);
    // 禁用
    expect(toggleCustomLink(id, false)).toBe(true);
    expect(getLinks().find(l => l.id === id).enabled).toBe(false);
    // 启用
    expect(toggleCustomLink(id, true)).toBe(true);
    expect(getLinks().find(l => l.id === id).enabled).toBe(true);
    // 不存在的 id 返回 false
    expect(toggleCustomLink("no-such-id", true)).toBe(false);
  });

  it("9: updateCustomLink 修改关键词与目标场景", () => {
    const win = loadApp();
    const { addCustomLink, updateCustomLink, getLinks } = win.__test;
    win.localStorage.clear();
    const r = addCustomLink("office", "交付", "study");
    const id = r.link.id;
    // 修改关键词
    const r1 = updateCustomLink(id, { kw: "上线" });
    expect(r1.ok).toBe(true);
    expect(r1.link.kw).toBe("上线");
    // 修改目标场景
    const r2 = updateCustomLink(id, { toSc: "life" });
    expect(r2.ok).toBe(true);
    expect(r2.link.toSc).toBe("life");
    // getLinks 反映修改
    const link = getLinks().find(l => l.id === id);
    expect(link.kw).toBe("上线");
    expect(link.toSc).toBe("life");
    // 拒绝 src==dst
    const r3 = updateCustomLink(id, { toSc: "office" });
    expect(r3.ok).toBe(false);
    // 拒绝空 kw
    const r4 = updateCustomLink(id, { kw: "" });
    expect(r4.ok).toBe(false);
    // 不存在的 id
    const r5 = updateCustomLink("no-such-id", { kw: "x" });
    expect(r5.ok).toBe(false);
  });

  it("10: runLinks 兼容自定义链（自定义链触发联动）", () => {
    const win = loadApp();
    const { addCustomLink, setTasks, completeTask, getTasks } = win.__test;
    win.localStorage.clear();
    // 添加自定义链：life 运动 → study
    addCustomLink("life", "运动", "study");
    const id = "t1";
    setTasks([{ id, sc: "life", title: "晨跑运动5公里", status: "todo", doneAt: null, tags: [], created: Date.now() }]);
    completeTask(id);
    const tasks = getTasks();
    const reward = tasks.find(t => t.sc === "study" && t.tags && t.tags.includes("联动"));
    expect(reward).toBeTruthy();
    expect(reward.title).toContain("运动");
  });
});