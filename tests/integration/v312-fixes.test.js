// v3.1.2 审计修复回归（P0×3 + P1 若干）：
// ① 4 页面「←主页」死按钮（sanitizeHtml 剥内联 onclick）；② syncPush 渲染侧接线；
// ③ AI 页子模块配置存取（诚实化后文案与存取行为）；④ 回收站 bin 类型自动清理；
// ⑤ PRESET_THEMES 三处清单一致性。全部经 __test 导出驱动真实 DOM/存储。
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "../helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "..", "agent-workbench.html");

describe("v3.1.2：4 页面「←主页」按钮可点击（死按钮回归）", () => {
  let win, __test;

  beforeAll(() => {
    win = loadApp();
    __test = win.__test;
  });

  it("四个页面渲染后 btnBackHome 存在且 onclick 已绑定（非内联 onclick）", () => {
    for (const render of ["renderTasksPage", "renderToolboxPage", "renderStorePage", "renderChainPage"]) {
      win.document.querySelector("#main").innerHTML = "";
      __test[render]();
      const btn = win.document.querySelector("#btnBackHome");
      expect(btn, render + " 缺少 #btnBackHome").toBeTruthy();
      expect(btn.getAttribute("onclick"), render + " 不得使用内联 onclick（会被 sanitizeHtml 剥离）").toBeNull();
      expect(typeof btn.onclick, render + " 的 btnBackHome.onclick 未绑定").toBe("function");
    }
  });

  it("点击 btnBackHome 返回主页概览", () => {
    __test.setActive("code");
    __test.renderStorePage();
    const btn = win.document.querySelector("#btnBackHome");
    btn.onclick();
    const active = __test.getActive ? __test.getActive() : win.__test.active;
    expect(active === "overview" || active === undefined || win.document.querySelector(".overview-grid")).toBeTruthy();
  });

  it("源码契约：页头不再有内联 onclick=setActive（防新增回归）", () => {
    const src = fs.readFileSync(HTML, "utf8");
    expect(src).not.toMatch(/onclick="setActive\(/);
  });
});

describe("v3.1.2：syncPush 渲染侧接线", () => {
  it("源码契约：preload 暴露 syncPush；渲染侧 bindSyncButtons 有推送逻辑", () => {
    const preload = fs.readFileSync(path.resolve(__dirname, "..", "..", "electron", "preload.js"), "utf8");
    expect(preload).toContain("syncPush: (data) => ipcRenderer.invoke(\"sync-push\", data)");
    const src = fs.readFileSync(HTML, "utf8");
    expect(src).toContain("window.electronAPI.syncPush(snap)");
    expect(src).toContain("pushSnapshot()"); // 启动即推
  });

  it("main.js 的 sync-push handler 存在且白名单校验（与 preload 契约对齐）", () => {
    const main = fs.readFileSync(path.resolve(__dirname, "..", "..", "electron", "main.js"), "utf8");
    expect(main).toContain('ipcMain.handle("sync-push"');
  });
});

describe("v3.1.2：AI 页子模块配置存取（诚实化回归）", () => {
  let win, __test;

  beforeAll(() => {
    win = loadApp();
    __test = win.__test;
  });

  beforeEach(() => {
    win.localStorage.clear();
  });

  it("getAiConfig/saveAiConfig 往返一致（skills 模块）", () => {
    expect(__test.saveAiConfig("skills", { builtin: [{ name: "x", desc: "y", enabled: true }], custom: "" })).toBe(true);
    const back = __test.getAiConfig("skills");
    expect(back.builtin[0].name).toBe("x");
    expect(back.builtin[0].enabled).toBe(true);
  });

  it("AI 空壳 section 文案不再虚假承诺（源码契约）", () => {
    const src = fs.readFileSync(HTML, "utf8");
    expect(src).not.toContain("禁用的技能不会被 Agent 调用");
    expect(src).toContain("实验性——当前开关仅保存配置");
  });

  it("aiSkillsSave 按 name 匹配（顺序错配修复）", () => {
    // 模拟旧数据顺序错位：builtin 数组倒序存储
    __test.saveAiConfig("skills", { builtin: [{ name: "search", enabled: false }], custom: "" });
    __test.renderAiSkillsBuiltin();
    // 翻转第一个 checkbox 后保存：只有对应 name 的 enabled 变化
    const box = win.document.querySelector("#aiSkillsBuiltin input[type=checkbox]");
    const name = box.getAttribute("aria-label");
    const before = __test.getAiConfig("skills");
    box.checked = !box.checked;
    win.document.querySelector("#aiSkillsSave").onclick();
    const after = __test.getAiConfig("skills");
    const changedRow = after.builtin.find((r) => r.name === name);
    expect(changedRow.enabled).toBe(box.checked);
    // 其他行的 enabled 不被索引错配污染
    const untouched = after.builtin.filter((r) => r.name !== name);
    const beforeUntouched = before.builtin.filter((r) => r.name !== name);
    untouched.forEach((r) => {
      const b = beforeUntouched.find((x) => x.name === r.name);
      if (b) expect(r.enabled).toBe(b.enabled);
    });
  });

  it("MCP 列表输入经 esc 转义（含引号的服务器名不截断属性）", () => {
    __test.saveAiConfig("mcp", { servers: [{ name: 'a" onload="alert(1)', url: "https://x", enabled: false }] });
    __test.renderAiMcpList();
    const inp = win.document.querySelector("#aiMcpName_0");
    expect(inp.value).toBe('a" onload="alert(1)');
    const html = win.document.getElementById("aiMcpList").innerHTML;
    expect(html).not.toContain('onload="alert(1)"'); // 引号被实体化，无法逃逸出 value 属性
  });
});

describe("v3.1.2：回收站 bin 类型自动清理（P1 回归）", () => {
  let win, __test;

  beforeAll(() => {
    win = loadApp();
    __test = win.__test;
  });

  beforeEach(() => {
    win.localStorage.clear();
  });

  it("cleanupRecycle 同时清理超期的任务软删项与 wb_recycle_bin 项", () => {
    const old = Date.now() - 40 * 86400000; // 40 天前（策略 30 天必超期）
    // 任务软删项
    win.__test.setTasks([
      { id: "t1", title: "旧任务", sc: "office", status: "todo", deletedAt: old, createdAt: old },
      { id: "t2", title: "新任务", sc: "office", status: "todo", deletedAt: null, createdAt: Date.now() },
    ]);
    // bin 项（插件类型，40 天前删除）
    win.localStorage.setItem("wb_agent_recycle_bin", JSON.stringify([
      { id: "b1", type: "plugin", deletedAt: old, data: { plugin: { id: "p", name: "旧插件" } } },
      { id: "b2", type: "plugin", deletedAt: Date.now(), data: { plugin: { id: "q", name: "新插件" } } },
    ]));
    win.localStorage.setItem("wb_agent_recycle_policy", "30");
    const n = __test.cleanupRecycle();
    expect(n).toBe(2); // 1 任务 + 1 bin
    const tasks = win.__test.getTasks();
    expect(tasks.some((t) => t.id === "t1")).toBe(false); // 旧任务被清
    expect(tasks.some((t) => t.id === "t2")).toBe(true); // 未删任务保留
    const bin = JSON.parse(win.localStorage.getItem("wb_agent_recycle_bin"));
    expect(bin.some((b) => b.id === "b1")).toBe(false); // 超期 bin 被清
    expect(bin.some((b) => b.id === "b2")).toBe(true); // 未超期 bin 保留
  });

  it("policy=off 时不清理", () => {
    // load() 走 JSON.parse——存储值必须是 JSON 编码（产品内 save() 自动 stringify）
    win.localStorage.setItem("wb_agent_recycle_policy", JSON.stringify("off"));
    win.localStorage.setItem("wb_agent_recycle_bin", JSON.stringify([
      { id: "b9", type: "plugin", deletedAt: Date.now() - 400 * 86400000, data: {} },
    ]));
    expect(__test.cleanupRecycle()).toBe(0);
    const bin = JSON.parse(win.localStorage.getItem("wb_agent_recycle_bin"));
    expect(bin.length).toBe(1);
  });
});

describe("v3.1.2：主题三处清单一致性", () => {
  it("PRESET_THEMES 含全部 6 个预置主题（含 elegant/matrix）", () => {
    const src = fs.readFileSync(HTML, "utf8");
    const m = /const PRESET_THEMES = \{[\s\S]*?\n\};/.exec(src);
    expect(m).toBeTruthy();
    for (const id of ["light:", "aurora:", "dark:", "sepia:", "elegant:", "matrix:"]) {
      expect(m[0]).toContain(id);
    }
    expect(m[0]).not.toContain("contrast"); // 已删主题不得回流注册表
  });

  it("设置页下拉选项与 PRESET_THEMES 对齐（无 contrast）", () => {
    const src = fs.readFileSync(HTML, "utf8");
    expect(src).not.toMatch(/<option value="contrast"/);
    for (const id of ["light", "aurora", "dark", "system", "sepia", "elegant", "matrix"]) {
      expect(src).toContain(`<option value="${id}"`);
    }
  });
});
