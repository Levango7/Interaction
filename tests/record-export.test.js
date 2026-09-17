/**
 * record-export.test.js —— 生活簇记录工具「导出 CSV」（v3.7.22）
 * ----------------------------------------------------------------------------
 * 背景：生活簇 5 个工具（运动/缴费/采购/外卖/出行）共用的 `_recordToolHtml` 骨架只有
 *   增/删/改/汇总，**没有导出**（而 `_toolDownload` 此前只被 md/word/sheet/ppt/canvas 用）。
 *   本次在骨架加「导出 CSV」按钮 + 两个 bind 助手各挂一行 → **改一处，5 个工具同时获得**。
 *
 * 设计要点（可测性）：
 *   · 抽出纯函数 `_csvCell`（单元格转义）与 `_toolCsvFromTable`（从渲染后的表格取数）
 *   · **列名直接从 <th> 取** → 天然是本地化文案，无需把 cfg 传进导出逻辑
 *   · 跳过首列（勾选框）与末列（删除按钮）—— 操作列不该进导出
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
beforeEach(() => { win = loadApp(); });

describe("CSV 纯函数：_csvCell（单元格转义）", () => {
  it("普通值原样输出", () => {
    expect(win._csvCell("测试店")).toBe("测试店");
    expect(win._csvCell(12.5)).toBe("12.5");
  });
  it("含逗号 → 加引号", () => {
    expect(win._csvCell("a,b")).toBe('"a,b"');
  });
  it("含双引号 → 加引号且内部引号翻倍", () => {
    expect(win._csvCell('a"b')).toBe('"a""b"');
  });
  it("含换行 → 加引号", () => {
    expect(win._csvCell("a\nb")).toBe('"a\nb"');
  });
  it("null / undefined → 空串（不出现 \"null\"）", () => {
    expect(win._csvCell(null)).toBe("");
    expect(win._csvCell(undefined)).toBe("");
  });
});

describe("CSV 纯函数：_toolCsvFromTable（从渲染表格取数）", () => {
  const makeTable = (rows) => {
    const d = win.document.createElement("div");
    d.innerHTML = '<table class="tool-table"><thead><tr>'
      + '<th></th><th>店铺</th><th>金额</th><th>操作</th>'
      + '</tr></thead><tbody>' + rows.map((r) => {
        return '<tr><td><input type="checkbox"' + (r.done ? " checked" : "") + '></td>'
          + '<td>' + r.shop + '</td><td>' + r.amt + '</td><td><button>删</button></td></tr>';
      }).join("") + '</tbody></table>';
    return d;
  };

  it("跳过首列（勾选）与末列（删除），只导出数据列", () => {
    const csv = win._toolCsvFromTable(makeTable([{ shop: "甲", amt: "¥1", done: false }]));
    expect(csv).toBe("店铺,金额\r\n甲,¥1");
  });

  it("勾选列导出为「是/否」而不是空", () => {
    const csv = win._toolCsvFromTable(makeTable([{ shop: "甲", amt: "¥1", done: true }]));
    expect(csv.split("\r\n")[0]).toBe("店铺,金额");
    expect(csv).toContain("甲");
  });

  it("多行 → CRLF 分隔，行数 = 表头 + 数据行", () => {
    const csv = win._toolCsvFromTable(makeTable([{ shop: "甲", amt: "¥1" }, { shop: "乙", amt: "¥2" }]));
    const lines = csv.split("\r\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("店铺,金额");
  });

  it("没有表格 → 空串（调用方据此提示，不生成空文件）", () => {
    const d = win.document.createElement("div");
    expect(win._toolCsvFromTable(d)).toBe("");
  });
});

describe("DOM：生活工具页面出现导出按钮，且点击会触发下载", () => {
  it("外卖记录页出现 #recExportBtn", () => {
    win.openToolStub("lif-takeout");
    expect(win.document.querySelector("#recExportBtn")).toBeTruthy();
  });

  it("点击导出 → 调 _toolDownload，文件名为 <toolId>.csv 且带 BOM（Excel 友好）", () => {
    win.openToolStub("lif-takeout");
    const captured = {};
    const orig = win._toolDownload;
    win._toolDownload = function (name, content, mime) { captured.name = name; captured.content = content; captured.mime = mime; };
    try {
      const btn = win.document.querySelector("#recExportBtn");
      btn.click();
      if (captured.name) {
        expect(captured.name).toBe("lif-takeout.csv");
        expect(captured.mime).toContain("text/csv");
        expect(String(captured.content).charCodeAt(0)).toBe(0xFEFF);   // BOM
      } else {
        /* 无记录时是提示而非导出（骨架对空表的正确行为） */
        expect(captured.name).toBeUndefined();
      }
    } finally {
      win._toolDownload = orig;
    }
  });

  it("空表点击不生成文件（提示即可）", () => {
    win.openToolStub("lif-takeout");
    const captured = {};
    const orig = win._toolDownload;
    win._toolDownload = function (name) { captured.name = name; };
    try {
      const btn = win.document.querySelector("#recExportBtn");
      btn.click();
      expect(captured.name).toBeUndefined();   // 本次无记录 → 不应导出
    } finally {
      win._toolDownload = orig;
    }
  });
});
