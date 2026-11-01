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
