/**
 * draw-marker-render.test.js —— 画图 Phase A 落地后的四处实测缺口（2026-10-31，基于 main `1cb65cf`）
 * ----------------------------------------------------------------------------
 * 这批用例**全部先在 main 上跑出红**，再改代码 —— 每条都带"修前是什么形态"的实测值，
 * 不是凭空立的判据。四类问题：
 *
 *  A. 标记类卡片在真实聊天里**一张都不渲染**（① ② ③ ④ 四批的共同前提）：
 *     渲染层按 `_disp.indexOf("__CHART__") === 0` 判标记，而聊天路径写进 hist 的
 *     `_disp` 是「工具 X({…}) → <结果>」—— 前缀在，判据永远不成立。
 *     `content` 也不能当解析源：它被 `_cutToolRes` 截到 2400 字，SVG 会拦腰断。
 *     ⇒ 修法：消息上另存原始回执 `_raw`（只给标记类结果存），渲染层按 `_raw` 判。
 *
 *  B. `sanitizeSvg` 把"整张都被剥光"当成功返回：`<svg><script>…</script></svg>`
 *     实测返回 `<svg xmlns=…/>`（真值）⇒ execTool 走出成功分支，用户看到一张**空卡**，
 *     模型以为画完了。方案第六节写的是"剥完什么都不剩 ⇒ 整体拒绝"。
 *
 *  C. 围栏漏两类**外呼**：
 *     · 画笔类属性里的 `url()` 只查了 `style`，没查 `fill`/`stroke`/`filter` 这些
 *       白名单属性本身 —— 实测 `fill="url(https://evil.example/x.svg#p)"` 原样留下。
 *     · `xml:base` 因「带冒号的属性一律放行」而留下 —— 实测原样输出，
 *       而它会把 `<use href="#a">` 这类文档内引用**改基到外部站点**。
 *
 *  D. 导出条**没有样式**：① ② ③ ④ 四批都只写了 markup，全仓 `.svg-export-bar`
 *     规则数实测 0 —— 按钮是浏览器默认样式，卡片也没有容器底色。
 *
 * 运行：npm run test:local -- tests/draw-marker-render.test.js
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NS = "http://www.w3.org/2000/svg";

let win;
afterEach(() => {
  if (win) win.close();
  win = undefined;
});
const boot = () => loadApp({ storage: { wb_agent_onboarded: "true" } });

const GOOD = '<svg xmlns="' + NS + '" viewBox="0 0 120 60"><rect x="4" y="4" width="50" height="24" fill="#0af"/><text x="8" y="20">开始</text></svg>';

/** 按 **聊天真实形态** 造一条工具消息：_disp 带「工具 … → 」前缀，_raw 是原始回执 */
function pushRealToolMsg(w, name, raw) {
  w.__test.appendChat("office", {
    role: "tool",
    tool_call_id: "call-" + name,
    content: raw,
    _disp: "工具 " + name + '({"a":1}) → ' + raw,
    _raw: w._markerRaw(raw),
  });
  w.renderChat();
}

describe("A 标记类卡片必须在真实回执形态下渲染出来", () => {
  it("A1 图表卡：真实 _disp（带前缀）现在能出 .chart-msg，且界面里没有 __CHART__ 原文", () => {
    win = boot();
    const raw = win.execTool("render_chart", { type: "bar", title: "本周", data: [{ label: "一", value: 3 }] });
    expect(raw.indexOf("__CHART__")).toBe(0);
    pushRealToolMsg(win, "render_chart", raw);
    const card = win.document.querySelector(".msg.tool.chart-msg");
    expect(card, "修前实测恒为 null：整条 A1 的聊天入口就是这张卡").toBeTruthy();
    expect(card.querySelector("svg")).toBeTruthy();
    expect(card.textContent).not.toContain("__CHART__");
  });

  it("A2 草图卡：真实 _disp 能出 .svg-msg，带标题与 SVG/PNG 两个导出按钮", () => {
    win = boot();
    const raw = win.execTool("draw_svg", { svg: GOOD, title: "流程框图" });
    expect(raw.indexOf("__SVG__")).toBe(0);
    pushRealToolMsg(win, "draw_svg", raw);
    const card = win.document.querySelector(".msg.tool .svg-msg") || win.document.querySelector(".svg-msg");
    expect(card, "修前实测恒为 null").toBeTruthy();
    expect(card.querySelector("svg")).toBeTruthy();
    expect(card.querySelectorAll("[data-svgexp]").length).toBe(2);
    expect(card.textContent).not.toContain("__SVG__");
  });

  it("A3 老历史（改动前落盘、没有 _raw）不炸，退回可读文本", () => {
    win = boot();
    win.__test.appendChat("office", { role: "tool", content: '__SVG__{"title":"旧","svg":"<svg/>"}', _disp: "工具 draw_svg({}) → __SVG__{…}" });
    win.renderChat();
    expect(win.document.querySelector(".msg.tool").textContent).toContain("工具 draw_svg");
  });

  it("A4 `_markerRaw` 只给标记类回执多存一份，普通结果不翻倍占存储", () => {
    win = boot();
    expect(win._markerRaw("__SVG__{}")).toBe("__SVG__{}");
    expect(win._markerRaw("__CHART__{}")).toBe("__CHART__{}");
    expect(win._markerRaw('{"ok":true,"msg":"已保存"}')).toBeUndefined();
    expect(win._markerRaw("普通文本回执")).toBeUndefined();
    expect(win._markerRaw(null)).toBeUndefined();
  });

  it("A5 同一处判据的第 3 个受害者：spawn 结果现在能出子代理卡片（修前同样恒不成立）", () => {
    win = boot();
    const raw = '{"agentId":"ag-1","agent":"资料整理员","ok":true}';
    pushRealToolMsg(win, "spawn_agent", raw);
    const card = win.document.querySelector(".msg.tool.subagent-card");
    expect(card, "子代理卡与两张画图卡是同一个前缀 bug 的第三个受害者").toBeTruthy();
    expect(card.textContent).toContain("资料整理员");
    /* 普通 JSON 回执不能被误当子代理结果 */
    win.__test.appendChat("office", { role: "tool", content: '{"ok":true,"msg":"已保存"}', _disp: '工具 generate_doc({}) → {"ok":true,"msg":"已保存"}', _raw: '{"ok":true,"msg":"已保存"}' });
    win.renderChat();
    expect(win.document.querySelectorAll(".subagent-card").length).toBe(1);
  });

  it("A7 标记负载坏掉时：走文本回退**且留痕**（不留痕的话「卡片没出来」永远无从归因）", () => {
    win = boot();
    const seen = [];
    win.pushDiag = function (level, msg, ctx) { seen.push({ level, msg: String(msg), where: (ctx && ctx.where) || "" }); };
    [["__CHART__{坏掉的", "chart msg render failed"], ["__SVG__{坏掉的", "svg msg render failed"]].forEach(([raw, needle]) => {
      win.__test.appendChat("office", { role: "tool", content: raw, _disp: "工具 t({}) → " + raw, _raw: raw });
      win.renderChat();
      expect(win.document.querySelector(".chart-msg, .svg-msg"), raw + " 不该出卡").toBeNull();
      expect(seen.some((s) => s.msg.includes(needle) && s.where === "chatRender"),
        raw + " 解析失败没留痕（catch 里写成裸注释 = 静默吞）").toBe(true);
    });
  });

  it("A6 普通文本回执仍按文本显示（换解析源不许顺手带坏别的分支）", () => {
    win = boot();
    win.__test.appendChat("office", { role: "tool", content: "已复制 3 条", _disp: "工具 copy({}) → 已复制 3 条" });
    win.renderChat();
    const texts = [...win.document.querySelectorAll(".msg.tool")].map((d) => d.textContent);
    expect(texts.some((x) => x.includes("已复制 3 条"))).toBe(true);
  });
});

describe("B 剥光之后不许装成功", () => {
  it("B1 整张只有 <script> ⇒ 返回空串（execTool 因此走拒绝分支，不给空卡）", () => {
    win = boot();
    expect(win.sanitizeSvg('<svg xmlns="' + NS + '"><script>alert(1)</script></svg>')).toBe("");
    const j = JSON.parse(win.execTool("draw_svg", { svg: '<svg xmlns="' + NS + '"><script>alert(1)</script></svg>' }));
    expect(j.ok, "剥光还返回成功 = 用户看到空卡、模型以为画完了").toBe(false);
  });

  it("B2 剥光后只剩换行文本节点，同样算空（按 childNodes 判会被骗过去）", () => {
    win = boot();
    expect(win.sanitizeSvg('<svg xmlns="' + NS + '">\n  <script>alert(1)</script>\n</svg>')).toBe("");
  });

  it("B3 正常图仍然通过（拒绝判据不许顺手把好的也拦掉）", () => {
    win = boot();
    const out = win.sanitizeSvg(GOOD);
    expect(out).toContain("<rect");
    expect(out).toContain("开始");
  });
});

describe("C 围栏的两类外呼", () => {
  it("C1 画笔属性里的 url() 只认文档内 #（fill=\"url(http://…)\" 必须剥掉）", () => {
    win = boot();
    const out = win.sanitizeSvg('<svg xmlns="' + NS + '"><rect width="4" height="4" fill="url(https://evil.example/x.svg#p)"/></svg>');
    expect(out, "修前实测原样保留 —— 浏览器会去外部取 paints server").not.toContain("evil.example");
    const ok = win.sanitizeSvg('<svg xmlns="' + NS + '"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect width="4" height="4" fill="url(#g)"/></svg>');
    expect(ok).toContain('fill="url(#g)"');
  });

  it("C2 `xml:base` 必须剥掉（它把文档内引用改基到外部站点）", () => {
    win = boot();
    const out = win.sanitizeSvg('<svg xmlns="' + NS + '" xml:base="http://evil.example/"><use href="#a"/><defs><path id="a" d="M0 0"/></defs></svg>');
    expect(out, "修前实测原样保留").not.toContain("evil.example");
  });

  it("C3 带冒号的属性不再整体豁免白名单，但 xmlns 声明与 xlink:href 照常可用", () => {
    win = boot();
    const out = win.sanitizeSvg('<svg xmlns="' + NS + '" xmlns:xlink="' + "http://www.w3.org/1999/xlink" + '">'
      + '<defs><path id="a" d="M0 0"/></defs><use xlink:href="#a" x="1"/></svg>');
    expect(out).toContain("#a");
    /* 修前实测：只要属性名里带冒号就绕过白名单 ⇒ 自造前缀的 foo:evil 原样留下 */
    const bad = win.sanitizeSvg('<svg xmlns="' + NS + '" xmlns:foo="http://evil.example/f"><rect width="4" height="4" foo:evil="1"/></svg>');
    expect(bad, "带冒号=绕过白名单的那道豁免").not.toContain("foo:evil");
    expect(bad).not.toContain("evil.example");
  });
});

describe("D 导出条与草图卡得有样式（四批都只写了 markup）", () => {
  it("D1 HTML 里存在 .svg-export-bar / .svg-exp-btn / .svg-msg 规则，且全走设计令牌", () => {
    const html = readFileSync(join(ROOT, "agent-workbench.html"), "utf8");
    [".svg-export-bar{", ".svg-exp-btn{", ".svg-exp-btn:hover{", ".svg-msg{", ".chart-msg-title{"]
      .forEach((sel) => expect(html, "缺 CSS 规则 " + sel + "（修前全仓 0 条）").toContain(sel));
    const blk = /\.svg-export-bar\{[\s\S]*?\.chart-msg-title\{[^}]*\}/.exec(html);
    expect(blk, "这几条规则应连成一段").toBeTruthy();
    expect(blk[0]).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(blk[0]).not.toContain("--fs-3xs");
  });

  it("D2 草图里的 SVG 受容器宽度约束（不撑破聊天气泡）", () => {
    const html = readFileSync(join(ROOT, "agent-workbench.html"), "utf8");
    expect(html).toMatch(/\.svg-msg svg\{[^}]*max-width:100%/);
  });
});
