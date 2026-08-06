import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");

describe("P0-9 lineChartSVG var() 回归", () => {
  let svg = "";
  let win;

  beforeAll(() => {
    expect(fs.existsSync(HTML), "agent-workbench.html 应存在").toBe(true);
    win = loadApp();
    // 调用点 html:836 传入 "var(--accent)"，html:912 传入 SCENARIOS.health.color（十六进制）
    // SVG 的 presentation attribute（fill="..." stroke="..."）无法解析 CSS var()，
    // 必须以 inline style 形式输出，否则趋势图无色。
    svg = win.lineChartSVG([1, 2, 3], "var(--accent)");
  });

  it("polygon 用 style 注入 fill（可解析 var()）", () => {
    expect(svg).toContain('style="fill:var(--accent)"');
  });

  it("polyline 用 style 注入 stroke（可解析 var()）", () => {
    expect(svg).toContain('style="stroke:var(--accent)"');
  });

  it("circle 用 style 注入 fill（可解析 var()）", () => {
    expect(svg).toContain('style="fill:var(--accent)"');
  });

  it("不存在 attribute 形式的 fill/stroke=var()（否则 SVG 不渲染颜色）", () => {
    expect(svg).not.toContain('fill="var(--accent)"');
    expect(svg).not.toContain('stroke="var(--accent)"');
  });

  it("普通十六进制色值仍正常输出（不破坏既有渲染）", () => {
    const hex = win.lineChartSVG([4, 2, 5], "#0067c0");
    expect(hex).toContain('style="fill:#0067c0"');
    expect(hex).toContain('style="stroke:#0067c0"');
  });
});
