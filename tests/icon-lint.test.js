/**
 * 字符图标门禁的判定层单测（v3.7.120）
 * ----------------------------------------------------------------------------
 * 直接 import `scripts/lib/icon-scan.mjs` 调纯函数 —— **不 spawn CLI**：
 * 本机沙箱里 execFileSync 一律 EBUSY（同 empty-catch 切片测试的做法）。
 *
 * 这份测试要钉住的是「门禁的判据」，特别是几个**容易被写错**的边界：
 *   · 排版符号（<span class="arrow">→</span>）**不算**违规 —— 它不是"按钮唯一内容"；
 *   · SVG 按钮**不算**违规 —— 那正是期望写法；
 *   · 符号出现在句中而不是开头**不算**违规 —— 那不是图标位；
 *   · 字符串拼接残渣（`' + t(...) + '`）**不算**违规 —— 它是源码片段不是渲染文本。
 * 前三条防误报，第四条防"门禁报噪音导致没人信它"。
 */
import { describe, it, expect } from "vitest";
import { scanSource, keyOf, SYMBOL_CLASS, EMOJI_CLASS } from "../scripts/lib/icon-scan.mjs";

const scan = (s) => scanSource(s, "t.js");

describe("字符图标门禁 · 判定层", () => {
  describe("P0：按钮内容只有符号字形", () => {
    it("dingbat 单独作按钮内容 → P0", () => {
      const r = scan('<button type="button" class="cal-nav">☰</button>');
      expect(r).toHaveLength(1);
      expect(r[0].level).toBe("P0");
      expect(r[0].sig).toBe("☰");
    });

    it("emoji 作按钮内容 → P0", () => {
      const r = scan('<button type="button">🀄</button>');
      expect(r).toHaveLength(1);
      expect(r[0].level).toBe("P0");
    });

    it("关闭叉 ✕ 作按钮内容 → P0（存量最大的一类）", () => {
      const r = scan('<button type="button" data-close="1">✕</button>');
      expect(r).toHaveLength(1);
      expect(r[0].level).toBe("P0");
    });

    it("符号被 span 包着也算 —— 去掉标签后仍是纯符号", () => {
      const r = scan('<button type="button"><span class="ic">✓</span></button>');
      expect(r).toHaveLength(1);
      expect(r[0].level).toBe("P0");
    });

    it("正确报告行号（多行文件里不是行 1）", () => {
      const src = ["const a = 1;", "const b = 2;", '<button type="button">☰</button>'].join("\n");
      expect(scan(src)[0].line).toBe(3);
    });
  });

  describe("P1：符号与文字混排（符号在开头 = 图标位）", () => {
    it("「⚙ 编辑布局」→ P1", () => {
      const r = scan('<button type="button">⚙ 编辑布局</button>');
      expect(r).toHaveLength(1);
      expect(r[0].level).toBe("P1");
    });

    it("「✓ 完成编辑」→ P1", () => {
      expect(scan('<button type="button">✓ 完成编辑</button>')[0].level).toBe("P1");
    });
  });

  describe("不该报的（防误报 —— 门禁报噪音就没人信它了）", () => {
    it("SVG 图标按钮 → 不报（这正是期望写法）", () => {
      expect(scan('<button type="button" aria-label="关闭"><svg viewBox="0 0 24 24"></svg></button>')).toHaveLength(0);
    });

    it("纯文字按钮 → 不报", () => {
      expect(scan('<button type="button">保存</button>')).toHaveLength(0);
    });

    it("模板里插 UI_ICONS → 不报", () => {
      expect(scan('<button type="button">${UI_ICONS.check}</button>')).toHaveLength(0);
      expect(scan("'<button>' + UI_ICONS.list + '</button>'")).toHaveLength(0);
    });

    it("排版符号 span（链式箭头 / 状态点）→ 不报 —— 它不是按钮唯一内容", () => {
      expect(scan('<span class="arr">→</span>')).toHaveLength(0);
      expect(scan('<span class="u-text-ok">●</span> 已授权')).toHaveLength(0);
    });

    it("符号在句中（非开头）→ 不报 —— 那不是图标位", () => {
      expect(scan('<button type="button">保存 (Ctrl+S)</button>')).toHaveLength(0);
      expect(scan('<button type="button">上一页 ←</button>')).toHaveLength(0);
    });

    it("字符串拼接残渣 → 不报（源码片段不等于渲染文本）", () => {
      expect(scan('<button type="button">← \' + t("auth.back","返回") + \'</button>')).toHaveLength(0);
    });

    it("空按钮 / 只有空白 → 不报", () => {
      expect(scan('<button type="button"></button>')).toHaveLength(0);
      expect(scan('<button type="button">   </button>')).toHaveLength(0);
    });

    it("非 button 元素里的符号 → 不报（门禁只管按钮）", () => {
      expect(scan('<div class="ic">☰</div>')).toHaveLength(0);
    });
  });

  describe("基线的稳定键", () => {
    it("同一文件同一内容出现多次时，occ 递增使键互不相同", () => {
      const r = scan(['<button>✕</button>', '<button>✕</button>'].join("\n"));
      expect(r).toHaveLength(2);
      expect(r[0].occ).toBe(1);
      expect(r[1].occ).toBe(2);
      expect(keyOf(r[0])).not.toBe(keyOf(r[1]));
    });

    it("键包含文件名（跨文件同内容不互相抵消）", () => {
      const a = scanSource('<button>✕</button>', "a.js")[0];
      const b = scanSource('<button>✕</button>', "b.js")[0];
      expect(keyOf(a)).not.toBe(keyOf(b));
    });
  });

  describe("字符类本身", () => {
    it("SYMBOL_CLASS 认 dingbat/箭头，不认中日韩文字与拉丁字母", () => {
      expect(SYMBOL_CLASS.test("✕")).toBe(true);
      expect(SYMBOL_CLASS.test("☰")).toBe(true);
      expect(SYMBOL_CLASS.test("→")).toBe(true);
      expect(SYMBOL_CLASS.test("保")).toBe(false);
      expect(SYMBOL_CLASS.test("A")).toBe(false);
    });

    it("EMOJI_CLASS 认 emoji 与变体选择符", () => {
      expect(EMOJI_CLASS.test("🀄")).toBe(true);
      expect(EMOJI_CLASS.test("🚀")).toBe(true);
      expect(EMOJI_CLASS.test("\uFE0F")).toBe(true);
      expect(EMOJI_CLASS.test("保")).toBe(false);
    });
  });
});
