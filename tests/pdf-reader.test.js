/**
 * pdf-reader.test.js —— PDF 阅读工具做深（v3.7.20）
 * ----------------------------------------------------------------------------
 * 本轮把「PDF 阅读」从 18 行（只能选文件 + iframe）做深为：
 *   控制条（页码 / 缩放 / 适应宽度 / 新窗口打开）· 拖拽导入 · 按文件名记住页码
 *
 * 顺带修掉一个**长期存在的真 bug**：原实现用 sanitizeHtml 注入 iframe，而本项目的
 *   sanitizeHtml 会主动剥离 iframe/object/embed → 该工具自上线起"点了有提示、预览区却始终空白"。
 *   现改为 DOM API 创建（更安全：属性逐个设置，无 HTML 注入面）。
 *
 * 测试策略（踩坑后调整）：
 *   · 纯函数 _pdfUrl 是主断言对象（iframe 内部无法被脚本控制，我们只负责拼对参数）
 *   · DOM 断言改为**直接驱动顶层函数** _pdfOpen/_pdfGo/_pdfSet/_pdfRefresh ——
 *     起初用"构造 File + 派发 change"的方式，发现用例之间会被 app 的异步初始化重渲染踢出工具页，不稳；
 *     直接调函数既稳又真正覆盖被测逻辑。文件选择那条保留为集成检查。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
const openTool = () => { win.openToolStub("off-pdf"); };
const frameSrc = () => {
  const f = win.document.querySelector("#pdfViewWrap iframe");
  return f ? f.getAttribute("src") : null;
};

beforeEach(() => {
  win = loadApp();
  /* jsdom 不实现 URL.createObjectURL —— 打桩（被测代码只把它当"给 iframe 用的地址"） */
  if (typeof win.URL.createObjectURL !== "function") win.URL.createObjectURL = () => "blob:jsdom-fake-pdf";
  if (typeof win.URL.revokeObjectURL !== "function") win.URL.revokeObjectURL = () => {};
});

describe("纯函数 _pdfUrl（拼 PDF 打开参数）", () => {
  it("默认：page=1 + zoom=1.00", () => {
    expect(win._pdfUrl("blob:x", { page: 1, zoom: 1 })).toBe("blob:x#page=1&zoom=1.00");
  });
  it("页码：正常值与非法值（0 / NaN → 至少 1 页）", () => {
    expect(win._pdfUrl("blob:x", { page: 7, zoom: 1 })).toContain("page=7");
    expect(win._pdfUrl("blob:x", { page: 0, zoom: 1 })).toContain("page=1");
    expect(win._pdfUrl("blob:x", { page: NaN, zoom: 1 })).toContain("page=1");
  });
  it("缩放：保留两位小数", () => {
    expect(win._pdfUrl("blob:x", { page: 1, zoom: 1.5 })).toContain("zoom=1.50");
    expect(win._pdfUrl("blob:x", { page: 1, zoom: 0.75 })).toContain("zoom=0.75");
  });
  it("适应宽度：用 view=FitH 取代 zoom（两者互斥）", () => {
    const u = win._pdfUrl("blob:x", { page: 3, zoom: 2, fit: true });
    expect(u).toContain("view=FitH");
    expect(u).not.toContain("zoom=");
  });
  it("地址已带 fragment：只保留一份 #（避免两个 # 让参数失效）", () => {
    const u = win._pdfUrl("blob:x#page=9", { page: 2, zoom: 1 });
    expect(u.split("#").length).toBe(2);
    expect(u).toContain("page=2");
    expect(u).not.toContain("page=9");
  });
  it("空地址返回空串（不产生 '#page=1' 这种半成品）", () => {
    expect(win._pdfUrl("", { page: 1, zoom: 1 })).toBe("");
  });
});

describe("状态：只持久化名字/页码/缩放，不持久化 blob URL", () => {
  it("_pdfOpen 后 localStorage 里没有 url 字段（blob URL 刷新即失效，落盘会变死链）", () => {
    openTool();
    win._pdfOpen("sample.pdf", "blob:abc");
    const raw = win.localStorage.getItem(win.__test.PREFIX + "pdf_reader");
    expect(raw).toBeTruthy();
    const s = JSON.parse(raw);
    expect(Object.keys(s).sort()).toEqual(["fit", "name", "page", "zoom"]);
    expect(s.url).toBeUndefined();
  });
});

describe("DOM：控制条与 iframe（直接驱动顶层函数）", () => {
  it("打开工具页后出现拖拽区与文件输入", () => {
    openTool();
    expect(win.document.querySelector("#pdfDrop")).toBeTruthy();
    expect(win.document.querySelector("#pdfFile")).toBeTruthy();
  });

  it("未选文件时显示空态提示，不挂 iframe", () => {
    openTool();
    win.localStorage.removeItem(win.__test.PREFIX + "pdf_reader");
    win._pdfRefresh();
    expect(win.document.querySelector("#pdfEmpty").textContent.length).toBeGreaterThan(0);
    expect(frameSrc()).toBeNull();
  });

  it("_pdfOpen 后：控制条出现，iframe 真实挂在 DOM 上（旧实现被 sanitizeHtml 剥掉）", () => {
    openTool();
    win._pdfOpen("sample.pdf", "blob:abc");
    expect(win.document.querySelector("#pdfPrev")).toBeTruthy();
    expect(win.document.querySelector("#pdfNext")).toBeTruthy();
    expect(win.document.querySelector("#pdfFit")).toBeTruthy();
    expect(win.document.querySelector("#pdfZoom")).toBeTruthy();
    const src = frameSrc();
    expect(src, "iframe 必须在 DOM 上").toBeTruthy();
    expect(src).toContain("#page=1");
    expect(src).toContain("zoom=1.00");
    expect(src.split("#").length).toBe(2);
  });

  it("翻页 / 缩放 / 适应宽度都会重建 iframe 的 src", () => {
    openTool();
    win._pdfOpen("sample.pdf", "blob:abc");
    win._pdfGo(2);
    expect(frameSrc()).toContain("page=2");
    expect(win.document.querySelector("#pdfPage").value).toBe("2");
    win._pdfSet({ zoom: 1.5 });
    expect(frameSrc()).toContain("zoom=1.50");
    win._pdfSet({ fit: true });
    expect(frameSrc()).toContain("view=FitH");
    expect(frameSrc()).not.toContain("zoom=");
  });

  it("页码下限：_pdfGo(0) 收敛到 1（不产生 page=0）", () => {
    openTool();
    win._pdfOpen("sample.pdf", "blob:abc");
    win._pdfGo(0);
    expect(frameSrc()).toContain("page=1");
  });

  it("换文件时页码回到 1（不沿用上一个文件的页码）", () => {
    openTool();
    win._pdfOpen("a.pdf", "blob:a");
    win._pdfGo(9);
    expect(frameSrc()).toContain("page=9");
    win._pdfOpen("b.pdf", "blob:b");
    expect(frameSrc()).toContain("page=1");
  });

  it("集成：文件输入 change 事件能挂上 iframe（真实事件链）", () => {
    openTool();
    win.localStorage.removeItem(win.__test.PREFIX + "pdf_reader");
    const inp = win.document.querySelector("#pdfFile");
    const file = new win.File(["%PDF-1.4\n%%EOF\n"], "sample.pdf", { type: "application/pdf" });
    Object.defineProperty(inp, "files", { value: [file], configurable: true });
    inp.dispatchEvent(new win.Event("change"));
    const src = frameSrc();
    expect(src, "选完文件后应挂上 iframe").toBeTruthy();
    expect(src).toContain("#page=1");
  });
});
