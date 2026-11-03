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
 *  ⑧ 模式三向循环：toggle×2 → .body.design-mode + 「设计」标签 + #diagramDock（须挂 .body）/ #drawStage 就位。
 *  ⑨⑩（2026-11-01 代修补）：文档条删除按钮走 SVG 且带可读名称；两段式确认 + 真删后落盘并给回执。
 *  ⑪ 连线 label：dcSetEdgeLabel 转义入库 + 渲染成 dedge-label（中点锚定）；
 *  ⑫ 体积/文本上限：DC_TEXT_MAX 截断、单图/总量字节预算（save 返回值必须被接）。
 *  ⑬/⑬b（ZCode `f7b7ebd1`）：真实双击可达性 —— 两击同一节点/连线弹浮层回写，换目标的两击不算双击。
 *  ⑭–⑱b（AI 桥一族，2026-11-02）：底稿载荷抽取与拒绝、入库消毒、预算前置拒、垫底渲染顺序、
 *    文字维度封两处、产物卡按钮端到端；原编号 ⑬–⑰b，因与上一条重号整体后移一位。
 *  ⑲–㉒（Phase C1，2026-11-03）：底稿 id 前缀隔离（定义与 url()/href 引用成对改名、与画布
 *    #darr 不再撞、同图两底稿前缀互异、原型键名也改名）、老底稿载入迁移 + 回写、
 *    超预算整图还原/静默放弃、二次载入幂等。
 *  ㉓–㉗（Phase C3，2026-11-03）：连线路由绕障（有界搜索：横段走上/下、竖段走左/右，同层取最短，
 *    深度与前沿都设上界）——不撞时输出与从前逐字节相同、绕不过时退回三段、label 落在路由后的折线上、
 *    200 节点拥挤图上段数不超预算且两次渲染逐字节相同。
 *  ⚠️ C3 一族在测试里**另写**穿过判定（_tSegCrossesRect），不复用被测的 _dcSegHitsRect：
 *    共用同一个几何判据时判据本身写错会实现与断言一起错（同义反复的假绿）。
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
    // 2026-11-02：dock 必须挂在 .body 上（CSS 按它作为 design 网格的 1/2 网格项写）；
    // 曾被 side.appendChild 挂进 nav.side，网格规则全部失效、首屏只剩约 14px 可见。
    expect(win.document.getElementById("diagramDock").parentElement).toBe(body);
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

/* ⑭–⑱b（AI 桥一族）—— 原 ⑬–⑰b，因 ZCode f7b7ebd1 占了 ⑬/⑬b 而整体后移一位 —— AI 桥「在画布打开」（Phase B §七 · 本方案最后一条未落地条目）
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

  it("⑭ dcEmbedPayload：viewBox 优先 → 退化到 width/height → 都定不了标就拒", () => {
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

  it("⑭b 底稿入库前已消毒：事件句柄进不了 inner（画布按已消毒串直插，脏了就是自伤）", () => {
    win = boot();
    const p = win.dcEmbedPayload(DIRTY_SVG);
    expect(p, "剥掉句柄后仍有内容 ⇒ 不该整张拒").toBeTruthy();
    expect(p.inner).not.toMatch(/onclick/i);
    expect(p.inner).not.toMatch(/<scr/i);
  });

  it("⑮ dcAddEmbedNode：入文档 + 落盘往返 + 进快照栈（撤销能取消这张底稿）", () => {
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

  it("⑮b 超预算在**改动之前**拒：文档不长、undo 栈不涨、回执说的是底稿", () => {
    win = boot();
    win.dcCreate("预算图");
    const huge = { vb: "0 0 100 100", inner: '<rect width="100" height="100" data-pad="' + "x".repeat(200 * 1024) + '"/>' };
    expect(win.dcAddEmbedNode(huge, 0, 0, 100, 100), "128KB 单图预算没过 ⇒ 返回 null").toBeNull();
    expect(win.dcActive().nodes.length, "预算没过就不该动文档").toBe(0);
    expect(win.dcUndo(), "也没压快照（撤销栈仍是空的）").toBe(false);
    expect(toastTexts()).toContain("底稿超出单图 128KB 预算");
  });

  it("⑯ 渲染：底稿垫在手工节点下面（**后加的也要垫底**）+ 嵌套 <svg> 带定标框 + 虚线框 + 透明热区", () => {
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

  it("⑰ 底稿没有文字维度：公开入口静默拒 + 双击给专用回执、不弹输入框", () => {
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

  it("⑱ 端到端：产物卡按钮一点 → 底稿进画布 + 自动切 Design + 属性条说的是 AI 底稿", () => {
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

  it("⑱b 卡里没有 svg（老历史被截断那一类）⇒ 专用回执，且不把人切进空画布", () => {
    win = boot();
    win.document.body.insertAdjacentHTML("beforeend",
      '<div data-svgexport data-svgname="旧"><button type="button" data-canvasembed="1">在画布打开</button></div>');
    win.document.querySelector("[data-canvasembed]").click();
    expect(win._uiMode(), "拒的时候就别顺手切模式").toBe("work");
    expect(toastTexts()).toContain("这张卡片里没有可放进画布的图");
  });

  /* ---- Phase C1：底稿 id 前缀隔离（把 B16 那条已知边界做实） ----
     底稿与画布自身（marker#darr）、与别的底稿共用一个文档 id 空间，同名互相覆盖 ⇒ 箭头/渐变串色。 */
  const MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">'
    + '<defs><marker id="darr" viewBox="0 0 10 10"><path d="M0 0L10 5L0 10z"/></marker>'
    + '<linearGradient id="g1"><stop offset="0" stop-color="#f00"/></linearGradient></defs>'
    + '<path d="M0 0L50 0" marker-end="url(#darr)" fill="url(#g1)"/>'
    + '<use href="#sym"/><symbol id="sym"><circle r="3"/></symbol></svg>';

  it("⑲ id 与指向它的引用成对改名：url() 走 fill/marker-end，锚点走 href", () => {
    win = boot();
    const p = win.dcEmbedPayload(MARK_SVG);
    expect(p.pfx).toMatch(/^dce-[a-z0-9]+-$/);
    ["darr", "g1", "sym"].forEach((id) => {
      expect(p.inner, "定义侧 " + id + " 该带前缀").toContain('id="' + p.pfx + id + '"');
      /* 裸名只可能出现在 `#id` 或 `"id"` 之后；改名后那个位置变成前缀，所以这条是"没漏改"的判据。 */
      expect(p.inner, "引用侧不该留裸名 " + id).not.toMatch(new RegExp('[#"\']' + id + '["\')\\s]'));
    });
    expect(p.inner).toContain("url(#" + p.pfx + "darr)");
    expect(p.inner).toContain("url(#" + p.pfx + "g1)");
    expect(p.inner).toMatch(/#dce-[a-z0-9]+-sym/);
  });

  it("⑲b 撞名不再串：底稿里也叫 darr，渲染后画布自己的 marker 仍是唯一 #darr", () => {
    win = boot();
    win.dcCreate("撞名图");
    const a = win.dcAddNode("rect", 0, 0, 100, 60, "A");
    const b = win.dcAddNode("rect", 300, 0, 100, 60, "B");
    win.dcAddEdge(a.id, b.id);
    const n = win.dcAddEmbedNode(win.dcEmbedPayload(MARK_SVG), 0, 200, 320, 160);
    expect(n.pfx, "前缀写进节点（迁移判据认的就是它）").toBeTruthy();
    const out = win._dcRenderSvg();
    expect(out.match(/id="darr"/g) || [], "画布 #darr 只能有一个；底稿那份该已改名").toHaveLength(1);
    expect(out).toContain('marker-end="url(#darr)"');
    expect(out).toContain("url(#" + n.pfx + "darr)");
  });

  it("⑲c 同图两张底稿各用各的前缀（互不覆盖才叫隔离）", () => {
    win = boot();
    win.dcCreate("两张底稿");
    const p1 = win.dcEmbedPayload(MARK_SVG);
    const p2 = win.dcEmbedPayload(MARK_SVG);
    expect(p2.pfx).not.toBe(p1.pfx);
    win.dcAddEmbedNode(p1, 0, 0, 320, 160);
    win.dcAddEmbedNode(p2, 400, 0, 320, 160);
    const ids = (win._dcRenderSvg().match(/id="dce-[a-z0-9]+-darr"/g) || []);
    expect(ids, "两份 marker 定义各自带自己的前缀").toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("⑲d 原型键名也要改名：映射表用 {} 时 id=constructor 既漏改定义、又把引用写成函数源码", () => {
    win = boot();
    const PROTO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">'
      + '<defs><linearGradient id="constructor"><stop offset="0" stop-color="#0f0"/></linearGradient></defs>'
      + '<rect width="10" height="10" fill="url(#constructor)"/></svg>';
    const p = win.dcEmbedPayload(PROTO_SVG);
    expect(p.inner, "定义侧").toContain('id="' + p.pfx + 'constructor"');
    expect(p.inner, "引用侧").toContain("url(#" + p.pfx + "constructor)");
    expect(p.inner, "不许把引用换成 Object.prototype 上的函数源码").not.toMatch(/url\(#function/);
  });

  it("⑳ 不用 id 的底稿串保持原样（不掺前缀垃圾），但仍带 pfx 标记", () => {
    win = boot();
    const p = win.dcEmbedPayload(VB_SVG);
    expect(p.inner, "没有 id 就不该改串").not.toMatch(/dce-/);
    expect(p.inner).toContain("<rect");
    expect(p.pfx, "标记照样打：迁移判据认 pfx 而不是认串，省得每次载入重扫").toMatch(/^dce-/);
  });

  /** 造一份"v3.7.153 形状"的老底稿：内层裸 id、节点没有 pfx 字段。 */
  function legacyList(title, svgInner) {
    return [{
      id: "doc-legacy-1", title, updatedAt: 1,
      nodes: [{ id: "n1", type: "embed", x: 0, y: 0, w: 320, h: 160, vb: "0 0 200 100", inner: svgInner, text: "" }],
      edges: []
    }];
  }

  it("㉑ 老底稿（无 pfx）载入即补隔离并回写；已是新格式的图一字不动（反向对照）", () => {
    const legacy = '<marker id="darr" viewBox="0 0 10 10"/><path d="M0 0L50 0" marker-end="url(#darr)"/>';
    const fresh = '<marker id="darr" viewBox="0 0 10 10"/><path d="M0 0L50 0" marker-end="url(#dce-keepme-darr)"/>';
    win = loadApp({
      storage: {
        wb_agent_onboarded: "true",
        wb_agent_diagrams: JSON.stringify([
          { id: "doc-old", title: "老图", updatedAt: 1, nodes: [{ id: "n1", type: "embed", x: 0, y: 0, w: 320, h: 160, vb: "0 0 200 100", inner: legacy, text: "" }], edges: [] },
          { id: "doc-new", title: "新图", updatedAt: 1, nodes: [{ id: "n2", type: "embed", x: 0, y: 0, w: 320, h: 160, vb: "0 0 200 100", inner: fresh, pfx: "dce-keepme-", text: "" }], edges: [] }
        ])
      }
    });
    const list = JSON.parse(win.localStorage.getItem("wb_agent_diagrams") || "[]");
    const old = list.find((d) => d.id === "doc-old").nodes[0];
    expect(old.pfx, "老底稿补完要留标记，否则每次载入重扫").toMatch(/^dce-[a-z0-9]+-$/);
    expect(old.inner).toContain('id="' + old.pfx + 'darr"');
    expect(old.inner).toContain("url(#" + old.pfx + "darr)");
    expect(list.find((d) => d.id === "doc-new").nodes[0].inner,
      "已有 pfx 的图不该被动——迁移把新格式改坏比不迁更糟").toBe(fresh);
  });

  it("㉑b 补完就放不下 ⇒ 整图还原不写（宁可留着已知的串色，也不在启动时弹「超出预算」）", () => {
    /* 这条测的是"改之前放得下、改之后放不下"这个形状本身：
       601 处 dce-<uid>- 前缀 = +10.8KB，把 126KB 的图推过 128KB 单图上限。 */
    const refs = '<use href="#m"/>'.repeat(600);
    const inner = '<marker id="m"/>' + refs + '<rect data-pad="' + "x".repeat(115000) + '"/>';
    const seed = [{ id: "doc-big", title: "大底稿", updatedAt: 1, nodes: [{ id: "n1", type: "embed", x: 0, y: 0, w: 320, h: 160, vb: "0 0 200 100", inner, text: "" }], edges: [] }];
    expect(JSON.stringify(seed).length, "fixture 若本身就超预算，这条测的是空气").toBeLessThan(128 * 1024);
    win = loadApp({ storage: { wb_agent_onboarded: "true", wb_agent_diagrams: JSON.stringify(seed) } });
    const kept = JSON.parse(win.localStorage.getItem("wb_agent_diagrams") || "[]")[0].nodes[0];
    expect(kept.inner, "超预算的图整图还原：串保持原样").toBe(inner);
    expect(kept.pfx, "也不留半个 pfx（留了就等于宣告「已隔离」）").toBeUndefined();
    expect([...win.document.querySelectorAll("#toasts .toast")].map((e) => e.textContent).join("|"),
      "启动时不该冒出一条存储告警").toBe("");
  });

  it("㉑c 总量超 1MB ⇒ 静默放弃这次优化（不把「图总量超出预算」冒到启动面上）", () => {
    /* _dcSaveList 超限是"先 toast 再拒"：迁移是启动时的后台优化，冒这条会让人以为图要没了。
       所以在门外自己判掉 —— 这条钉的就是"门外的判据真的在门外面"。 */
    const inner = '<marker id="m"/><use href="#m"/><rect data-pad="' + "x".repeat(6000) + '"/>';
    const big = { id: "doc-pad", title: "占位图", updatedAt: 1, nodes: [{ id: "p", type: "rect", x: 0, y: 0, w: 10, h: 10, text: "y".repeat(1032 * 1024) }], edges: [] };
    const legacy = { id: "doc-old", title: "老图", updatedAt: 1, nodes: [{ id: "n1", type: "embed", x: 0, y: 0, w: 320, h: 160, vb: "0 0 200 100", inner, text: "" }], edges: [] };
    const seed = [legacy, big];
    expect(JSON.stringify(seed).length, "fixture 得真的过 1MB 总量线，否则这条测的是空气").toBeGreaterThan(1024 * 1024);
    win = loadApp({ storage: { wb_agent_onboarded: "true", wb_agent_diagrams: JSON.stringify(seed) } });
    const kept = JSON.parse(win.localStorage.getItem("wb_agent_diagrams") || "[]").find((d) => d.id === "doc-old").nodes[0];
    expect(kept.inner, "总量超限这次就不回写").toBe(inner);
    expect(kept.pfx, "更不该留半个 pfx").toBeUndefined();
    expect([...win.document.querySelectorAll("#toasts .toast")].map((e) => e.textContent).join("|")).toBe("");
  });

  it("㉒ 迁移幂等：拿迁移后的盘再启一次，不出现二次前缀", () => {
    const legacy = '<marker id="darr"/><path marker-end="url(#darr)"/>';
    win = loadApp({ storage: { wb_agent_onboarded: "true", wb_agent_diagrams: JSON.stringify(legacyList("老图", legacy)) } });
    const once = JSON.parse(win.localStorage.getItem("wb_agent_diagrams") || "[]");
    const after1 = once[0].nodes[0];
    expect(after1.pfx, "先确认真迁移过，否则下面的「相等」是两条空转").toMatch(/^dce-[a-z0-9]+-$/);
    win.close(); win = undefined;
    win = loadApp({ storage: { wb_agent_onboarded: "true", wb_agent_diagrams: JSON.stringify(once) } });
    const after2 = JSON.parse(win.localStorage.getItem("wb_agent_diagrams") || "[]")[0].nodes[0];
    expect(after2.inner).toBe(after1.inner);
    expect(after2.inner, "dce-…-dce-… 就是重入了前缀").not.toMatch(/dce-[a-z0-9]+-dce-/);
  });
});

/* ---------- Phase C3：连线路由绕障 ----------
 * ⚠️ 本族的"穿没穿"判定**在测试里另写一遍**（_tSegCrossesRect），不复用被测的
 *    `_dcSegHitsRect`：共用同一个几何判据时，判据 itself 写错会让实现与断言一起错（同义反复的假绿）。 */
function _tParsePoly(d) {
  return d.trim().split(/\s+(?=[ML])/).map(function (tok) {
    const m = /^[ML](-?\d+)\s+(-?\d+)$/.exec(tok.trim());
    if (!m) throw new Error("折线 token 不合法: [" + tok + "] 来自 d=[" + d + "]");
    return { x: Number(m[1]), y: Number(m[2]) };
  });
}
function _tSegCrossesRect(x1, y1, x2, y2, r) {
  const L = r.x + 1, R = r.x + r.w - 1, T = r.y + 1, B = r.y + r.h - 1;
  if (R <= L || B <= T) return false;
  if (y1 === y2) return y1 > T && y1 < B && Math.min(x1, x2) < R && Math.max(x1, x2) > L;
  if (x1 === x2) return x1 > L && x1 < R && Math.min(y1, y2) < B && Math.max(y1, y2) > T;
  return true;   // 出现非轴对齐段就说明路由漏了直角约束
}
function _tCrossesAny(d, rects) {
  const pts = _tParsePoly(d);
  for (let i = 0; i + 1 < pts.length; i++) {
    for (const r of rects) {
      if (_tSegCrossesRect(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, r)) return true;
    }
  }
  return false;
}

describe("连线路由绕障（Phase C3）", () => {
  function doc(nodes, edges) {
    const w = boot();
    w.dcCreate("路由图");
    const byTag = {};
    nodes.forEach(function (n) { byTag[n.tag] = w.dcAddNode("rect", n.x, n.y, n.w, n.h, n.tag); });
    edges.forEach(function (p) { w.dcAddEdge(byTag[p[0]].id, byTag[p[1]].id); });
    return { win: w, byTag: byTag };
  }
  function edgeD(ctx, fromTag, toTag) {
    const w = ctx.win;
    const d = w.dcActive();
    const byId = {}; d.nodes.forEach(function (n) { byId[n.id] = n; });
    const rects = d.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }; });
    const e = d.edges.find(function (m) { return m.from === ctx.byTag[fromTag].id && m.to === ctx.byTag[toTag].id; });
    return { dstr: w._dcEdgePath(e, byId, rects), e: e, byId: byId, rects: rects };
  }

  it("㉓ 挡在中间的节点会被绕开：路径不穿任何节点，且选更短的一侧", () => {
    const ctx = doc([
      { tag: "A", x: 100, y: 100, w: 100, h: 50 },
      { tag: "B", x: 600, y: 100, w: 100, h: 50 },
      { tag: "C", x: 300, y: 90, w: 100, h: 80 }
    ], [["A", "B"]]);
    const r = edgeD(ctx, "A", "B");
    expect(r.dstr, "路由要有输出").toBeTruthy();
    const others = r.rects.filter(function (m) { return m.id !== r.e.from && m.id !== r.e.to; });
    expect(_tCrossesAny(r.dstr, others), "A→B 不得穿过 C；实收 d=[" + r.dstr + "]").toBe(false);
    /* 上绕 45+200+45+200=490，下绕 55+200+55+200=510 ⇒ 同层里取最短的那条 */
    expect(r.dstr).toContain("L200 80");
    expect(r.dstr, "不该同时出现两侧绕行").not.toContain("L200 180");
    /* 绕行段必须**离边框留白**（gutter = 一个网格）：贴着边框画技术上"没穿过"，视觉上仍是压在卡片上。 */
    expect(Math.min.apply(null, _tParsePoly(r.dstr).map(function (p) { return p.y; })),
      "C 顶边 y=90 ⇒ 绕行沿最多到 80（留 10px 白）；实收 " + r.dstr).toBe(80);
    /* 绕行串必须是干净的折线（重合点与共线中间点都该被 _dcSimplify 去掉）。
       注意：这条只判**绕行后**的串 —— 默认三段那支刻意不化简，以保证与从前逐字节相同。 */
    const pts = _tParsePoly(r.dstr);
    for (let i = 0; i + 1 < pts.length; i++) {
      expect(pts[i].x === pts[i + 1].x && pts[i].y === pts[i + 1].y,
        "绕行路径不该有重合点（第 " + i + " 段；实收 " + r.dstr + "）").toBe(false);
    }
    for (let i = 1; i + 1 < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      expect((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y),
        "绕行路径不该留共线中间点（第 " + i + " 个点；实收 " + r.dstr + "）").toBe(false);
    }
  });

  it("㉓b 反向对照：没东西挡路时输出与「未绕障」逐字节相同（①不额外花钱，㉓ 的红也只可能来自绕障）", () => {
    const ctx = doc([
      { tag: "A", x: 100, y: 100, w: 100, h: 50 },
      { tag: "B", x: 600, y: 100, w: 100, h: 50 },
      { tag: "C", x: 300, y: 500, w: 100, h: 80 }   // 同样的节点，挪到走廊以外
    ], [["A", "B"]]);
    const r = edgeD(ctx, "A", "B");
    expect(r.dstr).toBe("M200 125 L400 125 L400 125 L600 125");
  });

  it("㉔ 竖段被撞时走左右（不套用横段那支）", () => {
    const ctx = doc([
      { tag: "A", x: 100, y: 100, w: 100, h: 50 },
      { tag: "B", x: 100, y: 600, w: 100, h: 50 },
      { tag: "C", x: 110, y: 300, w: 80, h: 60 }
    ], [["A", "B"]]);
    const r = edgeD(ctx, "A", "B");
    const others = r.rects.filter(function (m) { return m.id !== r.e.from && m.id !== r.e.to; });
    expect(_tCrossesAny(r.dstr, others), "A→B 不得穿过 C；实收 d=[" + r.dstr + "]").toBe(false);
    expect(r.dstr, "竖段该改成左右绕：出现横向偏移段").toMatch(/L\d+ 150 L\d+ 600/);
  });

  it("㉕ 绕不过时退回默认三段（有界搜索用尽 ⇒ 不比从前差、不抛错、不改形状）", () => {
    const ctx = doc([
      { tag: "A", x: 100, y: 100, w: 80, h: 40 },
      { tag: "B", x: 600, y: 100, w: 80, h: 40 },
      { tag: "墙", x: 0, y: 0, w: 1200, h: 800 }      // 整幅都被盖住：任何绕法都在墙里
    ], [["A", "B"]]);
    const r = edgeD(ctx, "A", "B");
    expect(r.dstr).toBe("M180 120 L390 120 L390 120 L600 120");
  });

  it("㉕b 障碍集必须排除本条连线的两端：两块重叠的节点自己不算挡路", () => {
    const ctx = doc([
      { tag: "A", x: 100, y: 100, w: 100, h: 100 },
      { tag: "B", x: 150, y: 150, w: 100, h: 100 }   // 合法状态：用户把 B 直接压在 A 上
    ], [["A", "B"]]);
    const r = edgeD(ctx, "A", "B");
    /* 若端点没排除，A 自己就会被判成障碍（首段从 A 右边出发、沿 y=150 穿过 A 的内部），
       路由会去绕"自己的两端" —— 那是比不绕障更糟的形状。 */
    expect(r.dstr, "两端节点必须被排除在障碍集外，否则这条边会被自己触发的绕障改写").toBe(
      "M200 150 L175 150 L175 200 L150 200");
  });

  it("㉖ label 落在**路由后的**折线上：等距中点真的在这条 path 上", () => {
    const ctx = doc([
      { tag: "A", x: 100, y: 100, w: 100, h: 50 },
      { tag: "B", x: 600, y: 100, w: 100, h: 50 },
      { tag: "C", x: 300, y: 90, w: 100, h: 80 }
    ], [["A", "B"]]);
    const w = ctx.win;
    w.dcSetEdgeLabel(w.dcActive().edges[0].id, "是");
    const r = edgeD(ctx, "A", "B");
    const mid = w._dcEdgeMid(r.e, r.byId, r.rects);
    const pts = _tParsePoly(r.dstr);
    let total = 0;
    pts.forEach(function (p, i) { if (i) total += Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y); });
    /* 点到折线的距离为 0（±1px 取整容差）：label 不能飘在空白里 */
    const dist = Math.min.apply(null, pts.slice(0, -1).map(function (p, i) {
      const q = pts[i + 1];
      if (p.x === q.x) return (mid.y >= Math.min(p.y, q.y) - 1 && mid.y <= Math.max(p.y, q.y) + 1) ? Math.abs(mid.x - p.x) : 1e9;
      return (mid.x >= Math.min(p.x, q.x) - 1 && mid.x <= Math.max(p.x, q.x) + 1) ? Math.abs(mid.y - p.y) : 1e9;
    }));
    expect(dist, "mid 必须在折线上（总长 " + total + "，实收 " + JSON.stringify(mid) + " / " + r.dstr + "）").toBeLessThanOrEqual(1);
    expect(mid.x, "等距中点应在中间那条绕行段上").toBeGreaterThanOrEqual(200);
    expect(mid.y, "绕到上方的那段 y=80，不该还留在原走廊 125").toBeLessThan(120);
    /* 接线判据：函数算得对 ≠ 渲染用了它。标签元素必须落在同一个 mid 上，
       否则绕障后丝线走了上边、标签还飘在原走廊（用户看到的是"标签脱离连线"）。 */
    w.renderDrawWorkspace();
    w._dcRenderWorkspace();
    const lbl = w.document.querySelector("#drawCanvasHost text.dedge-label");
    expect(lbl, "有 label 就要渲染出标签元素").toBeTruthy();
    expect([Number(lbl.getAttribute("x")), Number(lbl.getAttribute("y"))],
      "标签落点必须等于 _dcEdgeMid 的返回值").toEqual([mid.x, mid.y]);
  });

  it("㉗ 有界性：200 节点拥挤图 + 一条横穿全图的长边 ⇒ 段数不超预算、两次渲染逐字节相同", () => {
    const w = boot();
    w.dcCreate("压力图");
    const ids = [];
    for (let i = 0; i < 200; i++) ids.push(w.dcAddNode("rect", (i % 20) * 70, Math.floor(i / 20) * 90, 60, 40, "n" + i).id);
    w.dcAddEdge(ids[0], ids[199]);
    const d = w.dcActive();
    const byId = {}; d.nodes.forEach(function (n) { byId[n.id] = n; });
    const rects = d.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }; });
    const one = w._dcEdgePath(d.edges[0], byId, rects);
    const segs = _tParsePoly(one).length;
    expect(segs, "折线点数 = 搜索深度的上界（深度 3 ⇒ 最多 4 + 2×3 = 10）").toBeLessThanOrEqual(10);
    expect(w._dcEdgePath(d.edges[0], byId, rects), "纯几何：同一输入两次必须相同").toBe(one);
    const out1 = w._dcRenderSvg();
    expect(w._dcRenderSvg()).toBe(out1);
  });

  it("㉘ 绕障段接在竖直段之后 ⇒ 共线拐点必须化简掉（不留「下了又折回」的竖直小辫）", () => {
    /* 这个形状是专门给 _dcSimplify 造的：被撞的是**三段折线的最后一段（横）**，而它的起点前面正好
       是一段竖 ⇒ splice 会在同一 x 上排三个点。不化简就多一段"从 125 走到 175 再退回 150"的废线，
       字节变长、视觉上是一根扎在卡片边上的小辫。N5 变异（化简直接 return）第一轮就是 42 全绿 ——
       说明前面 7 条都构造不出这个形状，不是化简没用。
       化简在几何上安全：合并不是删段而是把 a→b→c（三点共线）收成 a→c，后者永远是前两者的子集，
       所以不可能因为化简而新撞进某个节点。 */
    const ctx = doc([
      { tag: "A", x: 100, y: 100, w: 100, h: 50 },
      { tag: "B", x: 600, y: 150, w: 100, h: 50 },
      { tag: "C", x: 450, y: 160, w: 100, h: 60 }     // 只挡最后那段横线（y=175），不挡 x=400 的竖线
    ], [["A", "B"]]);
    const r = edgeD(ctx, "A", "B");
    const others = r.rects.filter(function (m) { return m.id !== r.e.from && m.id !== r.e.to; });
    expect(_tCrossesAny(r.dstr, others), "A→B 不得穿过 C；实收 d=[" + r.dstr + "]").toBe(false);
    expect(r.dstr, "上绕后三段共线的拐点必须已被化简").toBe("M200 125 L400 125 L400 150 L600 150 L600 175");
    expect(_tParsePoly(r.dstr).length, "点数字面：不化简是 6 个").toBe(5);
  });
});
