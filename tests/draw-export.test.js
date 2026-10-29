/**
 * draw-export.test.js —— 画图能力 Phase A 批次①+②（2026-10-30 · docs/draw-capability-phase-a.md）
 * ----------------------------------------------------------------------------
 * 守四件事（方案第九节批次①+②的守护 ①-⑥，⑤⑥按 jsdom 可测性调整为委托与容器契约）：
 *  ① renderMiniChart 输出带 data-svgexport 容器 + 导出条，不破坏 .mini-chart-wrap 结构；
 *  ② line 变体导出条在盒外（固定高度裁切不到）；空数据无按钮；
 *  ③ SVG 导出 = image/svg+xml Blob + <a download> 文件名 chart-* YYYYMMDD-HHmm.svg；
 *  ④ PNG 在 jsdom（无 canvas/createObjectURL）如实降级：下载 SVG + warn 提示，按钮复位；
 *  ⑤ _mermaidFigureEl 容器契约（mermaid 成功路径抽出物：data-svgexport + svg + 导出条）；
 *  ⑥ 导出委托幂等（window.__svgExportBound）且点击 SVG 按钮走下载（文档级委托，innerHTML 重建不冲掉）。
 * 运行：npm test -- draw-export
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
let _boxSeq = 0;
afterEach(() => {
  if (win) win.close();
  win = undefined;
  vi.restoreAllMocks();
});

function boot(extra) {
  return loadApp({ storage: Object.assign({ wb_agent_onboarded: "true" }, extra || {}) });
}

/** 在当前 win 的 body 里挂一个标准可导出容器（模拟 chart/mermaid/draw 三处的最终形态）。 */
/** 在当前 win 的 body 末尾**追加**一个标准可导出容器（模拟 chart/mermaid/draw 三处的最终形态）。
 *  ⚠️ 不能整体替换 body.innerHTML —— 应用有常驻渲染循环，替换会把 #chatPanel 等目标炸掉，
 *  下一帧渲染就报「渲染异常」（实测）。追加则与应用共存。 */
function mountExportBox(w, name) {
  const id = "svgexp-box-" + (++_boxSeq);
  w.document.body.insertAdjacentHTML(
    "beforeend",
    '<div id="' + id + '" data-svgexport data-svgname="' + name + '">'
    + '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="var(--accent)"/></svg>'
    + w._svgExportBar(name)
    + "</div>"
  );
  /* 返回容器本体；测试按需点 [data-svgexp="svg"|"png"] —— 容器的第一个按钮是 SVG，别拿错 */
  return w.document.getElementById(id);
}

describe("A1：图表卡导出入口（renderMiniChart）", () => {
  it("① bar 卡：data-svgexport 容器 + 导出条 + 保留 .mini-chart-wrap 结构", () => {
    win = boot();
    const html = win.renderMiniChart("bar", [{ label: "Q1", value: 30 }]);
    expect(html).toContain("data-svgexport");
    expect(html).toContain('data-svgname="chart-bar"');
    expect(html).toContain("mini-chart-wrap");
    expect(html).toContain("svg-exp-btn");
    expect(html).toContain("<svg");
    /* 导出条在容器内、svg 外（序列化 svg 时不会被裹进去） */
    const box = win.document.createElement("div");
    box.innerHTML = html;
    expect(box.querySelector("svg")).toBeTruthy();
    expect(box.querySelector("svg .svg-exp-btn")).toBeNull();
  });

  it("② line 变体导出条在盒外；空数据无导出按钮", () => {
    win = boot();
    const line = win.renderMiniChart("line", [{ label: "一", value: 1 }]);
    expect(line).toContain("mini-chart-line-box");
    expect(line).toContain("data-svgexport");
    /* 盒先闭、条在后 —— 固定高度 overflow-hidden 裁不到按钮 */
    expect(line.indexOf("</div>") < line.indexOf("svg-exp-btn")).toBe(true);
    const empty = win.renderMiniChart("bar", []);
    expect(empty).toContain("mini-chart-empty");
    expect(empty).not.toContain("svg-exp-btn");
  });
});

describe("导出动作（文档级委托）", () => {
  it("③ SVG 导出：image/svg+xml Blob + <a download> 文件名 chart-* YYYYMMDD-HHmm.svg + ok 回执", async () => {
    win = boot();
    win.toast = vi.fn();
    const created = [];
    /* jsdom 的 URL 没有 createObjectURL —— 直接赋值 mock（spyOn 要求属性已存在） */
    win.URL.createObjectURL = function (blob) { created.push(blob); return "blob:mock-" + created.length; };
    win.URL.revokeObjectURL = function () {};
    const clickSpy = vi.spyOn(win.HTMLAnchorElement.prototype, "click").mockImplementation(function () {});
    const box = mountExportBox(win, "chart-bar");
    box.querySelector('[data-svgexp="svg"]').click();
    expect(created.length).toBe(1);
    expect(created[0] && created[0].type).toBe("image/svg+xml;charset=utf-8");
    expect(created[0] && created[0].size).toBeGreaterThan(0);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const a = clickSpy.mock.instances[0];
    expect(a.download).toMatch(/^chart-bar-\d{8}-\d{4}\.svg$/);
    expect(win.toast).toHaveBeenCalledWith(expect.stringContaining("导出"), "ok");
  });

  it("④ PNG 失败（toBlob→null）如实降级：下载 SVG + warn 提示 + 按钮复位（不假称 PNG 成功）", async () => {
    win = boot();
    win.toast = vi.fn();
    win.URL.createObjectURL = function () { return "blob:mock"; };
    win.URL.revokeObjectURL = function () {};
    win.Image = class { set src(v) { const self = this; setTimeout(function () { if (self.onload) self.onload(); }, 0); } };
    /* 环境的 canvas 可能真能出 PNG；要测的是文档承诺的降级分支 —— 强制 toBlob 回 null */
    vi.spyOn(win.HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) { cb(null); });
    const box = mountExportBox(win, "t");
    const btn = box.querySelector('[data-svgexp="png"]');
    btn.click();
    await vi.waitFor(() => expect(btn.disabled).toBe(false));
    expect(win.toast).toHaveBeenCalledWith(expect.stringContaining("SVG"), "warn");
  });

  it("④b PNG 成功路径不在 jsdom 断言（留真浏览器验收）——但失败降级已由 ④ 钉住", () => {
    /* 说明：jsdom 的 canvas drawImage 严格校验来源类型，假 Image 会抛错走 fail()，
       故「toBlob 出真 Blob → 下载 .png + ok 回执」无法在 jsdom 诚实地测；
       真浏览器验收（Playwright 截图脚本）时以真实 toBlob 链路一并核验。 */
    win = boot();
    expect(win.__svgExportBound).toBe(true);
  });

  it("⑥ 委托幂等：boot 即绑定一次；点击 SVG 按钮走下载路径", () => {
    win = boot();
    win.toast = vi.fn();
    expect(win.__svgExportBound).toBe(true);
    const created = [];
    win.URL.createObjectURL = function (blob) { created.push(blob); return "blob:mock"; };
    win.URL.revokeObjectURL = function () {};
    vi.spyOn(win.HTMLAnchorElement.prototype, "click").mockImplementation(function () {});
    /* 无 data-svgexport 容器的散按钮 → 点击无动作（不抛） */
    win.document.body.innerHTML = '<button type="button" data-svgexp="svg">x</button>';
    win.document.querySelector("[data-svgexp]").click();
    expect(created.length).toBe(0);
    /* 有容器的 → 正常下载 */
    const box = mountExportBox(win, "m");
    box.querySelector('[data-svgexp="svg"]').click();
    expect(created.length).toBe(1);
  });
});

describe("A2：mermaid 容器契约（_mermaidFigureEl，成功路径抽出物）", () => {
  it("⑤ 容器带 data-svgexport + svg + 导出条；按钮在 svg 外", () => {
    win = boot();
    const fig = win._mermaidFigureEl('<svg viewBox="0 0 5 5"><path d="M0 0L5 5"/></svg>');
    expect(fig.className).toBe("mermaid-figure");
    expect(fig.hasAttribute("data-svgexport")).toBe(true);
    expect(fig.getAttribute("data-svgname")).toBe("mermaid");
    expect(fig.querySelector("svg")).toBeTruthy();
    expect(fig.querySelector("svg .svg-exp-btn")).toBeNull();
    expect(fig.textContent).toContain("SVG");
    expect(fig.textContent).toContain("PNG");
  });
});
