/**
 * feature-card-fields.test.js —— 功能卡「表单字段 ⇄ 采集白名单」一致性与本轮窄屏修复的守护
 * ----------------------------------------------------------------------------
 * 背景（2026-09-25 用户实测标注引出）：
 *   ① 报销卡只有「日期」没有「时间」——一天多笔报销无法区分（本轮补 time 字段，默认当前时间）。
 *   ② 更隐蔽的一类：`_featureCardBind(key, fieldKeys)` 用 **fieldKeys 白名单**采集表单值，
 *      不在名单里的字段**有输入框也永远存不进去**。实测会议卡就是这种状态：
 *      v3.7.43 补了「开始时间 / 参会人」两个输入框，但白名单没同步 → 录完保存即丢、表格该列恒空。
 *      这类缺陷不会报错、不会崩，只是数据悄悄不见，故固化成断言。
 *   ③ 窄屏（≤767）三处：任务表单「标签」被 ＋ 的预留内边距挤窄 46px；看板卡按钮文字不居中
 *      （inline-flex 后 text-align 失效）；streak 徽章被压到 64px、内容折三行。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/* ---------- ① 静态：每张功能卡的输入框都在采集白名单里 ---------- */
describe("功能卡：表单字段必须都进采集白名单", () => {
  it("fields ⊆ fieldKeys（否则录入的值保存即丢）", () => {
    const main = read("src/render-scene-main.js");
    const core = read("src/core.js");
    const bind = {};
    for (const m of core.matchAll(/(\w+):\s*\{\s*key:\s*"([a-z_]+)",\s*fieldKeys:\s*\[([^\]]*)\]/g)) {
      bind[m[1]] = m[3].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    }
    const starts = [...main.matchAll(/^  (\w+): function\(\)\{/gm)].map((m) => ({ name: m[1], at: m.index }));
    const offenders = [];
    starts.forEach((c, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].at : main.length;
      const block = main.slice(c.at, end);
      const keys = [...new Set([...block.matchAll(/\{k:"([A-Za-z_]+)"/g)].map((m) => m[1]))];
      const wl = bind[c.name];
      if (!wl) return; // 该卡没有采集绑定（纯展示/其它路径），跳过
      const missing = keys.filter((k) => !wl.includes(k));
      if (missing.length) offenders.push(`${c.name}: ${missing.join(",")}`);
    });
    expect(offenders, "以下字段有输入框但不在 fieldKeys 里，录入后保存即丢：" + offenders.join(" | ")).toEqual([]);
  });

  it("会议卡的白名单含 startTime / who（v3.7.43 只补了输入框那一半）", () => {
    const core = read("src/core.js");
    const m = core.match(/meeting:\s*\{\s*key:"meetings",\s*fieldKeys:\[([^\]]*)\]/);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/startTime/);
    expect(m[1]).toMatch(/who/);
  });
});

/* ---------- ② 行为：报销卡「时间」字段端到端 ---------- */
describe("报销卡：时间字段", () => {
  it("表单有时间字段，且预选当前时间（default:now）", async () => {
    const win = loadApp();
    await new Promise((r) => setTimeout(r, 60));
    win.__test.setActive("office");
    /* setSceneFeature 是顶层函数（子标签点击最终调它），等价于用户点「报销」标签 */
    win.setSceneFeature("expense");
    win.__test.render();
    const card = [...win.document.querySelectorAll(".card")].find((c) => /报销管理/.test(c.textContent || ""));
    expect(card, "未渲染出报销管理卡").toBeTruthy();
    const sel = card.querySelector('[data-f-field="time"]');
    expect(sel, "报销卡缺少时间字段").toBeTruthy();
    /* 预选值 = 当前时间向下取整到 5 分钟档；允许跨分钟边界，比对是否落在两个候选值中 */
    const d = new Date();
    const cand = [0, 5].map((back) => {
      const t = new Date(d.getTime() - back * 60000);
      return String(t.getHours()).padStart(2, "0") + ":" + String(Math.floor(t.getMinutes() / 5) * 5).padStart(2, "0");
    });
    expect(cand).toContain(sel.value);
  });

  it("保存后 time 落盘（此前会被白名单丢弃）", async () => {
    const win = loadApp();
    await new Promise((r) => setTimeout(r, 60));
    win.__test.setActive("office");
    /* setSceneFeature 是顶层函数（子标签点击最终调它），等价于用户点「报销」标签 */
    win.setSceneFeature("expense");
    win.__test.render();
    const card = [...win.document.querySelectorAll(".card")].find((c) => /报销管理/.test(c.textContent || ""));
    const set = (k, v) => { const el = card.querySelector('[data-f-field="' + k + '"]'); if (el) { el.value = v; el.dispatchEvent(new win.Event("input", { bubbles: true })); } };
    set("title", "打车费");
    set("amount", "38.5");
    set("time", "09:35");
    card.querySelector("[data-f-add]").click();
    const recs = JSON.parse(win.localStorage.getItem("wb_agent_expenses") || "[]");
    expect(recs.length).toBe(1);
    expect(recs[0].time).toBe("09:35");
    expect(recs[0].title).toBe("打车费");
  });

  it("有记录时列表出现「时间」列", async () => {
    const win = loadApp();
    await new Promise((r) => setTimeout(r, 60));
    win.__test.setActive("office");
    /* setSceneFeature 是顶层函数（子标签点击最终调它），等价于用户点「报销」标签 */
    win.setSceneFeature("expense");
    win.__test.render();
    let card = [...win.document.querySelectorAll(".card")].find((c) => /报销管理/.test(c.textContent || ""));
    /* 空态下不渲染表格（只显示 emptyTip）→ 先录一条 */
    const set = (k, v) => { const el = card.querySelector('[data-f-field="' + k + '"]'); if (el) { el.value = v; el.dispatchEvent(new win.Event("input", { bubbles: true })); } };
    set("title", "列检查");
    set("amount", "1");
    card.querySelector("[data-f-add]").click();
    card = [...win.document.querySelectorAll(".card")].find((c) => /报销管理/.test(c.textContent || ""));
    const heads = [...card.querySelectorAll(".tool-table th")].map((t) => t.textContent.trim());
    expect(heads).toContain("时间");
    const firstRow = [...card.querySelectorAll(".tool-table tbody tr")][0];
    expect(firstRow.textContent).toContain(":");  /* 时间列有值（HH:MM） */
  });
});

/* ---------- ③ 静态：窄屏三处修复不得回退 ---------- */
describe("窄屏修复的静态护栏", () => {
  const html = read("agent-workbench.html");
  it("任务表单：≤1023 撤掉「标签」为 ＋ 预留的 padding-right", () => {
    expect(html).toContain("#taskForm>.fld:nth-child(4){padding-right:0}");
  });
  it("看板卡按钮：手机端 inline-flex 后补 justify-content:center", () => {
    const m = html.match(/\.kbtns button\{min-height:44px;display:inline-flex;align-items:center;([^}]*)\}/);
    expect(m, "未找到手机端 .kbtns button 规则").toBeTruthy();
    expect(m[1]).toContain("justify-content:center");
  });
  it("看板卡按钮：底色与卡片底拉开色差（color-mix 兜底 --panel2）", () => {
    expect(html).toMatch(/\.kbtns button\{[^}]*background:var\(--panel2\);\s*background:color-mix\(in srgb, var\(--line\) 42%, var\(--panel\)\)/);
  });
  it("streak 徽章：容器允许换行 + 徽章不参与压缩（各档都不再挤压内容）", () => {
    expect(html).toMatch(/\.hc-streak-inner\{display:inline-flex;flex-wrap:wrap/);
    expect(html).toMatch(/\.streak-badge\{flex:0 0 auto;white-space:nowrap\}/);
  });
});
