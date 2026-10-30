/**
 * draw-svg.test.js —— sanitizeSvg 安全子集（批次③，先于 draw_svg 工具落地）
 * ----------------------------------------------------------------------------
 * draw_svg 让 AI 直接产出 SVG 源码 —— 那是**不可信输入**（LLM 可被提示注入，也可能被
 * 恶意用户经由对话间接投喂）。本文件把 docs/draw-capability-phase-a.md 第六节的安全
 * 白名单逐条钉住：白名单重建（非黑名单剥除）、拒绝而非静默修正、style 元素整体剥除。
 * 设计决定：安全批独立于工具批提交 —— 先有围栏再养动物，围栏可单独审查。
 * 运行：npm test -- draw-svg
 */
import { describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function boot() {
  return loadApp({ storage: { wb_agent_onboarded: "true" } });
}

function svg(inner) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' + inner + "</svg>";
}

describe("sanitizeSvg：恶意样本逐个钉（白名单重建）", () => {
  const cases = [
    ["① script 元素连子树删", svg('<script>alert(1)</script><rect width="5" height="5"/>'),
      (out) => !out.includes("script") && !out.includes("alert") && out.includes("rect")],
    ["② foreignObject 连子树删（含嵌套 iframe）", svg('<foreignObject><iframe src="https://evil"></iframe></foreignObject><circle r="3"/>'),
      (out) => !out.includes("foreignObject") && !out.includes("iframe") && !out.includes("evil") && out.includes("circle")],
    ["③ on* 事件属性剥除", svg('<rect width="5" height="5" onload="alert(1)" onclick="x()"/>'),
      (out) => !/onload|onclick/i.test(out) && out.includes("rect")],
    ["④ <a> 不在白名单 → 连子树删（href=javascript: 自然同归尘土）", svg('<a href="javascript:alert(1)"><path d="M0 0"/></a>'),
      (out) => !/javascript/i.test(out) && !out.includes("<a") && !out.includes("path")],
    ["⑤ href=外链剥除（仅内部 # 锚点保留）", '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil/x"/><use href="#ok"/><path d="M0 0"/></svg>',
      (out) => !out.includes("https://evil") && out.includes('href="#ok"')],
    ["⑥ xlink:href=data: 剥除（image 不在白名单，整元素删）", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="data:image/svg+xml;base64,PHNjcmlwdD4=" width="5" height="5"/></svg>',
      (out) => !out.includes("data:") && !out.includes("image")],
    ["⑦ SMIL 动画元素整体删（animate 可运行期改属性为 javascript:）", svg('<animate attributeName="href" values="javascript:alert(1)"/><rect width="5" height="5"/>'),
      (out) => !out.includes("animate") && !out.includes("javascript") && out.includes("rect")],
    ["⑧ style 属性带 url(...) 剥属性留元素", svg('<rect width="5" height="5" style="fill:url(https://evil);fill-opacity:0.5"/>'),
      (out) => !out.includes("https://evil") && out.includes("rect")],
    ["⑨ 未知标签连子树删（iframe 的变体 embed/object）", svg('<embed src="x"/><object data="y"></object><ellipse rx="3"/>'),
      (out) => !out.includes("embed") && !out.includes("object") && out.includes("ellipse")],
    ["⑩ 无根 <svg> → 拒绝（返回空，不输出半成品）", '<div>not svg</div>',
      (out) => out === ""],
  ];
  it.each(cases)("%s", (_label, input, assertFn) => {
    const win = boot();
    const out = win.sanitizeSvg(input);
    expect(assertFn(out)).toBe(true);
    win.close();
  });
});

describe("sanitizeSvg：良性样本无损 + 口径", () => {
  it("良性草图无损：渐变/文字/路径/clipPath 全保留", () => {
    const win = boot();
    const good = svg(
      "<defs><linearGradient id='g1'><stop offset='0' stop-color='#fff'/><stop offset='1' stop-color='#000'/></linearGradient>"
      + "<clipPath id='c1'><rect width='9' height='9'/></clipPath></defs>"
      + "<path d='M1 1L9 9' stroke='#333' fill='none'/><text x='1' y='9' font-size='4'>标题</text>"
      + "<rect width='9' height='9' fill='url(#g1)' clip-path='url(#c1)'/>"
    );
    const out = win.sanitizeSvg(good);
    expect(out).toContain("linearGradient");
    expect(out).toContain("stop-color");
    expect(out).toContain("clipPath");
    expect(out).toContain("标题");
    expect(out).toContain("url(#g1)");
    win.close();
  });

  it("<style> 元素整体剥除（聊天渲染还会过 sanitizeHtml，两条路径口径一致：用表现属性）", () => {
    const win = boot();
    const out = win.sanitizeSvg(svg("<style>rect{fill:red}</style><rect width='5' height='5' fill='blue'/>"));
    expect(out).not.toContain("<style");
    expect(out).not.toContain("fill:red");
    expect(out).toContain('fill="blue"');
    win.close();
  });

  it("垃圾输入（空串 / 非标签 / 二进制）→ 空串，不抛", () => {
    const win = boot();
    expect(win.sanitizeSvg("")).toBe("");
    expect(win.sanitizeSvg("just text")).toBe("");
    expect(win.sanitizeSvg("\x00\x01\x02")).toBe("");
    win.close();
  });

  it("序列化结果带 xmlns 命名空间（独立 .svg 文件可打开）", () => {
    const win = boot();
    const out = win.sanitizeSvg(svg("<rect width='5' height='5'/>"));
    expect(out).toContain("xmlns");
    win.close();
  });
});
