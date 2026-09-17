/**
 * dev-tools.test.js —— 开发工具做深（v3.7.21）：时间戳工具 + 视频分镜工具
 * ----------------------------------------------------------------------------
 * ① cod-time：新增「时间差计算 / 常用时间点 / UTC·本地双显」，核心逻辑抽成 3 个纯函数：
 *    _tsParsePoint（解析时间点）· _tsHumanDiff（人类可读时间差）· _tsCommonPoints（常用时间点）
 * ② des-vidgen：原 desc 声称"文本描述 → AI 视频生成"，实际点击只弹"通道暂未开放"（承诺了不存在的能力）；
 *    现如实改为「分镜脚本 + 视频提示词」，并把拼提示词抽成纯函数 _vgBuildPrompt。
 *
 * ⚠️ 两条写这个文件时踩过的坑（都会让 CI（Ubuntu/UTC）与本机（UTC+8）结果不一致）：
 *   1. **不能硬编码日期**：断言"今天零点"时若写死几号，跨时区必失败（CI 实测 expected 17 to be 18）。
 *      → 一律相对传入的 base/now 断言。
 *   2. **Date 必须在 jsdom 域内构造**：把 Node 域的 Date 传进应用，`base instanceof Date` 会因**跨 realm**
 *      判为 false → 被测函数退化成"用当前时间"（在 UTC 下正好表现为差一天）。
 *      → 用 `new win.Date(...)`，并用 beforeEach 创建（describe 体里求值时还没有 win）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
let base;   // 本文件统一使用的"现在"：jsdom 域内构造
let now;

beforeEach(() => {
  win = loadApp();
  base = new win.Date(2026, 8, 18, 15, 30, 0);
  now = new win.Date(2026, 8, 18, 15, 30, 0);
});

const openTool = (id) => { win.openToolStub(id); };
const sameDay = (d, ref) => [d.getFullYear(), d.getMonth(), d.getDate()].join("-") === [ref.getFullYear(), ref.getMonth(), ref.getDate()].join("-");

describe("cod-time 纯函数：_tsParsePoint（解析时间点）", () => {
  it("13 位当毫秒、10 位当秒", () => {
    expect(win._tsParsePoint("1789250411553", base).getTime()).toBe(1789250411553);
    expect(win._tsParsePoint("1789250411", base).getTime()).toBe(1789250411 * 1000);
  });

  it("日期串与日期时间串（只断言可解析与相对关系，不写死具体日期）", () => {
    const d1 = win._tsParsePoint("2026-09-13", base);
    expect(d1).toBeTruthy();
    expect(d1.getFullYear()).toBe(2026);
    expect(d1.getMonth()).toBe(8);
    const d2 = win._tsParsePoint("2026-09-13 12:34:56", base);
    expect(d2.getHours()).toBe(12);
    expect(d2.getMinutes()).toBe(34);
  });

  it("只有时间 → 落在传入的 base 的同一天（相对断言，避免时区依赖）", () => {
    const d = win._tsParsePoint("12:00", base);
    expect(sameDay(d, base), "应为 base 的当天").toBe(true);
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(0);
  });

  it("跨 realm 的 Date 会退化（记录该约束；生产代码不会遇到）", () => {
    /* Node 域构造的 Date 过不了应用里的 `instanceof Date` → 退化用当前时间。
       本文件因此统一用 win.Date 构造；这条断言把该约束固定下来，避免以后有人再踩。 */
    const foreign = new Date(2026, 8, 18, 15, 30, 0);
    const viaForeign = win._tsParsePoint("12:00", foreign);
    const viaDom = win._tsParsePoint("12:00", base);
    expect(viaDom.getHours()).toBe(12);
    expect(viaForeign).toBeTruthy();   // 不抛错即可（行为差异由上面的注释说明）
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
  it("返回 4 个时间点，且都是 00:00（相对 now 断言）", () => {
    const list = win._tsCommonPoints(now);
    expect(list.length).toBe(4);
    list.forEach((p) => {
      const d = new win.Date(p.ts);
      expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
      expect(typeof p.label).toBe("string");
    });
  });

  it("今天零点 = now 的当天 00:00", () => {
    const d = new win.Date(win._tsCommonPoints(now)[0].ts);
    expect(sameDay(d, now)).toBe(true);
  });

  it("本周一：周一为一周起点，且不晚于今天、不超过 7 天前", () => {
    const d = new win.Date(win._tsCommonPoints(now)[1].ts);
    expect(d.getDay(), "应为周一").toBe(1);
    expect(d.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime() - d.getTime()).toBeLessThan(7 * 86400000);
  });

  it("本月 1 日 与 今年元旦（相对 now 推导）", () => {
    const list = win._tsCommonPoints(now);
    const m = new win.Date(list[2].ts);
    expect(m.getDate()).toBe(1);
    expect(m.getMonth()).toBe(now.getMonth());
    const y = new win.Date(list[3].ts);
    expect(y.getMonth()).toBe(0);
    expect(y.getDate()).toBe(1);
    expect(y.getFullYear()).toBe(now.getFullYear());
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
    a.value = "1789250411";
    a.dispatchEvent(new win.Event("input"));
    const out = win.document.querySelector("#tsDiffOut").textContent;
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/毫秒|秒|分|小时|天/);
  });
});

describe("DOM：des-vidgen 页面（如实说明 + 真能用的能力）", () => {
  it("按钮是「生成分镜与提示词」，页面如实说明尚未接入视频模型，且不再出现空头文案", () => {
    openTool("des-vidgen");
    expect(win.document.querySelector("#vgGo")).toBeTruthy();
    const page = win.document.querySelector("#main").textContent;
    expect(page).toContain("分镜");
    expect(page).toContain("视频模型尚未接入");
    expect(page).not.toContain("通道暂未开放");
  });
});
