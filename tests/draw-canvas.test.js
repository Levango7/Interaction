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
