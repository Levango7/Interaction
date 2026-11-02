/**
 * draw-canvas.test.js —— Design 模式画布编辑器核心（画图能力 Phase B · docs/design-mode-phase-b.md）
 * ----------------------------------------------------------------------------
 * 钉八件事（批次①②③核心契约）：
 *  ① 文档 CRUD：dcCreate 默认标题/上限 50；持久化往返；
 *  ② dcAddNode：网格吸附、默认尺寸、类型白名单（非法→rect）、NODE_MAX 200 守护；
 *  ③ dcDeleteSelected：节点删除级联其连线；
 *  ④ 快照 undo/redo：变更→撤销恢复→重做；
 *  ⑤ dcAddEdge：自环/悬空/重复拒绝；
 *  ⑥ _dcRenderSvg：g.dnode + data-node-id + esc 文本 + 正交 path + 箭头 marker；
 *  ⑦ dcSetNodeText：变更压栈，同值不压；
 *  ⑧ 模式三向循环：toggle×2 → .body.design-mode + 「设计」标签 + #diagramDock/#drawStage 就位。
 *  ⑨⑩（2026-11-01 代修补）：文档条删除按钮走 SVG 且带可读名称；两段式确认 + 真删后落盘并给回执。
 *  ⑪ 连线 label：dcSetEdgeLabel 转义入库 + 渲染成 dedge-label（中点锚定）；
 *  ⑫ 体积/文本上限：DC_TEXT_MAX 截断、单图/总量字节预算（save 返回值必须被接）。
 * 运行：npm test -- draw-canvas
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
afterEach(() => {
  if (win) win.close();
  win = undefined;
  vi.restoreAllMocks();
});

function boot() {
  return loadApp({ storage: { wb_agent_onboarded: "true" } });
}

describe("画布模型（DiagramDoc）", () => {
  it("① dcCreate 默认标题 + 上限 50（最旧被挤出）+ 持久化往返", () => {
    win = boot();
    const first = win.dcCreate();
    expect(first.title).toBe("未命名图");
    expect(win.dcActiveId()).toBe(first.id);
    for (let i = 0; i < 55; i++) win.dcCreate("图" + i);
    expect(win.dcList().length).toBe(50);                      // cap
    expect(win.dcById(first.id), "最旧被挤出").toBeNull();      // cap 语义：保留最近 50 张
    const last = win.dcList()[0];
    expect(win.dcById(last.id).title).toBe("图54");            // 持久化往返
  });

  it("② dcAddNode：10px 吸附 + 类型白名单 + NODE_MAX 200", () => {
    win = boot();
    win.dcCreate();
    const n = win.dcAddNode("rect", 13, 27, 140, 56, "开始");
    expect(n.x).toBe(10);                                       // 13 → snap 10
    expect(n.y).toBe(30);                                       // 27 → snap 30
    expect(n.type).toBe("rect");
    const bad = win.dcAddNode("triangle", 0, 0, 100, 50, "");
    expect(bad.type).toBe("rect");                              // 非法类型回退 rect
    const d = win.dcActive();
    d.nodes.length = 0;
    for (let i = 0; i < 200; i++) d.nodes.push({ id: "n" + i, type: "rect", x: 0, y: 0, w: 40, h: 30, text: "" });
    win._dcSaveDoc(d);
    expect(win.dcAddNode("rect", 0, 0, 100, 50, "")).toBeNull();  // 上限 200：拒绝 + toast
  });

  it("③ dcDeleteSelected 级联其连线", () => {
    win = boot();
    win.dcCreate();
    const a = win.dcAddNode("rect", 0, 0, 100, 50, "A");
    const b = win.dcAddNode("rect", 200, 0, 100, 50, "B");
    win.dcAddEdge(a.id, b.id);
    expect(win.dcActive().edges.length).toBe(1);
    win.dcSelect("node", a.id);
    win.dcDeleteSelected();
    expect(win.dcActive().nodes.some(function (n) { return n.id === a.id; })).toBe(false);
    expect(win.dcActive().edges.length).toBe(0);                // 级联
  });
});

describe("快照 undo/redo", () => {
  it("④ move → undo 恢复坐标 → redo 重放", () => {
    win = boot();
    win.dcCreate();
    const n = win.dcAddNode("rect", 100, 100, 100, 50, "A");
    win._dcPushUndo(win.dcActive());
    win.dcMoveNode(n.id, 300, 300);
    expect(win.dcActive().nodes[0].x).toBe(300);
    expect(win.dcUndo()).toBe(true);
    expect(win.dcActive().nodes[0].x).toBe(100);
    expect(win.dcRedo()).toBe(true);
    expect(win.dcActive().nodes[0].x).toBe(300);
  });

  it("⑦ dcSetNodeText 变更压栈；同值不压（行为断言：undo 只回退一次）", () => {
    win = boot();
    win.dcCreate();
    const n = win.dcAddNode("rect", 0, 0, 100, 50, "");
    win.dcSetNodeText(n.id, "第一步");
    win.dcSetNodeText(n.id, "第一步");                          // 同值 → 不压栈不保存
    win.dcUndo();                                              // 只回退一次 → 回到空文本
    expect(win.dcActive().nodes[0].text).toBe("");
    win.dcRedo();                                              // 重放 → 第一步
    expect(win.dcActive().nodes[0].text).toBe("第一步");
  });

  it("⑤ dcAddEdge：自环/悬空/重复拒绝", () => {
    win = boot();
    win.dcCreate();
    const a = win.dcAddNode("rect", 0, 0, 100, 50, "A");
    expect(win.dcAddEdge(a.id, a.id)).toBeNull();               // 自环
    expect(win.dcAddEdge(a.id, "ghost")).toBeNull();            // 悬空
    win.dcAddEdge(a.id, a.id); // 占位失败不计
    const b = win.dcAddNode("rect", 200, 0, 100, 50, "B");
    const e1 = win.dcAddEdge(a.id, b.id);
    expect(e1).toBeTruthy();
    expect(win.dcAddEdge(a.id, b.id)).toBeNull();               // 重复
  });
});

describe("渲染序列化（_dcRenderSvg）", () => {
  it("⑥ g.dnode + data-node-id + esc 文本 + 正交 path + 箭头 marker", () => {
    win = boot();
    win.renderDrawWorkspace();                                  // 建 #drawStage/#drawCanvasHost（并自动建首图）
    const a = win.dcAddNode("rect", 100, 100, 100, 50, "<b>注入</b>");
    const b = win.dcAddNode("round", 400, 300, 100, 50, "B");
    win.dcAddEdge(a.id, b.id);
    const host = win.document.getElementById("drawCanvasHost");
    expect(host).toBeTruthy();
    win._dcRenderWorkspace();
    const svg = host.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg.querySelectorAll("g.dnode").length).toBe(2);
    expect(svg.querySelector("[data-node-id='" + a.id + "']")).toBeTruthy();
    const textEl = svg.querySelector("g.dnode text");
    expect(textEl.textContent).toContain("注入");                 // 内容在（textContent 解码实体）
    expect(textEl.querySelector("b"), "注入的 <b> 不得成为真实元素（esc 生效）").toBeNull();
    expect(svg.querySelectorAll("b").length).toBe(0);            // 整棵 SVG 无 b 元素
    expect(svg.querySelector("path[marker-end]")).toBeTruthy();                  // 箭头
    const dpath = svg.querySelector("g.dedge path:not([stroke='transparent'])").getAttribute("d");
    expect(dpath).toMatch(/^M\d+ \d+ L\d+/);                                     // 正交折线
  });
});

describe("连线 label（批次④ 审核补口）", () => {
  it("⑪ dcSetEdgeLabel：入库 + 渲染成 dedge-label（中点锚定）+ 文本转义", () => {
    win = boot();
    win.renderDrawWorkspace();
    const a = win.dcAddNode("rect", 100, 100, 100, 50, "A");
    const b = win.dcAddNode("rect", 500, 400, 100, 50, "B");
    const e = win.dcAddEdge(a.id, b.id);
    expect(e.label, "新建连线 label 为空").toBe("");
    expect(win.dcSetEdgeLabel(e.id, "<b>是</b>"), "写入成功").toBe(true);
    expect(win.dcById(win.dcActiveId()).edges[0].label).toBe("<b>是</b>");  // 原文入库，渲染时才转义
    win._dcRenderWorkspace();
    const svg = win.document.getElementById("drawCanvasHost").querySelector("svg");
    const lbl = svg.querySelector("text.dedge-label");
    expect(lbl, "有 label 时必须渲染出标签元素").toBeTruthy();
    expect(lbl.textContent).toBe("<b>是</b>");                  // textContent 解码实体
    expect(lbl.querySelector("b"), "注入的 <b> 不得成为真实元素").toBeNull();
    expect(svg.querySelectorAll("text.dedge-label b").length).toBe(0);
    expect(lbl.getAttribute("text-anchor")).toBe("middle");
    expect(lbl.getAttribute("pointer-events"), "标签不能吃掉连接线的点击").toBe("none");
  });

  it("⑪b 无 label 不渲染标签；空串=清除；同值不压栈", () => {
    win = boot();
    win.renderDrawWorkspace();
    const a = win.dcAddNode("rect", 100, 100, 100, 50, "A");
    const b = win.dcAddNode("rect", 500, 400, 100, 50, "B");
    const e = win.dcAddEdge(a.id, b.id);
    win._dcRenderWorkspace();
    let svg = win.document.getElementById("drawCanvasHost").querySelector("svg");
    expect(svg.querySelector("text.dedge-label"), "空 label 不得渲染空标签").toBeNull();
    win.dcSetEdgeLabel(e.id, "是");
    /* 同值再写：返回 true（幂等成功）且不改变内容 */
    expect(win.dcSetEdgeLabel(e.id, "是")).toBe(true);
    win.dcSetEdgeLabel(e.id, "");
    expect(win.dcById(win.dcActiveId()).edges[0].label).toBe("");
    win._dcRenderWorkspace();
    svg = win.document.getElementById("drawCanvasHost").querySelector("svg");
    expect(svg.querySelector("text.dedge-label")).toBeNull();
    expect(win.dcSetEdgeLabel("不存在的 id", "x"), "悬空 id 返回 false，不抛").toBe(false);
  });
});

describe("文本与体积上限（审核 Q4：不接 save 返回值 = 静默丢图）", () => {
  it("⑫ 节点文字与连线 label 都按 DC_TEXT_MAX 截断", () => {
    win = boot();
    win.dcCreate();                                              // 先有活动图（dcAddNode 依赖 dcActive）
    const n = win.dcAddNode("rect", 0, 0, 100, 50, "x".repeat(500));
    expect(n.text.length).toBe(80);
    win.dcSetNodeText(n.id, "y".repeat(300));
    expect(win.dcActive().nodes[0].text.length).toBe(80);
    const b = win.dcAddNode("rect", 300, 300, 100, 50, "B");
    const e = win.dcAddEdge(n.id, b.id);
    win.dcSetEdgeLabel(e.id, "z".repeat(300));
    expect(win.dcActive().edges[0].label.length).toBe(80);
  });

  it("⑫b 单图超 128KB 拒写并返回 false（不落盘、不静默丢失）", () => {
    win = boot();
    win.dcCreate("大图");
    const d = win.dcActive();
    d.title = "T".repeat(130 * 1024);        // 撑过 128KB 预算
    const ok = win._dcSaveDoc(d);
    expect(ok, "超单图预算必须如实返回 false").toBe(false);
    expect(win.dcById(d.id).title.length, "落盘的仍是旧版本（不是半截超预算稿）").toBeLessThan(1024);
  });

  it("⑫c save 返回 false 时 _dcSaveList 如实传 false（不吞返回值）", () => {
    win = boot();
    const real = win.save;
    win.save = function () { return false; };
    const ok = win._dcSaveList([{ id: "x", title: "t", nodes: [], edges: [] }]);
    win.save = real;
    expect(ok, "存储写失败必须向上报告").toBe(false);
  });
});

describe("真实双击改名（2026-11-02 修复：双击判据=同一目标 350ms 内第二击）", () => {
  /** 进 design 模式，_dcOnDown 的模式门才会放行 */
  function bootDesign() {
    const w = boot();
    w.toggleUIMode();
    w.toggleUIMode();
    return w;
  }
  /** jsdom 无 PointerEvent 时 MouseEvent 同型派发同样命中（真实浏览器实测 detail=0） */
  function fire(win, el) {
    const EvCtor = typeof win.PointerEvent === "function" ? win.PointerEvent : win.MouseEvent;
    el.dispatchEvent(new EvCtor("pointerdown", { bubbles: true, detail: 1 }));
  }
  it("⑬ 两击同一节点（<350ms）→ body 浮层 input 出现且回写改名", () => {
    win = bootDesign();
    win.renderDrawWorkspace();
    const a = win.dcAddNode("rect", 100, 100, 120, 50, "旧文字");
    const host = win.document.getElementById("drawCanvasHost");
    fire(win, host.querySelector("[data-node-id='" + a.id + "']"));
    expect(win.document.querySelector("body > input[type='text']"), "第一击（单击）不得弹改名浮层").toBeNull();
    // 第一击已触发整画布重渲染（_dcRenderWorkspace），旧引用已脱离文档，必须重查
    fire(win, host.querySelector("[data-node-id='" + a.id + "']"));
    const input = win.document.querySelector("body > input[type='text']");
    expect(input, "同一节点 350ms 内第二击应弹浮层").toBeTruthy();
    expect(input.value).toBe("旧文字");
    input.value = "新文字";
    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(win.dcActive().nodes.find(function (n) { return n.id === a.id; }).text).toBe("新文字");
  });

  it("⑬b 两击同一连线 → 浮层回写 label；换目标的两击不视为双击", () => {
    win = bootDesign();
    win.renderDrawWorkspace();
    const a = win.dcAddNode("rect", 100, 100, 120, 50, "A");
    const b = win.dcAddNode("rect", 320, 100, 120, 50, "B");
    const e = win.dcAddEdge(a.id, b.id);
    const host = win.document.getElementById("drawCanvasHost");
    fire(win, host.querySelector("[data-edge-id='" + e.id + "']"));
    expect(win.document.querySelector("body > input[type='text']"), "连线单击不得弹改名浮层").toBeNull();
    // 连续快速点击两个不同目标：任何单个目标都只有一击，不得判为双击
    fire(win, host.querySelector("[data-node-id='" + a.id + "']"));
    fire(win, host.querySelector("[data-node-id='" + b.id + "']"));
    expect(win.document.querySelector("body > input[type='text']"), "换目标的两击不弹浮层").toBeNull();
    // 再对同一连线快速两击（每次重渲染后重查元素）
    fire(win, host.querySelector("[data-edge-id='" + e.id + "']"));
    fire(win, host.querySelector("[data-edge-id='" + e.id + "']"));
    const input = win.document.querySelector("body > input[type='text']");
    expect(input, "同一连线 350ms 内第二击应弹浮层").toBeTruthy();
    input.value = "是";
    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(win.dcActive().edges.find(function (x) { return x.id === e.id; }).label).toBe("是");
  });
});

describe("Design 模式三向循环（批次③ 集成）", () => {
  it("⑧ toggle×2 → .body.design-mode + 「设计」标签 + dock/画布就位；回 Work 清空 dock", () => {
    win = boot();
    win.toggleUIMode();                                          // work → code
    expect(win.document.querySelector(".body").classList.contains("code-mode")).toBe(true);
    win.toggleUIMode();                                          // code → design
    const body = win.document.querySelector(".body");
    expect(body.classList.contains("design-mode")).toBe(true);
    expect(body.classList.contains("code-mode")).toBe(false);
    expect(win.document.getElementById("uiModeLbl").textContent).toBe("设计");
    expect(win.document.getElementById("diagramDock")).toBeTruthy();
    expect(win.document.getElementById("drawStage")).toBeTruthy();
    expect(win.dcList().length >= 1).toBe(true);                 // 自动建了首图
    win.toggleUIMode();                                          // design → work
    expect(body.classList.contains("design-mode")).toBe(false);
    expect(win.document.getElementById("diagramDock").innerHTML).toBe("");  // dock 清空
  });

  it("⑧b dcSwitch 切换图清空选择与 undo 栈（行为断言：旧图上 undo 不再生效）", () => {
    win = boot();
    const d1 = win.dcCreate("图一");
    const n = win.dcAddNode("rect", 0, 0, 100, 50, "A");
    win._dcPushUndo(win.dcActive());
    const d2 = win.dcCreate("图二");
    win.dcSwitch(d1.id);
    expect(win.dcActiveId()).toBe(d1.id);
    expect(win.dcUndo(), "undo 栈已清：返回 false").toBe(false);
    expect(win.dcActive().nodes.some(function (m) { return m.id === n.id; })).toBe(true);
  });
});

/* ⑨⑩ —— 2026-11-01 代修那批门禁红时补的射程：改动前的文档条用的是裸字形 ✓/✕ 按钮，
   且删除没有回执（字典里 `draw.doc.deleted` 是死键）。这两条不是"顺手加的测试"，
   而是**这两处改动本身此前无任何用例覆盖** —— 没有它们，改坏了也不会红。 */
describe("文档条的删除 affordance 与回执", () => {
  /** 进 design 模式（work → code → design），让 dock 真渲染出来 */
  function bootDesign() {
    const w = boot();
    w.toggleUIMode();
    w.toggleUIMode();
    return w;
  }

  it("⑨ 删除按钮是 SVG 图标 + 可读名称，不再是裸字形（lint:icons 的 P0 形状不许回流）", () => {
    win = bootDesign();
    win.dcCreate("第二张");
    win._dcRenderDocDock();
    const btns = [...win.document.querySelectorAll("#diagramDock .dc-del")];
    expect(btns.length, "每张图各一个删除按钮").toBeGreaterThanOrEqual(2);
    for (const b of btns) {
      expect(b.querySelector("svg"), `按钮应是 SVG 图标：${b.outerHTML.slice(0, 70)}`).toBeTruthy();
      expect(["✓", "✕"].includes(b.textContent.trim()), "按钮内容不该再是裸字形").toBe(false);
      expect(b.getAttribute("aria-label") || b.getAttribute("title"), "纯图标按钮要有可读名称").toBeTruthy();
    }
  });

  it("⑩ 两段式确认：首次点=待确认（不删）、二次点=真删 + 落盘收缩 + 给回执", () => {
    win = bootDesign();
    const d = win.dcCreate("要删的图");
    win._dcRenderDocDock();
    const before = win.dcList().length;
    const btn = win.document.querySelector(`#diagramDock .dc-del[data-del="${d.id}"]`);
    expect(btn, "新建的图应有删除按钮").toBeTruthy();
    btn.click();
    expect(win.dcList().length, "第一次点击不许删（两段式确认）").toBe(before);
    const armed = win.document.querySelector(`#diagramDock .dc-del[data-del="${d.id}"]`);
    expect(armed.querySelector("svg"), "待确认态同样走 SVG").toBeTruthy();
    armed.click();
    expect(win.dcById(d.id), "二次点击后图应消失").toBeNull();
    expect(win.dcList().length).toBe(before - 1);
    const persisted = JSON.parse(win.localStorage.getItem("wb_agent_diagrams") || "[]");
    expect(persisted.length, "落盘要同步收缩（不然重启后那张又回来了）").toBe(before - 1);
    const texts = [...win.document.querySelectorAll("#toasts .toast")].map((e) => e.textContent).join("|");
    expect(texts, "删除是同步写盘，落完才报『图已删除』").toContain("图已删除");
  });
});

/* ⑬–⑰ —— AI 桥「在画布打开」（Phase B §七 · 本方案最后一条未落地条目）
   口径：底稿 = 一次性的整体引用（移动 / 缩放 / 删除），**不做** SVG→图元识别。
   所以这几条钉的是「拒得对」「放得对」「关得对」，不是"渲染好不好看"。 */
describe("AI 桥：draw_svg 产物作为底稿嵌入画布", () => {
  const VB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="10" y="10" width="100" height="60" fill="#abc"/><text x="20" y="40">hi</text></svg>';
  const WH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><circle cx="60" cy="40" r="30"/></svg>';
  const NOBOX_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
  const DIRTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5" onclick="alert(1)"/><g></g></svg>';

  function bootDesign() { const w = boot(); w.toggleUIMode(); w.toggleUIMode(); return w; }
  function toastTexts() {
    return [...win.document.querySelectorAll("#toasts .toast")].map((e) => e.textContent).join("|");
  }

  it("⑬ dcEmbedPayload：viewBox 优先 → 退化到 width/height → 都定不了标就拒", () => {
    win = boot();
    const a = win.dcEmbedPayload(VB_SVG);
    expect(a.vb).toBe("0 0 400 200");
    expect(a.inner).toContain("<rect");
    expect(a.inner, "只取根的子节点：外层 <svg> 由画布自己按节点尺寸重建").not.toMatch(/^<svg/);
    const b = win.dcEmbedPayload(WH_SVG);
    expect(b.vb, "无 viewBox 时用 width/height 定标").toBe("0 0 120 80");
    expect(win.dcEmbedPayload(NOBOX_SVG), "定不了标就不塞（宁可拒，不放一个会失真的 0×0）").toBeNull();
    expect(win.dcEmbedPayload("这根本不是 SVG")).toBeNull();
  });

  it("⑬b 底稿入库前已消毒：事件句柄进不了 inner（画布按已消毒串直插，脏了就是自伤）", () => {
    win = boot();
    const p = win.dcEmbedPayload(DIRTY_SVG);
    expect(p, "剥掉句柄后仍有内容 ⇒ 不该整张拒").toBeTruthy();
    expect(p.inner).not.toMatch(/onclick/i);
    expect(p.inner).not.toMatch(/<scr/i);
  });

  it("⑭ dcAddEmbedNode：入文档 + 落盘往返 + 进快照栈（撤销能取消这张底稿）", () => {
    win = boot();
    win.dcCreate("底稿图");
    const n = win.dcAddEmbedNode(win.dcEmbedPayload(VB_SVG), 0, 0, 320, 160);
    expect(n.type).toBe("embed");
    expect([n.x, n.y, n.w, n.h]).toEqual([0, 0, 320, 160]);
    const persisted = JSON.parse(win.localStorage.getItem("wb_agent_diagrams") || "[]");
    expect(persisted[0].nodes[0].inner, "不落盘 = 刷新就丢").toContain("<rect");
    expect(win.dcUndo(), "底稿该进 undo 栈").toBe(true);
    expect(win.dcActive().nodes.length).toBe(0);
    expect(JSON.parse(win.localStorage.getItem("wb_agent_diagrams") || "[]")[0].nodes.length, "撤销同步落盘").toBe(0);
  });

  it("⑭b 超预算在**改动之前**拒：文档不长、undo 栈不涨、回执说的是底稿", () => {
    win = boot();
    win.dcCreate("预算图");
    const huge = { vb: "0 0 100 100", inner: '<rect width="100" height="100" data-pad="' + "x".repeat(200 * 1024) + '"/>' };
    expect(win.dcAddEmbedNode(huge, 0, 0, 100, 100), "128KB 单图预算没过 ⇒ 返回 null").toBeNull();
    expect(win.dcActive().nodes.length, "预算没过就不该动文档").toBe(0);
    expect(win.dcUndo(), "也没压快照（撤销栈仍是空的）").toBe(false);
    expect(toastTexts()).toContain("底稿超出单图 128KB 预算");
  });

  it("⑮ 渲染：底稿垫在手工节点下面（**后加的也要垫底**）+ 嵌套 <svg> 带定标框 + 虚线框 + 透明热区", () => {
    win = boot();
    win.dcCreate("叠放图");
    /* 顺序按真实用法摆：用户先手工画了节点，才把 AI 图放进来当底稿。
       —— 变异自证（M2）抓出我初版把底稿先加、节点后加，那样数组顺序与类型顺序一致，
       删掉"embed 先画"那支也不会红，等于一条空转的断言。 */
    const r = win.dcAddNode("rect", 400, 400, 140, 56, "手工");
    const e = win.dcAddEmbedNode(win.dcEmbedPayload(VB_SVG), 0, 0, 320, 160);
    const out = win._dcRenderSvg();
    expect(out.indexOf('data-node-id="' + e.id + '"') < out.indexOf('data-node-id="' + r.id + '"'),
      "底稿后加仍必须画在手工节点之前（语义是「垫在下面加工」）").toBe(true);
    expect(out).toContain('<svg x="0" y="0" width="320" height="160" viewBox="0 0 400 200"');
    expect(out).toContain('stroke-dasharray="6 4"');
    expect(out).toContain('fill="transparent"');
  });

  it("⑯ 底稿没有文字维度：公开入口静默拒 + 双击给专用回执、不弹输入框", () => {
    win = bootDesign();
    const e = win.dcAddEmbedNode(win.dcEmbedPayload(VB_SVG), 0, 0, 320, 160);
    win.dcSetNodeText(e.id, "改字");
    expect(win.dcActive().nodes[0].text, "不只拦 UI，dcSetNodeText 也守住").toBe("");
    win.dcSelect("node", e.id);
    const host = win.document.getElementById("drawCanvasHost");
    const nodeEl = host.querySelector('[data-node-id="' + e.id + '"]');
    expect(nodeEl, "底稿应命中 .dnode 分组").toBeTruthy();
    nodeEl.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
    /* 认浮层自己的形状：**直接挂 body 的 input**（_dcFloatInput 用 appendChild(document.body)）。
       两个坑都实测过：`input[maxlength]` 会命中右栏表单的 12 个常驻输入框（假红），
       `[style*="position:fixed"]` 又因为 jsdom 把 cssText 序列化成 "position: fixed"（带空格）而永不命中（假绿）。 */
    const floated = win.document.querySelectorAll("body > input");
    const dump = [...floated].map((i) => i.outerHTML.slice(0, 120)).join(" | ");
    expect(floated.length, "不该弹浮层输入框；实收 [" + dump + "]").toBe(0);
    expect(toastTexts()).toContain("底稿不支持改文字");
    /* 反向对照：同一套双击路径对普通节点必须真弹输入框 —— 否则上面那条"没弹"
       可能只是监听器压根没跑（假绿的形状与假红一模一样）。 */
    const r2 = win.dcAddNode("rect", 600, 600, 140, 56, "可改字");
    win.dcSelect("node", r2.id);
    const rectEl = win.document.querySelector('[data-node-id="' + r2.id + '"]');
    rectEl.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
    expect(win.document.querySelectorAll("body > input").length,
      "普通节点双击仍要能改字").toBe(1);
  });

  it("⑰ 端到端：产物卡按钮一点 → 底稿进画布 + 自动切 Design + 属性条说的是 AI 底稿", () => {
    win = boot();
    win.document.body.insertAdjacentHTML("beforeend",
      '<div class="msg tool svg-msg" data-svgexport data-svgname="架构图">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#eee"/></svg>'
      + '<button type="button" class="svg-exp-btn dc-embed-btn" data-canvasembed="1" data-svgname="架构图">在画布打开</button></div>');
    expect(win._uiMode()).toBe("work");
    win.document.querySelector("[data-canvasembed]").click();
    expect(win._uiMode(), "桥的另一端在画布：不放用户留在聊天里").toBe("design");
    /* 布局壳用 `.app > .body`：裸 `.body` 会被列表项的同名 class 抢先命中
       （e2e strict mode 那条红就是这么来的，jsdom 里则表现为静默取错元素）。 */
    expect(win.document.querySelector(".app > .body").classList.contains("design-mode")).toBe(true);
    const d = win.dcActive();
    expect(d.title, "新建图用产物标题命名，而不是默认的「未命名图」").toBe("架构图");
    const e = d.nodes.find((n) => n.type === "embed");
    expect(e, "文档里应多出一个底稿节点").toBeTruthy();
    expect(e.vb).toBe("0 0 200 100");
    expect([e.w, e.h], "按 2:1 定标塞进 320×200 的占位框").toEqual([320, 160]);
    expect(win.document.getElementById("dcProps").textContent).toContain("AI 底稿");
    expect(toastTexts()).toContain("已把这张图作为底稿放进画布");
  });

  it("⑰b 卡里没有 svg（老历史被截断那一类）⇒ 专用回执，且不把人切进空画布", () => {
    win = boot();
    win.document.body.insertAdjacentHTML("beforeend",
      '<div data-svgexport data-svgname="旧"><button type="button" data-canvasembed="1">在画布打开</button></div>');
    win.document.querySelector("[data-canvasembed]").click();
    expect(win._uiMode(), "拒的时候就别顺手切模式").toBe("work");
    expect(toastTexts()).toContain("这张卡片里没有可放进画布的图");
  });
});
