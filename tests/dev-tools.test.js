/**
 * dev-tools.test.js —— 开发工具做深（v3.7.21）：时间戳工具 + 视频分镜工具
 * ----------------------------------------------------------------------------
 * ① cod-time（时间戳）：
 *    新增「时间差计算 / 常用时间点 / UTC·本地双显」。核心逻辑抽成 3 个纯函数便于断言：
 *    _tsParsePoint（解析时间点）· _tsHumanDiff（人类可读时间差）· _tsCommonPoints（常用时间点）
 * ② des-vidgen（原"AI 视频生成"）：
 *    原 desc 声称"文本描述 → AI 视频生成"，实际点击只弹"通道暂未开放" —— **承诺了不存在的能力**。
 *    现如实改为「分镜脚本 + 视频提示词」（用已配置的文本 AI 生成，可直接粘贴到任意视频模型），
 *    并把拼提示词抽成纯函数 _vgBuildPrompt。
 *
 * DOM 部分沿用 PDF 那轮的教训：**直接驱动顶层函数 / 重开工具页**，避免 app 异步初始化重渲染导致的用例间失稳。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
beforeEach(() => { win = loadApp(); });
const openTool = (id) => { win.openToolStub(id); };

describe("cod-time 纯函数：_tsParsePoint（解析时间点）", () => {
  const base = new Date(2026, 8, 18, 15, 30, 0);   // 2026-09-18 15:30 本地

  it("13 位当毫秒、10 位当秒", () => {
    expect(win._tsParsePoint("1789250411553", base).getTime()).toBe(1789250411553);
    expect(win._tsParsePoint("1789250411", base).getTime()).toBe(1789250411 * 1000);
  });

  it("日期串与日期时间串", () => {
    const d1 = win._tsParsePoint("2026-09-13", base);
    expect(d1.getFullYear()).toBe(2026);
    expect(d1.getMonth()).toBe(8);
    expect(d1.getDate()).toBe(13);
    const d2 = win._tsParsePoint("2026-09-13 12:34:56", base);
    expect(d2.getHours()).toBe(12);
    expect(d2.getMinutes()).toBe(34);
  });

  it("只有时间 → 落在传入的\"今天\"", () => {
    const d = win._tsParsePoint("12:00", base);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(0);
  });

  it("空 / 无法解析 → null（调用方据此提示，不抛错）", () => {
    expect(win._tsParsePoint("", base)).toBeNull();
    expect(win._tsParsePoint(null, base)).toBeNull();
    expect(win._tsParsePoint("不是时间", base)).toBeNull();
  });
});

describe("cod-time 纯函数：_tsHumanDiff（人类可读时间差）", () => {
  it("毫秒 / 秒 / 分 / 小时 / 天 量级", () => {
    expect(win._tsHumanDiff(500)).toContain("毫秒");
    expect(win._tsHumanDiff(5000)).toContain("秒");
    expect(win._tsHumanDiff(90 * 1000)).toContain("1 分");
    expect(win._tsHumanDiff(3 * 3600 * 1000)).toContain("3 小时");
    expect(win._tsHumanDiff(26 * 3600 * 1000)).toContain("1 天");
  });
  it("组合单位：1 天 2 小时", () => {
    const s = win._tsHumanDiff((26 * 3600 + 0) * 1000);
    expect(s).toContain("1 天");
    expect(s).toContain("2 小时");
  });
  it("负值带 - 号（B 早于 A 时）", () => {
    expect(win._tsHumanDiff(-3600 * 1000).startsWith("-")).toBe(true);
  });
  it("始终附带总秒数，便于精确核对", () => {
    expect(win._tsHumanDiff(90 * 1000)).toContain("共 90 秒");
  });
});

describe("cod-time 纯函数：_tsCommonPoints（常用时间点）", () => {
  const now = new Date(2026, 8, 18, 15, 30, 0);
  const pts = () => win._tsCommonPoints(now);

  it("返回 4 个时间点，且都是当天 00:00", () => {
    const list = pts();
    expect(list.length).toBe(4);
    list.forEach(p => {
      const d = new Date(p.ts);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(typeof p.label).toBe("string");
    });
  });

  it("今天零点 = 当天 00:00", () => {
    const d = new Date(pts()[0].ts);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(18);
  });

  it("本周一：周一为一周起点，且不晚于今天", () => {
    const d = new Date(pts()[1].ts);
    expect(d.getDay(), "应为周一").toBe(1);
    expect(d.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime() - d.getTime()).toBeLessThan(7 * 86400000);
  });

  it("本月 1 日 与 今年元旦", () => {
    const m = new Date(pts()[2].ts);
    expect(m.getDate()).toBe(1);
    expect(m.getMonth()).toBe(8);
    const y = new Date(pts()[3].ts);
    expect(y.getMonth()).toBe(0);
    expect(y.getDate()).toBe(1);
    expect(y.getFullYear()).toBe(2026);
  });
});

describe("des-vidgen 纯函数：_vgBuildPrompt（分镜 + 视频提示词）", () => {
  it("包含描述、时长、风格，并明确要「分镜」与「视频提示词」两部分", () => {
    const p = win._vgBuildPrompt("一只橘猫在窗台看雨", "10", "anime");
    expect(p).toContain("一只橘猫在窗台看雨");
    expect(p).toContain("10");
    expect(p).toContain("动画");
    expect(p).toContain("分镜");
    expect(p).toContain("视频提示词");
  });
  it("未知风格回退为写实；时长缺省为 5", () => {
    const p = win._vgBuildPrompt("test", "", "unknown-style");
    expect(p).toContain("写实");
    expect(p).toContain("5 秒");
  });
  it("空描述不抛错（调用方另有必填校验）", () => {
    expect(() => win._vgBuildPrompt(undefined)).not.toThrow();
  });
});

describe("DOM：cod-time 页面（时间差 + 常用时间点）", () => {
  it("打开后出现 A/B 输入与 4 个常用时间点按钮", () => {
    openTool("cod-time");
    expect(win.document.querySelector("#tsA")).toBeTruthy();
    expect(win.document.querySelector("#tsB")).toBeTruthy();
    expect(win.document.querySelectorAll("#tsCommon [data-ts-pt]").length).toBe(4);
  });

  it("点击常用时间点 → 回写 unix 与本地日期两栏", () => {
    openTool("cod-time");
    const btn = win.document.querySelector("#tsCommon [data-ts-pt]");
    const ts = btn.getAttribute("data-ts-pt");
    btn.click();
    expect(win.document.querySelector("#tsUnix").value).toBe(ts);
    expect(win.document.querySelector("#tsDate").value.length).toBeGreaterThan(10);
  });

  it("填写 A/B 后自动算出时间差（B 留空 = 现在）", () => {
    openTool("cod-time");
    const a = win.document.querySelector("#tsA");
    a.value = "1789250411";                 // 某个秒级时间戳
    a.dispatchEvent(new win.Event("input"));
    const out = win.document.querySelector("#tsDiffOut").textContent;
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/毫秒|秒|分|小时|天/);
  });
});

describe("DOM：des-vidgen 页面（如实说明 + 真能用的能力）", () => {
  it("按钮文案是「生成分镜与提示词」，并如实说明尚未接入视频模型", () => {
    openTool("des-vidgen");
    const btn = win.document.querySelector("#vgGo");
    expect(btn).toBeTruthy();
    const page = win.document.querySelector("#main").textContent;
    expect(page).toContain("分镜");
    expect(page).toContain("视频模型尚未接入");
    /* 不应再出现"点了才知道不行"的空头文案 */
    expect(page).not.toContain("通道暂未开放");
  });
});
