/**
 * draw-svg-tool.test.js —— draw_svg 工具（画图能力 Phase A 批次④）
 * ----------------------------------------------------------------------------
 * 钉三件事（方案第九节批次④的守护）：
 *  ① 良性 SVG → 返回 __SVG__ 标记 + 消毒后的内容，产物落账（kind:"svg"）——AI 行动统计覆盖；
 *  ② 恶意/畸形 SVG → {ok:false, msg} 拒绝（无半成品入库），msg 指向「未通过安全检查」；
 *  ③ chat 渲染：历史里的 __SVG__ 工具消息渲染为 .svg-msg 卡片（消毒 + 导出条）——
 *     渲染层二次消毒的防纵深同样钉住（历史消息进了脏数据也带不出 XSS）。
 * 工具契约见 docs/ai-tools.md（第 29 个工具；ai-tools-doc 门禁同步 28→29）。
 * 运行：npm test -- draw-svg-tool
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
let win;
afterEach(() => {
  if (win) win.close();
  win = undefined;
});

function boot(extra) {
  return loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });
}

const GOOD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">'
  + "<defs><linearGradient id=\"g\"><stop offset=\"0\" stop-color=\"#6366f1\"/><stop offset=\"1\" stop-color=\"#22d3ee\"/></linearGradient></defs>"
  + "<rect width=\"120\" height=\"40\" rx=\"6\" fill=\"url(#g)\"/>"
  + "<text x=\"10\" y=\"24\" font-size=\"12\" fill=\"#fff\">草稿</text></svg>";

describe("draw_svg 工具契约", () => {
  it("① 良性 SVG → __SVG__ 标记 + 消毒内容；不进产物账（账只收可回访引用）", () => {
    win = boot();
    const raw = win.execTool("draw_svg", { svg: GOOD_SVG, title: "小横幅" });
    expect(raw.indexOf("__SVG__")).toBe(0);
    const payload = JSON.parse(raw.slice("__SVG__".length));
    expect(payload.title).toBe("小横幅");
    expect(payload.svg).toContain("linearGradient");       // 良性结构无损
    /* 订正（2026-10-30）：_aiArtifactPush 只收带 refId 的可回访产物；草图随会话 ⇒ 不入账，
       不留悬空引用。若将来做持久草稿（笔记/画廊），再回收此断言。 */
    expect(win.__test.aiArtifacts().some((a) => a.kind === "svg")).toBe(false);
  });

  it("② 恶意 SVG（script/onload）→ 成功但被消毒（__SVG__ 标记，载荷无危险内容）", () => {
    win = boot();
    const raw = win.execTool("draw_svg", {
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="5" height="5" onload="x()"/></svg>',
      title: "坏草图"
    });
    expect(raw.indexOf("__SVG__")).toBe(0);           // 可救的输入：消毒后放行（白名单重建=剪子树）
    const payload = JSON.parse(raw.slice("__SVG__".length));
    expect(payload.svg).not.toContain("script");
    expect(payload.svg).not.toContain("alert");
    expect(payload.svg).not.toContain("onload");
    expect(payload.svg).toContain("rect");            // 良性部分保留——不是一刀切拒绝
  });

  it("②b 畸形 SVG（无根 svg）→ ok:false 拒绝（无半成品入库）", () => {
    win = boot();
    const raw = win.execTool("draw_svg", { svg: "<div>not svg</div>", title: "坏输入" });
    expect(raw.indexOf("__SVG__")).not.toBe(0);
    const r = JSON.parse(raw);
    expect(r.ok).toBe(false);
    expect(String(r.msg)).toContain("SVG");
  });
});

describe("draw_svg 渲染（chat 管线）", () => {
  it("③ 历史里的 __SVG__ 工具消息 → .svg-msg 卡片：消毒 + 导出条 + 标题", () => {
    win = boot({
      [PREFIX + "chat_office"]: JSON.stringify([
        { role: "user", content: "画个小横幅", createdAt: "2026-10-30T08:00:00.000Z" },
        {
          role: "tool",
          content: "__SVG__" + JSON.stringify({ title: "小横幅", svg: GOOD_SVG }),
          _disp: "__SVG__" + JSON.stringify({ title: "小横幅", svg: GOOD_SVG }),
          createdAt: "2026-10-30T08:00:01.000Z"
        }
      ])
    });
    win.__test.setActive("office");
    win.renderChat();
    const card = win.document.querySelector("#chat .svg-msg");
    expect(card, "渲染出 svg-msg 卡片").toBeTruthy();
    expect(card.getAttribute("data-svgexport")).not.toBeNull();   // 导出容器（批次①②的委托接管）
    expect(card.querySelector("svg")).toBeTruthy();
    expect(card.textContent).toContain("小横幅");                // 标题入卡
    expect(card.querySelectorAll(".svg-exp-btn").length).toBe(2); // SVG / PNG 两个导出按钮
  });

  it("③b 防御纵深：渲染层对脏历史二次消毒（脏样本带不进可执行内容）", () => {
    win = boot({
      [PREFIX + "chat_office"]: JSON.stringify([
        {
          role: "tool",
          content: "__SVG__" + JSON.stringify({
            title: "脏",
            svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="5" height="5"/></svg>'
          }),
          _disp: "__SVG__" + JSON.stringify({
            title: "脏",
            svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="5" height="5"/></svg>'
          }),
          createdAt: "2026-10-30T08:00:01.000Z"
        }
      ])
    });
    win.__test.setActive("office");
    win.renderChat();
    const card = win.document.querySelector("#chat .svg-msg");
    /* 渲染层的 sanitizeSvg 把 script 子树删掉 ⇒ 只剩纯图形（这不返文本，也不含 script 文本） */
    expect(card).toBeTruthy();
    expect(card.querySelector("svg script")).toBeNull();
    expect(card.textContent).not.toContain("alert");
  });
});
