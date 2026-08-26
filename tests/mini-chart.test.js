import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");

/**
 * v3.0.1 B-5：数据可视化真图表测试。
 * 覆盖 parseChartData（JSON 解析 + 校验 + 容错）与 renderMiniChart
 * （bar / pie / line 三种 SVG 结构、非法输入占位、用户 label 的 XSS 转义）。
 */
describe("B-5 parseChartData（数据点解析容错）", () => {
  let win;

  beforeAll(() => {
    expect(fs.existsSync(HTML), "agent-workbench.html 应存在").toBe(true);
    win = loadApp();
  });

  it("已加入 window.__test 导出", () => {
    expect(typeof win.__test.parseChartData).toBe("function");
    expect(typeof win.__test.renderMiniChart).toBe("function");
  });

  it("合法 JSON 数组 → [{label,value}]", () => {
    const arr = win.parseChartData('[{"label":"周一","value":10},{"label":"周二","value":25}]');
    expect(arr).toEqual([
      { label: "周一", value: 10 },
      { label: "周二", value: 25 },
    ]);
  });

  it("非法 JSON 字符串 → null", () => {
    expect(win.parseChartData("not json")).toBeNull();
    expect(win.parseChartData('[{"label":broken}]')).toBeNull();
  });

  it("非数组 JSON（对象/标量）→ null", () => {
    expect(win.parseChartData('{"a":1}')).toBeNull();
    expect(win.parseChartData("42")).toBeNull();
    expect(win.parseChartData('"str"')).toBeNull();
  });

  it("null/undefined/空串 → null", () => {
    expect(win.parseChartData(null)).toBeNull();
    expect(win.parseChartData(undefined)).toBeNull();
    expect(win.parseChartData("")).toBeNull();
  });

  it("空数组或全部条目非法 → null", () => {
    expect(win.parseChartData("[]")).toBeNull();
    // 缺 label、缺 value、value 非数值的条目全部剔除
    expect(win.parseChartData('[{"value":3},{"label":"a"},{"label":"b","value":"abc"}]')).toBeNull();
  });

  it("部分非法条目被剔除，其余保留；数字字符串容错转换；负值剔除", () => {
    const arr = win.parseChartData(
      '[{"label":"ok","value":"30"},{"label":123,"value":4},{"label":"","value":9},{"label":"neg","value":-2},{"label":"nan","value":null}]'
    );
    expect(arr).toEqual([{ label: "ok", value: 30 }, { label: "123", value: 4 }]);
  });
});

describe("B-5 renderMiniChart（SVG 结构与占位）", () => {
  const DATA = [
    { label: "Q1", value: 30 },
    { label: "Q2", value: 52 },
    { label: "Q3", value: 18 },
  ];
  let win;

  beforeAll(() => {
    win = loadApp();
  });

  it("bar：横向条形图——svg + rect 条形 + accent 令牌 + 数值文本", () => {
    const svg = win.renderMiniChart("bar", DATA);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain("var(--accent)");
    expect(svg).toContain("viewBox");
    // 数值右侧展示
    expect(svg).toContain(">30</text>");
    expect(svg).toContain(">52</text>");
  });

  it("bar：用户 label 含 HTML 时被 esc() 转义（XSS 防护）", () => {
    const svg = win.renderMiniChart("bar", [{ label: '<script>alert(1)</script>', value: 5 }]);
    expect(svg).not.toContain("<script");
    // bar 图对超长 label 截取前 7 字符再加省略号后转义：<script → &lt;script…
    expect(svg).toContain("&lt;script");
  });

  it("pie：多数据 → path 扇形 + 多色令牌轮换 + 图例", () => {
    const svg = win.renderMiniChart("pie", DATA);
    expect(svg).toContain("<path");
    expect(svg).toContain('d="M');
    expect(svg).toContain("var(--accent)");
    expect(svg).toContain("var(--ok)");
    // 图例含百分比
    expect(svg).toContain("%");
  });

  it("pie：单项占满 → 整圆 circle 而非退化弧线", () => {
    const svg = win.renderMiniChart("pie", [{ label: "only", value: 7 }]);
    expect(svg).toContain("<circle");
  });

  it("line：复用 lineChartSVG——polyline/polygon 且 stroke 为 style 形式的 var(--accent)", () => {
    const svg = win.renderMiniChart("line", DATA);
    expect(svg).toContain("<polyline");
    expect(svg).toContain("<polygon");
    expect(svg).toContain('style="stroke:var(--accent)"');
    // 维度标签随图展示
    expect(svg).toContain("Q1");
  });

  it("空数据 / null / 非法输入 → 友好占位文案（不出 SVG）", () => {
    for (const bad of [[], null, undefined]) {
      const out = win.renderMiniChart("bar", bad);
      expect(out).toContain("mini-chart-empty");
      expect(out).toContain("暂无可视化数据");
      expect(out).not.toContain("<svg");
    }
  });

  it("未知 chartType 回退为 bar 渲染", () => {
    const svg = win.renderMiniChart("radar", DATA);
    expect(svg).toContain("<rect");
    expect(svg).toContain("var(--accent)");
  });
});