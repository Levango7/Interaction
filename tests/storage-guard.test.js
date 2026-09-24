/**
 * storage-guard.test.js —— 存储安全壳（v3.7.46）
 * ----------------------------------------------------------------------------
 * 起因（用户 2026-09-24 截图「灰色大块没内容」）：
 *   顶栏和 AI 助手面板在，但**侧栏 .nav-item 为 0 项、#main 的 innerHTML 为 0 却仍有 441px 高度**
 *   —— 那块高度就是截图里的灰块。
 *   故障注入实验定位到唯一触发条件：**localStorage 抛错**（indexedDB 抛错反而没事，有兜底）。
 *   现实触发场景：浏览器「阻止网站保存数据」、隐私模式、file:// 被策略限制、配额超限。
 *   应用里 240+ 处裸 localStorage 调用散在 19 个文件，启动期任意一处抛出都会中断渲染 → 整页白屏。
 *
 * 修法：在所有业务块**之前**装一层安全代理，原生可用走原生，抛错则落内存。
 *
 * 本测试守三件事（防止后期被挪走/删掉/改残）：
 *   ① 结构：安全壳存在，且**位于 core 块之前**（装晚了就拦不住启动期的读写）；
 *   ② 接口：六种方法齐全（getItem/setItem/removeItem/clear/key/length）——
 *           业务代码只用到这六种，缺一个就会在别处静默炸；
 *   ③ 行为：**真跑一遍**——注入三种故障存储，断言不再抛错且读写正确。
 *      ⚠️ 只做静态断言不够：v3.7.46 之前没有任何测试会碰到"存储不可用"这条路径，
 *         所以整页白屏这种最严重的故障反而是**测试盲区**。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");

const MARK = "存储安全壳（Storage Guard）";
const METHODS = ["getItem", "setItem", "removeItem", "clear", "key", "length"];

/** 从 HTML 里切出安全壳 IIFE 的源码，供真实执行 */
function guardSource() {
  const i0 = HTML.indexOf(MARK);
  if (i0 < 0) return null;
  const fnStart = HTML.indexOf("(function(){", i0);
  if (fnStart < 0) return null;
  const endMark = "})();";
  const fnEnd = HTML.indexOf(endMark, fnStart);
  if (fnEnd < 0) return null;
  return HTML.slice(fnStart, fnEnd + endMark.length);
}

/** 用给定的 window.localStorage 跑一遍安全壳，返回装好壳的 window */
function install(win) {
  const src = guardSource();
  expect(src, "HTML 里应能切出安全壳 IIFE 源码").toBeTruthy();
  const factory = new Function("window", "setTimeout", src + "\nreturn window;");
  return factory(win, () => {});
}

/** 造一个 Storage 替身；throws 指定哪些方法抛错 */
function fakeStore({ throwOn = [] } = {}) {
  const map = new Map();
  const api = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
  for (const name of throwOn) {
    api[name] = () => { throw new Error("storage disabled (simulated)"); };
  }
  return { api, map };
}

describe("存储安全壳（v3.7.46 修「灰色大块没内容」）", () => {
  it("① 安全壳存在，且位于 core 业务块之前", () => {
    const iGuard = HTML.indexOf(MARK);
    expect(iGuard, "HTML 中应有存储安全壳").toBeGreaterThan(-1);
    // 拼回态下 core.js 的内容会展开；源码态下没有这行，故只在存在时断言顺序
    const iCore = HTML.indexOf("===== Core Layer");
    if (iCore > -1) {
      expect(iGuard, "安全壳必须装在 core 之前，否则拦不住启动期的读写").toBeLessThan(iCore);
    }
  });

  it("② 六种方法齐全（业务代码只用到这六种）", () => {
    const src = guardSource();
    expect(src).toBeTruthy();
    for (const m of METHODS) {
      /* length 是 getter（`get length(){`），不是 `length:` —— 按属性写法断言会假红 */
      if (m === "length") expect(src, "安全壳应实现 length（getter）").toMatch(/get\s+length\s*\(/);
      else expect(src, `安全壳应实现 ${m}`).toContain(m + ":");
    }
  });

  it("③ 原生可用时【完全不接管】（正常路径零行为变化）", () => {
    const { api, map } = fakeStore();
    const win = install({ localStorage: api });
    /* ⚠️ 这条是**回归护栏**：第一版无条件装壳，把 window.localStorage 换成固定 getter，
       结果测试/第三方后续对 localStorage 的替换·打桩全部失效 → 16 条既有测试被打红。
       正确行为：原生可用就原样返回，连引用都不换。 */
    expect(win.localStorage, "原生可用时不应替换 localStorage 引用").toBe(api);
    win.localStorage.setItem("k", "v");
    expect(win.localStorage.getItem("k")).toBe("v");
    expect(map.get("k"), "应真的写进原生存储").toBe("v");
  });

  it("④ 访问 localStorage 就抛错（隐私模式/策略禁用）→ 不抛，降级内存且读写正确", () => {
    let boom = true;
    const win = install({
      get localStorage() { if (boom) throw new Error("storage disabled (simulated)"); return null; },
    });
    expect(() => win.localStorage.setItem("k", "v"), "降级路径不应抛错").not.toThrow();
    expect(win.localStorage.getItem("k")).toBe("v");
    expect(win.localStorage.length).toBe(1);
    expect(win.localStorage.key(0)).toBe("k");
    win.localStorage.removeItem("k");
    expect(win.localStorage.getItem("k")).toBeNull();
  });

  it("⑤ 配额超限（getItem 正常、setItem 抛）→ 不抛，且读回新值而不是原生旧值", () => {
    const { api, map } = fakeStore({ throwOn: ["setItem"] });
    map.set("k", "旧值");                       // 原生里已有一份旧值
    const win = install({ localStorage: api });
    expect(() => win.localStorage.setItem("k", "新值"), "配额超限不应抛错").not.toThrow();
    expect(win.localStorage.getItem("k"), "应读到内存里的新值，不能回退成原生旧值").toBe("新值");
  });

  it("⑥ 全方法抛错时 clear / length / key 仍可用（导出、备份遍历不会崩）", () => {
    const win = install({
      get localStorage() { throw new Error("storage disabled (simulated)"); },
    });
    const ls = win.localStorage;
    expect(() => { ls.setItem("a", "1"); ls.setItem("b", "2"); }).not.toThrow();
    expect(ls.length).toBe(2);
    expect([ls.key(0), ls.key(1)].sort()).toEqual(["a", "b"]);
    expect(() => ls.clear()).not.toThrow();
    expect(ls.length).toBe(0);
  });
});
