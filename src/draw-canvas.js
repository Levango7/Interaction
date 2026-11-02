// ===== Draw Layer (画布层·Design 模式画布编辑器) =====
/* ---------- 画布编辑器（画图能力 Phase B · docs/design-mode-phase-b.md）----------
 * draw.io 式四件套：放置/拖动/8向缩放、正交连线、双击文字、快照 undo/redo。
 * 设计决定：
 *  · 数据模型沿用 _dgmSvgHtml（render-overview）的 {nodes,edges} 形状并扩展（type/text）；
 *  · 渲染 = 数据全量重绘为 SVG（同 renderChat 口径），交互 = pointer 事件 + DOM 命中测试；
 *  · undo = 快照栈（cap 50，JSON 序列化），与 data-rw 的任务撤销（_pushUndo）**互不复用**——
 *    命名刻意加 dc 前缀避免撞车；
 *  · 持久化 = wb_agent_diagrams（文档数组，cap 50）+ wb_agent_diagram_active；
 *  · 导出 = Phase A 助手（_svgToPngBlob/_downloadBlob/_svgExportBar）零新代码；
 *  · Design 模式 = 第三布局预设：.body.design-mode（CSS 见 agent-workbench.html），
 *    中 = #drawStage（工具条+画布），左 = #diagramDock（图列表），右 = 既有 task-rail。
 *  · 安全：节点文字 esc() 后入 SVG；画布自身不接 sanitizeHtml（全量重绘、无可注入面）——
 *    embed 底稿节点（AI 桥）的内容在**入库前**已过 sanitizeSvg。 */

/* ---------- 存储 ----------
 * ⚠️ 常量名全部加 DC_ 前缀：render-overview.js 已有 const DIAGRAM_KEY（依赖图存储），
 * 拼回后同一作用域 —— 重复 const 声明 = 整个脚本 SyntaxError（079135a CI 实测全挂）。 */
const DC_DIAGRAM_KEY = PREFIX + "diagrams";
const DC_DIAGRAM_ACTIVE_KEY = PREFIX + "diagram_active";
const DIAGRAM_MAX = 50;
const DC_NODE_MAX = 200;
const DC_SNAP = 10;
const DC_UNDO_CAP = 50;
/* 字节上限（localStorage 总配额约 5MB，与其他键共享）：单图 128KB / 全部图 1MB。
   条数上限（50 图 / 200 节点）管不住体积——200 个节点各带长文本就能轻松吃满配额。 */
const DC_DOC_BYTES_MAX = 128 * 1024;
const DC_ALL_BYTES_MAX = 1024 * 1024;
const DC_TEXT_MAX = 80;

function dcList() {
  const a = load(DC_DIAGRAM_KEY, []);
  return Array.isArray(a) ? a : [];
}
function dcById(id) {
  return dcList().find(function (d) { return d && d.id === id; }) || null;
}
function dcActiveId() { return load(DC_DIAGRAM_ACTIVE_KEY, ""); }
function dcActive() { return dcById(dcActiveId()); }
function _dcBytes(v) { try { return JSON.stringify(v).length; } catch (_e) { return -1; } }
/** 写列表并接 save() 返回值：save 失败只 toast+return false、**永不抛**，
 *  不接返回值 = 静默丢图（data-links「假防线」同款缺陷）。返回是否落盘成功。 */
function _dcSaveList(list) {
  const cut = list.slice(0, DIAGRAM_MAX);
  if (_dcBytes(cut) > DC_ALL_BYTES_MAX) {
    toast(t("draw.quotaAll", "图总量超出本地存储预算（1MB），请删掉一些图"), "warn");
    return false;
  }
  return save(DC_DIAGRAM_KEY, cut) === true;
}
function _dcSaveDoc(doc) {
  if (!doc) return false;
  doc.updatedAt = Date.now();
  if (_dcBytes(doc) > DC_DOC_BYTES_MAX) {
    toast(t("draw.quotaDoc", "单图体积超出上限（128KB），请精简内容"), "warn");
    return false;
  }
  const list = dcList();
  const i = list.findIndex(function (d) { return d && d.id === doc.id; });
  if (i >= 0) list[i] = doc; else list.unshift(doc);
  return _dcSaveList(list);
}
function dcCreate(title) {
  const d = { id: uid(), title: String(title || t("draw.doc.default", "未命名图")), updatedAt: Date.now(), nodes: [], edges: [] };
  const list = dcList();
  list.unshift(d);
  if (list.length > DIAGRAM_MAX) { list.length = DIAGRAM_MAX; }
  _dcSaveList(list);
  save(DC_DIAGRAM_ACTIVE_KEY, d.id);
  return d;
}
function dcDelete(id) {
  const list = dcList().filter(function (d) { return d && d.id !== id; });
  _dcSaveList(list);
  if (dcActiveId() === id) { save(DC_DIAGRAM_ACTIVE_KEY, list.length ? list[0].id : ""); _dcSel = null; }
  if (typeof _dcRenderDocDock === "function") _dcRenderDocDock();
  _dcRenderWorkspace();
  /* 回执：删除是本机同步写盘，落完才报"已删除"（不是先报成功再看结果）。
     字典里这条键此前是死键 —— 消息写了却没接进流程。 */
  toast(t("draw.doc.deleted", "图已删除"), "ok");
}
function dcRename(id, title) {
  const d = dcById(id); if (!d) return;
  d.title = String(title || d.title); _dcSaveDoc(d);
  if (typeof _dcRenderDocDock === "function") _dcRenderDocDock();
}
function dcSwitch(id) {
  if (!dcById(id)) return;
  save(DC_DIAGRAM_ACTIVE_KEY, id);
  _dcUndoStack.length = 0; _dcRedoStack.length = 0;
  _dcSel = null; _dcConnectFrom = null;
  if (typeof _dcRenderDocDock === "function") _dcRenderDocDock();
  _dcRenderWorkspace();
}

/* ---------- 模型操作（全部"先压快照再变更"） ---------- */
function _dcSnapV(v) { return Math.round(Number(v) / DC_SNAP) * DC_SNAP; }
let _dcUndoStack = [];
let _dcRedoStack = [];
function _dcPushUndo(doc) {
  _dcUndoStack.push(JSON.stringify({ nodes: doc.nodes, edges: doc.edges }));
  if (_dcUndoStack.length > DC_UNDO_CAP) _dcUndoStack.shift();
  _dcRedoStack.length = 0;
}
function dcUndo() {
  const d = dcActive(); if (!d || !_dcUndoStack.length) return false;
  _dcRedoStack.push(JSON.stringify({ nodes: d.nodes, edges: d.edges }));
  const st = JSON.parse(_dcUndoStack.pop());
  d.nodes = st.nodes; d.edges = st.edges;
  if (_dcSel && !d.nodes.some(function (n) { return n.id === _dcSel; })) _dcSel = null;
  _dcSaveDoc(d); _dcRenderWorkspace();
  return true;
}
function dcRedo() {
  const d = dcActive(); if (!d || !_dcRedoStack.length) return false;
  _dcUndoStack.push(JSON.stringify({ nodes: d.nodes, edges: d.edges }));
  const st = JSON.parse(_dcRedoStack.pop());
  d.nodes = st.nodes; d.edges = st.edges;
  _dcSaveDoc(d); _dcRenderWorkspace();
  return true;
}
function dcAddNode(type, x, y, w, h, text) {
  const d = dcActive(); if (!d) return null;
  if (d.nodes.length >= DC_NODE_MAX) { toast(t("draw.nodeMax", "单图节点已达上限"), "warn"); return null; }
  _dcPushUndo(d);
  const n = {
    id: uid(),
    type: ["rect", "round", "ellipse", "diamond"].indexOf(type) >= 0 ? type : "rect",
    x: _dcSnapV(x), y: _dcSnapV(y),
    w: Math.max(40, _dcSnapV(w || 140)), h: Math.max(30, _dcSnapV(h || 56)),
    text: String(text || "").slice(0, DC_TEXT_MAX)
  };
  d.nodes.push(n); _dcSaveDoc(d); _dcRenderWorkspace();
  return n;
}
function dcMoveNode(id, x, y) {
  const d = dcActive(); if (!d) return;
  const n = d.nodes.find(function (m) { return m.id === id; }); if (!n) return;
  n.x = _dcSnapV(x); n.y = _dcSnapV(y); _dcSaveDoc(d);
}
function dcResizeNode(id, x, y, w, h) {
  const d = dcActive(); if (!d) return;
  const n = d.nodes.find(function (m) { return m.id === id; }); if (!n) return;
  n.x = _dcSnapV(x); n.y = _dcSnapV(y);
  n.w = Math.max(40, _dcSnapV(w)); n.h = Math.max(30, _dcSnapV(h));
  _dcSaveDoc(d);
}
function dcSetNodeText(id, text) {
  const d = dcActive(); if (!d) return;
  const n = d.nodes.find(function (m) { return m.id === id; }); if (!n) return;
  if (n.type === "embed") return;      // 与双击同判据：底稿没有文字维度（公开入口也得守住，别只拦 UI）
  const next = String(text || "").slice(0, DC_TEXT_MAX);
  if (String(n.text || "") === next) return;
  _dcPushUndo(d);
  n.text = next; _dcSaveDoc(d); _dcRenderWorkspace();
}
/* ---------- AI 桥：把聊天里的 SVG 产物当**底稿**嵌进当前图（Phase B §七 · 唯一未落地条目） ----------
 * MVP 口径照设计文档，不在这儿扩大：embed 节点只做「整体移动 / 缩放 / 删除」，
 * **不做** SVG→图元自动识别（那是 Phase B2）。两条已知边界如实记：
 *  · 底稿内的 id（marker / gradient / clipPath 等）与画布自身、与别的底稿**共享同一文档 id 空间**，
 *    同名会互相覆盖 —— 表现为箭头/渐变串色，不动数据；id 前缀隔离留 Phase C。
 *  · `inner` 是 sanitizeSvg 白名单重建后的串（入库前已过），渲染时按已消毒串直插，与聊天卡同信任级。 */
const DC_EMBED_W = 320, DC_EMBED_H = 200;   // 视野里的兜底占位框，实际尺寸按 viewBox 宽高比换算

/** 抽出可嵌入的底稿载荷：消毒 → 取定标框（viewBox，退化到 width/height）→ 序列化根的子节点。
 *  定不了标就返回 null（宁可拒，不静默塞一个会失真的 0×0）。 */
function dcEmbedPayload(svgStr) {
  const clean = sanitizeSvg(String(svgStr || ""));
  if (!clean) return null;
  let doc = null;
  try { doc = new DOMParser().parseFromString(clean, "image/svg+xml"); }
  catch (e) { try { if (typeof pushDiag === "function") pushDiag("warn", "embed parse failed: " + ((e && e.message) || e), { where: "dcEmbedPayload" }); } catch (_e2) { /* 诊断不可用不影响拒绝 */ } return null; }
  const root = doc && doc.documentElement;
  if (!root || String(root.nodeName || "").toLowerCase() !== "svg") return null;
  const vb = String(root.getAttribute("viewBox") || "").trim();
  const w = parseFloat(root.getAttribute("width")), h = parseFloat(root.getAttribute("height"));
  let box = vb;
  if (!box && isFinite(w) && isFinite(h) && w > 0 && h > 0) box = "0 0 " + w + " " + h;
  if (!box) return null;
  let inner = "";
  try {
    const ser = new XMLSerializer();
    inner = Array.prototype.slice.call(root.childNodes || []).map(function (k) { return ser.serializeToString(k); }).join("");
  } catch (e) { try { if (typeof pushDiag === "function") pushDiag("warn", "embed serialize failed: " + ((e && e.message) || e), { where: "dcEmbedPayload" }); } catch (_e2) { /* 同上 */ } return null; }
  if (!String(inner).trim()) return null;
  return { vb: box, inner: inner };
}
/** 底稿在画布上的初始尺寸：按定标框宽高比塞进 DC_EMBED_W×DC_EMBED_H，两头都不超。 */
function _dcEmbedSize(vb) {
  const p = String(vb || "").split(/[\s,]+/).map(Number);
  if (p.length >= 4 && isFinite(p[2]) && isFinite(p[3]) && p[2] > 0 && p[3] > 0) {
    const ar = p[2] / p[3];
    let w = DC_EMBED_W, hh = Math.round(w / ar);
    if (hh > DC_EMBED_H) { hh = DC_EMBED_H; w = Math.round(hh * ar); }
    return { w: Math.max(40, w), h: Math.max(30, hh) };
  }
  return { w: DC_EMBED_W, h: DC_EMBED_H };
}
/** 加底稿节点。**预算在改动之前算**：超了就不碰文档、不压 undo —— 不留半条数据。 */
function dcAddEmbedNode(payload, x, y, w, h) {
  const d = dcActive(); if (!d || !payload) return null;
  if (d.nodes.length >= DC_NODE_MAX) { toast(t("draw.nodeMax", "单图节点已达上限"), "warn"); return null; }
  const n = {
    id: uid(), type: "embed",
    x: _dcSnapV(x), y: _dcSnapV(y),
    w: Math.max(40, _dcSnapV(w)), h: Math.max(30, _dcSnapV(h)),
    vb: String(payload.vb), inner: String(payload.inner), text: ""
  };
  const probe = { id: d.id, title: d.title, updatedAt: d.updatedAt, nodes: d.nodes.concat([n]), edges: d.edges };
  if (_dcBytes(probe) > DC_DOC_BYTES_MAX) { toast(t("draw.embed.tooBig", "底稿超出单图 128KB 预算，没放进画布"), "warn"); return null; }
  _dcPushUndo(d);
  d.nodes.push(n);
  if (!_dcSaveDoc(d)) {          // save 只 toast 不抛：接返回值回滚，否则内存有节点、盘上没有（假防线）
    d.nodes.pop(); _dcUndoStack.pop();
    return null;
  }
  _dcRenderWorkspace();
  return n;
}
function dcDeleteSelected() {
  const d = dcActive(); if (!d || !_dcSel) return false;
  _dcPushUndo(d);
  if (_dcSel.kind === "node") {
    d.nodes = d.nodes.filter(function (n) { return n.id !== _dcSel.id; });
    d.edges = d.edges.filter(function (e) { return e.from !== _dcSel.id && e.to !== _dcSel.id; });
  } else {
    d.edges = d.edges.filter(function (e) { return e.id !== _dcSel.id; });
  }
  _dcSel = null; _dcSaveDoc(d); _dcRenderWorkspace();
  return true;
}
function dcAddEdge(from, to) {
  const d = dcActive(); if (!d || !from || !to || from === to) return null;
  if (d.edges.some(function (e) { return e.from === from && e.to === to; })) return null;
  if (!d.nodes.some(function (n) { return n.id === from; }) || !d.nodes.some(function (n) { return n.id === to; })) return null;
  _dcPushUndo(d);
  const e = { id: uid(), from: from, to: to, label: "" };
  d.edges.push(e); _dcSaveDoc(d); _dcRenderWorkspace();
  _dcSel = { kind: "edge", id: e.id };
  return e;
}
function dcSetEdgeLabel(id, label) {
  const d = dcActive(); if (!d) return false;
  const e = d.edges.find(function (m) { return m.id === id; }); if (!e) return false;
  const next = String(label || "").slice(0, DC_TEXT_MAX);
  if (String(e.label || "") === next) return true;
  _dcPushUndo(d);
  e.label = next; _dcSaveDoc(d); _dcRenderWorkspace();
  return true;
}
/** 选中态设置（公开入口）：测试与属性面板都走这里——直接给 win._dcSel 赋值**够不到**
 *  模块级 let 绑定（声明式作用域遮蔽 window 属性，jsdom 实测选中"丢失"）。 */
function dcSelect(kind, id) {
  _dcSel = kind ? { kind: kind, id: id } : null;
  _dcRenderWorkspace();
  if (typeof _dcRenderProps === "function") _dcRenderProps();
}

/* ---------- 渲染 ---------- */
let _dcSel = null;               // {kind:"node"|"edge", id} | null
let _dcConnectFrom = null;       // 连线模式：起点节点 id
let _dcZoom = 1;                 // 1 = 1600x1000 世界
let _dcTool = "select";          // select | connect
let _dcDrag = null;              // {mode:"move"|"resize"|"connect", ...}
let _dcLastTap = null;           // {id:"n:xxx"|"e:xxx", t:ms} 双击时间窗判据（见 _dcOnDown）
const DC_VIEW_W = 1600, DC_VIEW_H = 1000;

function _dcShapeSvg(n, selected) {
  const stroke = selected ? "var(--accent)" : "var(--line)";
  const fill = "var(--panel)";
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  let shape = "";
  if (n.type === "embed") {
    /* 底稿 = 嵌套 <svg>（自带定标框 → 缩放跟随节点尺寸）+ 虚线框 + 透明热区。
       热区在最上层，否则点到底稿里的空白处会掉到画布背景上（变成"取消选择"）。 */
    shape = '<svg x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" viewBox="' + esc(String(n.vb || "")) + '" preserveAspectRatio="xMidYMid meet">' + String(n.inner || "") + "</svg>"
      + '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" fill="none" stroke="' + stroke + '" stroke-width="' + (selected ? 2.5 : 1.5) + '" stroke-dasharray="6 4"/>'
      + '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" fill="transparent"/>';
  } else if (n.type === "ellipse") {
    shape = '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + n.w / 2 + '" ry="' + n.h / 2 + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (selected ? 2.5 : 1.5) + '"/>';
  } else if (n.type === "diamond") {
    shape = '<path d="M' + cx + " " + n.y + " L" + (n.x + n.w) + " " + cy + " L" + cx + " " + (n.y + n.h) + " L" + n.x + " " + cy + ' Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (selected ? 2.5 : 1.5) + '"/>';
  } else {
    const rx = n.type === "round" ? 10 : 2;
    shape = '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="' + rx + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (selected ? 2.5 : 1.5) + '"/>';
  }
  const label = esc(String(n.text || ""));
  const text = label ? '<text class="dnode-text" x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central">' + label + "</text>" : "";
  let handles = "";
  if (selected) {
    const pts = [[n.x, n.y, "nw"], [cx, n.y, "n"], [n.x + n.w, n.y, "ne"], [n.x + n.w, cy, "e"], [n.x + n.w, n.y + n.h, "se"], [cx, n.y + n.h, "s"], [n.x, n.y + n.h, "sw"], [n.x, cy, "w"]];
    handles = pts.map(function (p) {
      return '<rect class="dhandle" data-h="' + p[2] + '" x="' + (p[0] - 5) + '" y="' + (p[1] - 5) + '" width="10" height="10" rx="2" fill="var(--accent)" stroke="var(--panel)" stroke-width="1.5"/>';
    }).join("");
  }
  return '<g class="dnode" data-node-id="' + n.id + '" style="cursor:' + (_dcTool === "connect" ? "crosshair" : "move") + '">' + shape + text + handles + "</g>";
}
function _dcAnchor(a, b) {
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
  const dx = bcx - acx, dy = bcy - acy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { x: a.x + a.w, y: acy } : { x: a.x, y: acy };
  return dy >= 0 ? { x: acx, y: a.y + a.h } : { x: acx, y: a.y };
}
function _dcEdgePath(e, byId) {
  const a = byId[e.from], b = byId[e.to];
  if (!a || !b) return "";
  const s = _dcAnchor(a, b), t = _dcAnchor(b, a);
  const mx = (s.x + t.x) / 2;
  return "M" + s.x + " " + s.y + " L" + mx + " " + s.y + " L" + mx + " " + t.y + " L" + t.x + " " + t.y;
}
/** label 落点：三段折线的竖直中段中点（与 _dcEdgePath 同几何，不做绕障）。 */
function _dcEdgeMid(e, byId) {
  const a = byId[e.from], b = byId[e.to];
  if (!a || !b) return null;
  const s = _dcAnchor(a, b), t = _dcAnchor(b, a);
  return { x: Math.round((s.x + t.x) / 2), y: Math.round((s.y + t.y) / 2) };
}
function _dcRenderSvg() {
  const d = dcActive();
  if (!d) return '<svg id="drawSvg"></svg>';
  const byId = {};
  d.nodes.forEach(function (n) { byId[n.id] = n; });
  const vw = Math.round(DC_VIEW_W / _dcZoom), vh = Math.round(DC_VIEW_H / _dcZoom);
  let out = '<svg id="drawSvg" viewBox="0 0 ' + vw + " " + vh + '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;user-select:none;touch-action:none;background:var(--bg,#fff)">'
    + '<defs><marker id="darr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--text)"/></marker></defs>';
  const selEdge = _dcSel && _dcSel.kind === "edge" ? _dcSel.id : "";
  d.edges.forEach(function (e) {
    const p = _dcEdgePath(e, byId);
    if (!p) return;
    const hot = e.id === selEdge;
    out += '<g class="dedge" data-edge-id="' + e.id + '"><path d="' + p + '" fill="none" stroke="' + (hot ? "var(--accent)" : "var(--text)") + '" stroke-width="' + (hot ? 2.5 : 1.5) + '" marker-end="url(#darr)"/>'
      + '<path d="' + p + '" fill="none" stroke="transparent" stroke-width="12" style="cursor:pointer"/></g>';
    if (e.label) {
      const mid = _dcEdgeMid(e, byId);
      if (mid) out += '<text class="dedge-label" x="' + mid.x + '" y="' + mid.y + '" text-anchor="middle" dominant-baseline="middle" pointer-events="none">' + esc(e.label) + "</text>";
    }
  });
  /* 底稿先画、其余后画：embed 的语义是"垫在下面加工"，若按数组顺序后加就盖住手工节点。 */
  const selId = _dcSel && _dcSel.kind === "node" ? _dcSel.id : "";
  d.nodes.forEach(function (n) { if (n.type === "embed") out += _dcShapeSvg(n, n.id === selId); });
  d.nodes.forEach(function (n) { if (n.type !== "embed") out += _dcShapeSvg(n, n.id === selId); });
  if (_dcDrag && _dcDrag.mode === "connect" && _dcDrag.cur) {
    out += '<path d="' + _dcDrag.cur + '" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 4"/>';
  }
  return out + "</svg>";
}
function _dcRenderWorkspace() {
  const host = document.getElementById("drawCanvasHost");
  if (!host) return;
  host.innerHTML = _dcRenderSvg(); // lint-xss-ok: 文字经 esc、模型字段受白名单约束（type 枚举/数值 snap）；embed 的 inner 是 sanitizeSvg 白名单重建后的串（dcEmbedPayload 入库前已消毒）
  _dcBindCanvasEvents();
  if (typeof _dcRenderProps === "function") _dcRenderProps();
}

/* ---------- 交互（pointer + 键盘） ---------- */
function _dcSvgPoint(ev) {
  const svg = document.getElementById("drawSvg");
  if (!svg) return { x: 0, y: 0 };
  try {
    const pt = svg.createSVGPoint ? svg.createSVGPoint() : null;
    if (pt && svg.getScreenCTM) {
      const ctm = svg.getScreenCTM();
      if (ctm) { pt.x = ev.clientX; pt.y = ev.clientY; const p = pt.matrixTransform(ctm.inverse()); return { x: p.x, y: p.y }; }
    }
  } catch (_e) { /* 回退到 naive 换算 */ }
  const r = svg.getBoundingClientRect();
  const vw = Math.round(DC_VIEW_W / _dcZoom);
  return { x: (ev.clientX - r.left) * (vw / Math.max(1, r.width)), y: (ev.clientY - r.top) * (vw / Math.max(1, r.height)) };
}
function _dcHandleResize(dir, n, start, p) {
  const dx = p.x - start.p.x, dy = p.y - start.p.y;
  let x = start.n.x, y = start.n.y, w = start.n.w, h = start.n.h;
  if (dir.indexOf("e") >= 0) w = start.n.w + dx;
  if (dir.indexOf("s") >= 0) h = start.n.h + dy;
  if (dir.indexOf("w") >= 0) { x = start.n.x + dx; w = start.n.w - dx; }
  if (dir.indexOf("n") >= 0) { y = start.n.y + dy; h = start.n.h - dy; }
  if (w < 40) { if (dir.indexOf("w") >= 0) x = start.n.x + start.n.w - 40; w = 40; }
  if (h < 30) { if (dir.indexOf("n") >= 0) y = start.n.y + start.n.h - 30; h = 30; }
  dcResizeNode(n.id, x, y, w, h);
}
function _dcOnDown(ev) {
  if (_uiMode() !== "design") return;
  const handle = ev.target && ev.target.closest ? ev.target.closest(".dhandle") : null;
  const nodeEl = ev.target && ev.target.closest ? ev.target.closest(".dnode") : null;
  const edgeEl = ev.target && ev.target.closest ? ev.target.closest(".dedge") : null;
  const d = dcActive(); if (!d) return;
  /* 2026-11-02 双击修复：真实双击不能依赖 dblclick 事件——本函数下面的分支每次都会
     _dcRenderWorkspace()（把宿主节点整块重写）重建 SVG，按下时命中的元素在
     抬起前已被替换，浏览器因此不合成 click/dblclick，真实用户的双击改名 /
     改连线 label 会完全不可达（线上 v3.7.152 实测确认）。
     判据双轨：detail===2 覆盖真机鼠标（UI 事件层计数）；时间窗覆盖其余情形——
     Chromium 对 CDP/自动化注入的 pointerdown 一律给 detail=0（实测两击皆 0），
     故再用「同一节点或连线、350ms 内第二击」判双击。转交时 DOM 尚未重建，
     节点/连线元素仍可定位；命中双击后清空 _dcLastTap，第三击不会链式再触发。 */
  const _tapId = nodeEl ? "n:" + nodeEl.getAttribute("data-node-id")
    : edgeEl ? "e:" + edgeEl.getAttribute("data-edge-id") : null;
  const _now = Date.now();
  const _last = _dcLastTap; _dcLastTap = null;
  if (ev.detail === 2 || (_tapId && _last && _last.id === _tapId && _now - _last.t < 350)) {
    _dcOnDblClick(ev); return;
  }
  _dcLastTap = _tapId ? { id: _tapId, t: _now } : null;
  const p = _dcSvgPoint(ev);
  if (handle && nodeEl) {
    const id = nodeEl.getAttribute("data-node-id");
    const n = d.nodes.find(function (m) { return m.id === id; }); if (!n) return;
    _dcPushUndo(d);
    _dcDrag = { mode: "resize", id: id, dir: handle.getAttribute("data-h"), start: { p: p, n: { x: n.x, y: n.y, w: n.w, h: n.h } } };
    ev.target.setPointerCapture && ev.target.setPointerCapture(ev.pointerId);
    return;
  }
  if (_dcTool === "connect" && nodeEl) {
    _dcConnectFrom = nodeEl.getAttribute("data-node-id");
    _dcDrag = { mode: "connect", from: _dcConnectFrom, cur: "" };
    return;
  }
  if (nodeEl) {
    const id = nodeEl.getAttribute("data-node-id");
    _dcSel = { kind: "node", id: id };
    _dcPushUndo(d);
    _dcDrag = { mode: "move", id: id, start: p, orig: (d.nodes.find(function (m) { return m.id === id; }) || { x: 0, y: 0 }) };
    _dcRenderWorkspace();
    return;
  }
  if (edgeEl) {
    _dcSel = { kind: "edge", id: edgeEl.getAttribute("data-edge-id") };
    _dcRenderWorkspace();
    return;
  }
  /* 空白：取消选择；connect 模式下取消起点 */
  if (_dcConnectFrom) { _dcConnectFrom = null; _dcDrag = null; }
  _dcSel = null; _dcRenderWorkspace();
}
function _dcOnMove(ev) {
  if (!dcActive()) return;
  const p = _dcSvgPoint(ev);
  if (_dcDrag && _dcDrag.mode === "move") {
    const dx = p.x - _dcDrag.start.x, dy = p.y - _dcDrag.start.y;
    dcMoveNode(_dcDrag.id, _dcDrag.orig.x + dx, _dcDrag.orig.y + dy);
  } else if (_dcDrag && _dcDrag.mode === "resize") {
    const d = dcActive();
    const n = d.nodes.find(function (m) { return m.id === _dcDrag.id; }); if (!n) return;
    _dcHandleResize(_dcDrag.dir, n, _dcDrag.start, p);
  } else if (_dcDrag && _dcDrag.mode === "connect") {
    const d = dcActive();
    const a = d.nodes.find(function (m) { return m.id === _dcDrag.from; }); if (!a) return;
    const fake = { x: p.x - 1, y: p.y - 1, w: 2, h: 2 };
    const s = _dcAnchor(a, fake);
    _dcDrag.cur = "M" + s.x + " " + s.y + " L" + p.x + " " + p.y;
    const host = document.getElementById("drawCanvasHost");
    if (host) host.innerHTML = _dcRenderSvg(); // lint-xss-ok: 全量重绘自受控模型（文字 esc、数值 snap），无外部输入直插
  }
}
function _dcOnUp(ev) {
  if (!dcActive()) { _dcDrag = null; return; }
  const p = _dcSvgPoint(ev);
  if (_dcDrag && _dcDrag.mode === "connect") {
    const tEl = ev.target && ev.target.closest ? ev.target.closest(".dnode") : null;
    const toId = tEl ? tEl.getAttribute("data-node-id") : null;
    if (toId && toId !== _dcDrag.from) dcAddEdge(_dcDrag.from, toId);
    _dcDrag = null; _dcConnectFrom = null; _dcRenderWorkspace();
    return;
  }
  if (_dcDrag && (_dcDrag.mode === "move" || _dcDrag.mode === "resize")) {
    _dcDrag = null; _dcRenderWorkspace();
    if (typeof _dcRenderProps === "function") _dcRenderProps();
    return;
  }
  void p;
}
/** 双击编辑的浮层 input（浮层而非 contenteditable：后者带选区与 XSS 双坑）。
 *  同时服务节点文字与连线 label；maxlength 与模型侧 slice 同界（DC_TEXT_MAX）。 */
function _dcFloatInput(rect, value, onCommit) {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = DC_TEXT_MAX;
  input.value = String(value || "");
  input.style.cssText = "position:fixed;left:" + Math.round(rect.left) + "px;top:" + Math.round(rect.top + rect.height / 2 - 14) + "px;width:" + Math.max(120, Math.round(rect.width)) + "px;font-size:var(--fs-sm);padding:4px 6px;border:2px solid var(--accent);border-radius:6px;z-index:var(--z-max)";
  document.body.appendChild(input);
  input.focus(); input.select();
  let done = false;
  const close = function () { done = true; try { input.parentNode.removeChild(input); } catch (_e) { /* 已移除 */ } };
  const commit = function () {
    if (done) return;
    const v = input.value;
    close();
    onCommit(v);
  };
  input.addEventListener("keydown", function (e2) {
    if (e2.key === "Enter") commit();
    else if (e2.key === "Escape") close();
    e2.stopPropagation();
  });
  input.addEventListener("blur", commit);
  return input;
}
function _dcOnDblClick(ev) {
  if (_uiMode() !== "design") return;
  const d = dcActive(); if (!d) return;
  const nodeEl = ev.target && ev.target.closest ? ev.target.closest(".dnode") : null;
  if (nodeEl) {
    const id = nodeEl.getAttribute("data-node-id");
    const n = d.nodes.find(function (m) { return m.id === id; }); if (!n) return;
    /* 底稿没有"文字"这个维度：整块是一次性的 AI 产物，改文字会误导成能改图元（MVP 明确不做识别）。 */
    if (n.type === "embed") { toast(t("draw.embed.locked", "底稿不支持改文字（可整体移动 / 缩放 / 删除）"), "warn"); return; }
    _dcFloatInput(nodeEl.getBoundingClientRect(), n.text, function (v) { dcSetNodeText(id, v); });
    return;
  }
  /* 连线：双击命中 12px 透明热区（.dedge），编辑 label */
  const edgeEl = ev.target && ev.target.closest ? ev.target.closest(".dedge") : null;
  if (!edgeEl) return;
  const eid = edgeEl.getAttribute("data-edge-id");
  const e = d.edges.find(function (m) { return m.id === eid; }); if (!e) return;
  const byId = {}; d.nodes.forEach(function (n) { byId[n.id] = n; });
  const mid = _dcEdgeMid(e, byId);
  const svg = document.getElementById("drawSvg");
  let rect = { left: 0, top: 0, width: 140, height: 24 };
  if (mid && svg) {
    /* 把 SVG 内的 label 落点换算回视口坐标（getScreenCTM 缺失时退回外接矩形比例换算） */
    try {
      const pt = svg.createSVGPoint(); pt.x = mid.x; pt.y = mid.y;
      const ctm = svg.getScreenCTM();
      const sc = ctm ? pt.matrixTransform(ctm) : null;
      if (sc) rect = { left: sc.x - 70, top: sc.y - 12, width: 140, height: 24 };
    } catch (_e) { /* 保持默认落点 */ }
  }
  _dcFloatInput(rect, e.label, function (v) { dcSetEdgeLabel(eid, v); });
}
function _dcOnKey(ev) {
  if (_uiMode() !== "design") return;
  const tag = String((ev.target && ev.target.tagName) || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return;
  if (ev.key === "Delete" || ev.key === "Backspace") { if (_dcSel) { ev.preventDefault(); dcDeleteSelected(); } return; }
  if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && String(ev.key).toLowerCase() === "z") { ev.preventDefault(); dcUndo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === "y" || (ev.shiftKey && ev.key.toLowerCase() === "z"))) { ev.preventDefault(); dcRedo(); return; }
  if (ev.key === "Escape") { _dcSel = null; _dcConnectFrom = null; _dcDrag = null; _dcRenderWorkspace(); }
}
function _dcBindCanvasEvents() {
  const host = document.getElementById("drawCanvasHost");
  if (!host || host.dataset.dcBound) return;
  host.dataset.dcBound = "1";
  host.addEventListener("pointerdown", _dcOnDown);
  host.addEventListener("pointermove", _dcOnMove);
  host.addEventListener("pointerup", _dcOnUp);
  host.addEventListener("dblclick", _dcOnDblClick);
  document.addEventListener("keydown", _dcOnKey);
}

/* ---------- 工具条 + 工作区 ---------- */
function _dcTbBtn(attr, label, extra) {
  return '<button type="button" class="dc-btn" ' + attr + ' title="' + esc(label) + '">' + (extra || esc(label)) + "</button>";
}
function _dcRenderToolbar() {
  return '<div class="dc-toolbar">'
    + _dcTbBtn('data-dtool="select"', t("draw.tb.select", "选择")) + _dcTbBtn('data-dtool="connect"', t("draw.tb.connect", "连线"))
    + '<span class="dc-sep"></span>'
    + _dcTbBtn('data-dshape="rect"', t("draw.shape.rect", "矩形")) + _dcTbBtn('data-dshape="round"', t("draw.shape.round", "圆角"))
    + _dcTbBtn('data-dshape="ellipse"', t("draw.shape.ellipse", "椭圆")) + _dcTbBtn('data-dshape="diamond"', t("draw.shape.diamond", "菱形"))
    + '<span class="dc-sep"></span>'
    + _dcTbBtn('data-dtool="undo"', t("draw.tb.undo", "撤销")) + _dcTbBtn('data-dtool="redo"', t("draw.tb.redo", "重做"))
    + _dcTbBtn('data-dtool="del"', t("draw.tb.delete", "删除"))
    + '<span class="dc-sep"></span>'
    + _dcTbBtn('data-dtool="zin"', t("draw.tb.zoomIn", "放大")) + _dcTbBtn('data-dtool="zout"', t("draw.tb.zoomOut", "缩小")) + _dcTbBtn('data-dtool="fit"', t("draw.tb.fit", "适应"))
    + '<span class="dc-sep"></span>'
    + _dcTbBtn('data-dtool="exsvg"', t("draw.exportSvg", "导出 SVG")) + _dcTbBtn('data-dtool="expng"', t("draw.exportPng", "导出 PNG"))
    + "</div>";
}
function _dcOnToolbar(ev) {
  const btn = ev.target && ev.target.closest ? ev.target.closest(".dc-btn") : null;
  if (!btn) return;
  const tool = btn.getAttribute("data-dtool");
  const shape = btn.getAttribute("data-dshape");
  const d = dcActive(); if (!d) return;
  if (shape) {
    /* 放置在当前视野中心（viewBox 中心，缩放无关） */
    const vw = Math.round(DC_VIEW_W / _dcZoom), vh = Math.round(DC_VIEW_H / _dcZoom);
    const n = dcAddNode(shape, vw / 2 - 70, vh / 2 - 28, 140, 56, "");
    if (n) { _dcSel = { kind: "node", id: n.id }; _dcRenderWorkspace(); }
    return;
  }
  switch (tool) {
    case "select": _dcTool = "select"; _dcConnectFrom = null; _dcRenderWorkspace(); break;
    case "connect": _dcTool = "connect"; break;
    case "del": dcDeleteSelected(); break;
    case "undo": dcUndo(); break;
    case "redo": dcRedo(); break;
    case "zin": _dcZoom = Math.min(4, _dcZoom * 1.25); _dcRenderWorkspace(); break;
    case "zout": _dcZoom = Math.max(0.25, _dcZoom / 1.25); _dcRenderWorkspace(); break;
    case "fit": _dcZoom = 1; _dcRenderWorkspace(); break;
    case "exsvg": case "expng": {
      const host = document.getElementById("drawCanvasHost");
      const svgEl = host && host.querySelector("svg"); if (!svgEl) return;
      const stamp = _svgStamp();
      if (tool === "exsvg") { _downloadBlob(new Blob([new XMLSerializer().serializeToString(svgEl)], { type: "image/svg+xml;charset=utf-8" }), "diagram-" + stamp + ".svg"); }
      else _svgToPngBlob(new XMLSerializer().serializeToString(svgEl), 2).then(function (b) { if (b) _downloadBlob(b, "diagram-" + stamp + ".png"); else toast(t("draw.exportFail", "导出失败"), "error"); });
      break;
    }
  }
}
/** Design 模式工作区：确保 #drawStage 存在（动态创建，零 DOM 手术），渲染工具条+画布+右侧属性。 */
function renderDrawWorkspace() {
  const stage = document.getElementById("drawStage");
  if (!stage) {
    const mw = document.querySelector(".main-wrap");
    if (!mw) return;
    const el = document.createElement("div");
    el.id = "drawStage";
    mw.appendChild(el);
  }
  const st = document.getElementById("drawStage");
  if (!dcActive()) dcCreate();
  if (!st.dataset.built) {
    st.dataset.built = "1";
    st.innerHTML = _dcRenderToolbar() // lint-xss-ok: 纯静态模板 + i18n 常量，无动态插值
      + '<div id="drawCanvasHost" style="flex:1;min-height:0;overflow:hidden;border:1px solid var(--line);border-radius:var(--radius-sm,6px)"></div>'
      + '<div id="dcProps" style="min-height:28px"></div>';
    st.addEventListener("click", _dcOnToolbar);
    _dcBindCanvasEvents();
  }
  if (!dcActive()) return;
  _dcRenderWorkspace();
  _dcRenderDocDock();
}
/** 图列表停靠（design 网格 1/2 网格项，会话停靠同款交互：单击打开 / ✕ 两击确认删除 / + 新建）。 */
function _dcRenderDocDock() {
  if (_uiMode() !== "design") return;
  let dock = document.getElementById("diagramDock");
  if (!dock) {
    /* 挂点必须是 `.body`：CSS 把本 dock 当作 design 网格的 1/2 网格项
       （grid-column:1;grid-row:2，与 code 模式会话停靠同款）。2026-11-02 前
       误挂 nav.side，网格规则全部失效，dock 落进侧栏文档流底部、1440×900
       首屏只剩约 14px 可见，要滚侧栏才看得见图列表。 */
    const body = document.querySelector(".body");
    if (!body) return;
    dock = document.createElement("div");
    dock.className = "diagram-dock";
    dock.id = "diagramDock";
    body.appendChild(dock);
  }
  const list = dcList();
  const activeId = dcActiveId();
  let html = '<div class="dock-head" style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px 6px">'
    + '<span style="font-weight:600">' + esc(t("draw.doc.list", "图")) + "</span>"
    + '<button type="button" class="dc-new" style="border:none;background:none;cursor:pointer;font-size:var(--fs-base)" title="' + esc(t("draw.doc.new", "新建图")) + '">＋</button></div>';
  html += '<div style="display:flex;flex-direction:column;gap:4px">';
  list.forEach(function (d) {
    const active = d.id === activeId;
    const del = _dcArmDelete === d.id
      ? '<button type="button" class="dc-del" data-del="' + d.id + '" style="color:var(--danger,#d33);border:none;background:none;cursor:pointer" title="' + esc(t("draw.doc.delConfirm", "确认删除")) + '" aria-label="' + esc(t("draw.doc.delConfirm", "确认删除")) + '">' + UI_ICONS.check + "</button>"
      : '<button type="button" class="dc-del" data-del="' + d.id + '" style="border:none;background:none;cursor:pointer;opacity:.55" title="' + esc(t("draw.tb.delete", "删除")) + '" aria-label="' + esc(t("draw.tb.delete", "删除")) + '">' + UI_ICONS.trash + "</button>";
    html += '<div class="ditem' + (active ? " active" : "") + '" data-open="' + d.id + '" style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px;border-radius:8px;cursor:pointer;background:' + (active ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "transparent") + '">'
      + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.title) + "</span>" + del + "</div>";
  });
  html += "</div>";
  dock.innerHTML = html; // lint-xss-ok: 标题经 esc，按钮/样式均为常量模板
  dock.onclick = function (ev) {
    const del = ev.target && ev.target.closest ? ev.target.closest(".dc-del") : null;
    if (del) {
      ev.stopPropagation();
      const id = del.getAttribute("data-del");
      if (_dcArmDelete === id) { _dcArmDelete = null; dcDelete(id); }
      else { _dcArmDelete = id; _dcRenderDocDock(); }
      return;
    }
    const item = ev.target && ev.target.closest ? ev.target.closest("[data-open]") : null;
    if (item) { _dcArmDelete = null; dcSwitch(item.getAttribute("data-open")); return; }
    if (ev.target.closest && ev.target.closest(".dc-new")) { _dcArmDelete = null; dcCreate(); _dcRenderDocDock(); _dcRenderWorkspace(); }
  };
}
let _dcArmDelete = null;
/* 右侧属性面板（MVP：选中节点时显示坐标/尺寸快照；完整属性面板 Phase C） */
function _dcRenderProps() {
  const el = document.getElementById("dcProps"); if (!el) return;
  const d = dcActive(); if (!d) { el.textContent = ""; return; }
  if (_dcSel && _dcSel.kind === "node") {
    const n = d.nodes.find(function (m) { return m.id === _dcSel.id; });
    if (n) { el.textContent = t("draw.props", "选中") + ": " + (n.text || (n.type === "embed" ? t("draw.embed.kind", "AI 底稿") : n.type)) + " · " + n.w + "×" + n.h; return; }
  }
  el.textContent = d.nodes.length + " " + t("draw.propsNodes", "节点") + " · " + d.edges.length + " " + t("draw.propsEdges", "连线");
}

/* ---------- AI 桥的入口与聊天侧委托 ---------- */
/** 把聊天里的一张 SVG 产物作为**底稿**放进当前图，并切到 Design 模式看见它。
 *  @returns 新建的 embed 节点，失败返回 null（失败原因已由 toast 给出，不再重复播报）。 */
function dcOpenEmbed(svgStr, title) {
  const payload = dcEmbedPayload(svgStr);
  if (!payload) { toast(t("draw.embed.badPayload", "这张 SVG 没有可用的 viewBox 或尺寸，放不进画布"), "warn"); return null; }
  /* 先建图再切模式：renderDrawWorkspace 里的 dcCreate() 只会给"未命名图"，
     而这张底稿来自 AI 产物卡，带标题就该用标题命名。 */
  if (!dcActive()) dcCreate(String(title || "").slice(0, DC_TEXT_MAX));
  if (_uiMode() !== "design") {
    try { save(PREFIX + "uimode", "design"); }
    catch (e) { try { if (typeof pushDiag === "function") pushDiag("warn", "uimode persist failed: " + ((e && e.message) || e), { where: "dcOpenEmbed" }); } catch (_e2) { /* 诊断不可用不影响继续 */ } }
    if (typeof applyUIMode === "function") applyUIMode();   // 内含 renderDrawWorkspace()：建 #drawStage + 图列表
  }
  if (!document.getElementById("drawStage")) renderDrawWorkspace();
  const d = dcActive();
  if (!d) { toast(t("draw.embed.noDoc", "画布还没准备好，请再点一次"), "warn"); return null; }
  const size = _dcEmbedSize(payload.vb);
  const vw = Math.round(DC_VIEW_W / _dcZoom), vh = Math.round(DC_VIEW_H / _dcZoom);
  const n = dcAddEmbedNode(payload, vw / 2 - size.w / 2, vh / 2 - size.h / 2, size.w, size.h);
  if (!n) return null;
  _dcSel = { kind: "node", id: n.id };
  _dcRenderWorkspace();
  toast(t("draw.embed.added", "已把这张图作为底稿放进画布"), "ok");
  return n;
}
/** 文档级一次性委托：产物卡上的 [data-canvasembed] → 取卡内 <svg> 交 dcOpenEmbed。
 *  绑在 Draw 层（不在 ai-tools）：① 层界 —— AI 层只出标记不出画布逻辑；
 *  ② 卡片是 innerHTML 重建的，逐个 bind 会被冲掉（与 _bindSvgExport 同一套理由）。 */
function dcBindChatBridge() {
  if (typeof document === "undefined" || typeof window === "undefined" || window.__dcEmbedBound) return;
  window.__dcEmbedBound = true;
  document.addEventListener("click", function (ev) {
    const btn = ev.target && ev.target.closest ? ev.target.closest("[data-canvasembed]") : null;
    if (!btn) return;
    const box = btn.closest("[data-svgexport]");
    const svgEl = box && box.querySelector("svg");
    if (!svgEl) { toast(t("draw.embed.noSvg", "这张卡片里没有可放进画布的图"), "warn"); return; }
    let str = "";
    try { str = new XMLSerializer().serializeToString(svgEl); }
    catch (e) { try { if (typeof pushDiag === "function") pushDiag("warn", "embed serialize failed: " + ((e && e.message) || e), { where: "chatBridge" }); } catch (_e2) { /* 诊断不可用不影响提示 */ } }
    if (!str) { toast(t("draw.embed.noSvg", "这张卡片里没有可放进画布的图"), "warn"); return; }
    dcOpenEmbed(str, btn.getAttribute("data-svgname") || "");
  });
}
dcBindChatBridge();
