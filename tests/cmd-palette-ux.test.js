/**
 * cmd-palette-ux.test.js —— 命令面板 UX 增强的回归测试（v3.7.8）
 * ----------------------------------------------------------------------------
 * 覆盖三项本机无法在 headless 下可靠验证、但 jsdom 可以真实驱动的行为：
 *   ① fuzzyMatch：返回「分值 + 命中位置」（高亮要用），且分值与旧 fuzzyScore 语义一致
 *   ② highlightHits：按命中位置加 <b class="cmd-hit">，且逐字符转义（防注入 / 防下标错位）
 *   ③ ↑↓ 循环：到顶再按 ↑ 绕到最后一项、到底再按 ↓ 回到第一项（此前是 clamp 住不动）
 *   ④ 新增命令真实可达：查看统计 / 打开 AI 配置 / 打开回收站
 *
 * 说明：面板的键盘处理绑在 #cmdInput 的 onkeydown 上，jsdom 里用 dispatchEvent(new KeyboardEvent(...))
 *   即可真实驱动（既有 tests/cmd-palette-enhance.test.js 就是这么测 ArrowDown 的）。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const press = (win, key) => {
  const input = win.document.getElementById("cmdInput");
  input.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true }));
};
const selectedIndex = (win) => {
  const sel = win.document.querySelector("#cmdList li.sel");
  return sel ? Number(sel.dataset.i) : -1;
};

describe("命令面板 UX 增强（v3.7.8）", () => {
  describe("fuzzyMatch / highlightHits", () => {
    it("fuzzyMatch 返回命中的字符下标（子串命中为连续下标）", () => {
      const win = loadApp();
      const m = win.__test.fuzzyMatch("切换明暗主题", "明暗");
      expect(m.score).toBeGreaterThan(0);
      expect(m.positions).toEqual([2, 3]);
    });

    it("fuzzyMatch 的子序列命中返回分散下标；不匹配返回空数组", () => {
      const win = loadApp();
      const sub = win.__test.fuzzyMatch("切换明暗主题", "切主");
      expect(sub.score).toBeGreaterThan(0);
      expect(sub.positions).toEqual([0, 4]);
      const none = win.__test.fuzzyMatch("打开设置", "zzz");
      expect(none.score).toBe(-1);
      expect(none.positions).toEqual([]);
    });

    it("fuzzyMatch 分值与既有 fuzzyScore 完全一致（不破坏老调用方）", () => {
      const win = loadApp();
      const cases = [["切换明暗主题", "明暗"], ["导出数据", "导出"], ["任务导出备份", "导出"], ["abc", "ba"], ["任意", ""]];
      for (const [text, q] of cases) {
        expect(win.__test.fuzzyMatch(text, q).score).toBe(win.__test.fuzzyScore(text, q));
      }
    });

    it("highlightHits 只包裹命中字符，且做 HTML 转义", () => {
      const win = loadApp();
      const out = win.__test.highlightHits("a<b>c", [0, 2]);
      expect(out).toContain('<b class="cmd-hit">a</b>');
      expect(out).toContain("&lt;");           // < 必须被转义
      expect(out).not.toContain("<b>c");       // 未命中位置不加标签
      expect(out).toContain("&gt;");
    });
  });

  describe("↑↓ 循环选择", () => {
    it("面板打开时选中第 0 项", () => {
      const win = loadApp();
      win.openCmd();
      expect(selectedIndex(win)).toBe(0);
    });

    it("在第 0 项按 ↑ 绕到最后一项；再按 ↓ 回到第 0 项", () => {
      const win = loadApp();
      win.openCmd();
      const n = win.document.querySelectorAll("#cmdList li[data-i]").length;
      expect(n).toBeGreaterThan(3);
      press(win, "ArrowUp");
      expect(selectedIndex(win)).toBe(n - 1);
      press(win, "ArrowDown");
      expect(selectedIndex(win)).toBe(0);
    });

    it("多次 ↓ 到末尾后继续 ↓ 绕回第 0 项（不再 clamp 住）", () => {
      const win = loadApp();
      win.openCmd();
      const n = win.document.querySelectorAll("#cmdList li[data-i]").length;
      for (let i = 0; i < n; i++) press(win, "ArrowDown");
      expect(selectedIndex(win)).toBe(0);
    });
  });

  describe("新增命令可达", () => {
    it("存在「查看统计 / 打开 AI 配置 / 打开回收站」三条命令", () => {
      const win = loadApp();
      win.openCmd();
      const labels = [...win.document.querySelectorAll("#cmdList li[data-i]")].map(li => li.textContent.trim());
      for (const want of ["查看统计", "打开 AI 配置", "打开回收站"]) {
        expect(labels.some(l => l.includes(want)), "缺少命令：" + want).toBe(true);
      }
    });

    it("输入「统计」能筛到「查看统计」并带命中高亮", () => {
      const win = loadApp();
      win.openCmd();
      const input = win.document.getElementById("cmdInput");
      input.value = "统计";
      input.dispatchEvent(new win.Event("input"));
      const items = [...win.document.querySelectorAll("#cmdList li[data-i]")];
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].textContent).toContain("查看统计");
      const hits = [...win.document.querySelectorAll("#cmdList b.cmd-hit")].map(b => b.textContent).join("");
      expect(hits).toBe("统计");
    });
  });
});
