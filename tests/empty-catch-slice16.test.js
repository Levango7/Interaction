/**
 * empty-catch-slice16.test.js —— R-2 续集第三批（3 个零散文件各 1 处）：全仓 39 → 36
 * ----------------------------------------------------------------------------
 * 本批只挑**明确该修**的 3 条，其余零散 P0 逐条看过并**判定为「有理由的降级」后不动** ——
 * 这是 R-2 的分寸：分清「合理降级」与「真吞错」，不为凑数字去改作者写过理由的代码。
 *
 * 修了的 3 条（都是「数据静默丢失」）：
 *   · `data-rw.js:526` 设备 ID 存不住 ⇒ 每次启动重新生成 ⇒ 跨设备同步把同一台机器认成「新设备」，
 *     去重与设备列表都会错乱；
 *   · `chain.js:26` 任务事件日志写失败 ⇒ 任务链历史整段消失，「看不见发生过什么」与「没发生过」分不清；
 *   · `ui-palette.js:214` 技能数据异常 ⇒ 命令面板技能区整段消失，用户以为「我没存过技能」。
 *
 * **明确不动的（逐条看过，理由都在源码注释里）**：
 *   · `ui-drawer.js` 5 处 —— R-2 切片一已逐条判过「真合理」；
 *   · `ui-backup-stats.js` 2 处 —— `:48`「已被上游 _exportReadFailed 点名，不重复报」、
 *     `:1088`「展开偏好丢了无害、下次会重写」；（原列在这里的 `:401` 是**判定器误判**：
 *     `.catch(function(e){ …pushDiag… })` 体里有留痕，v3.7.152 修尺子后已不再计入，故 3 → 2）；
 *   · `ui-ge-api.js:63` —— R-38 判定的「刻意保留」（用异常做控制流探测明文/密文）；
 *   · `ui-onboarding.js:127`「存储不可用就退回每次都弹，不阻塞功能」；
 *   · `ui-daily.js:111`「旧 API 回调式或无 Notification，忽略」；
 *   · `core-i18n.js:10` 初始化读语言失败保持默认（报诊断会在每次启动刷屏）；
 *   · `ai-loop.js:328` 明确标注的降级。
 *   ⇒ **推论：「全仓 P0」这个数是上界，真实待修 ≤ 36。** 剩余大头是 `ai-tools.js`(11) 与
 *      `ui-ge-integrations.js`(5) / `render-widgets.js`(4，历史上被对方占用)。
 *
 * 运行：npm run test:local -- tests/empty-catch-slice16.test.js
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { loadApp } from "./helpers/loadApp.js";
import { scanSource } from "../scripts/lib/empty-catch.mjs";

let win, diagCalls;
const orig = {};

function installProbes() {
  diagCalls = [];
  const origDiag = win.pushDiag;
  win.pushDiag = function (level, msg, ctx) {
    diagCalls.push({ level, msg: String(msg), ctx });
    return origDiag && origDiag.apply(win, arguments);
  };
}

const hasDiag = (re) => diagCalls.find((d) => re.test(d.msg));
const readSrc = (f) => fs.readFileSync("src/" + f, "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

beforeEach(async () => {
  win = loadApp({ storage: {} });
  await new Promise((r) => setTimeout(r, 60));
  orig.setItem = win.Storage.prototype.setItem;
  installProbes();
});

afterEach(() => {
  if (orig.setItem) win.Storage.prototype.setItem = orig.setItem;
  try { win.close(); } catch (_e) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① 真行为 · data-rw：设备 ID 落盘失败必须留痕（否则同步会把同一台机器认成新设备）", () => {
  it("setItem 抛错 → 诊断点名 getDeviceId，且仍返回一个可用 id（控制流不变）", () => {
    win.Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
    let id, threw;
    try { id = win.getDeviceId(); } catch (e) { threw = (e && e.message) || String(e); }
    expect(threw, "存不住也不该抛 —— 设备标识是辅助信息，不该让调用方崩").toBeUndefined();
    expect(typeof id === "string" && id.length > 0,
      "仍须返回一个 id（本次会话内可用），不能因为存不住就返回空").toBe(true);
    const hit = hasDiag(/deviceId persist failed/i);
    expect(hit, "不报的话，每次启动都换 id，跨设备去重会一直错").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("getDeviceId");
  });

  it("反向对照：正常落盘时不报这条", () => {
    win.getDeviceId();
    expect(hasDiag(/deviceId persist failed/i), "正常路径混进失败诊断 = 把「永远报失败」当可观测").toBeFalsy();
  });
});

describe("② 源码契约回归锁：3 处具名留痕不许被删、where 不许写错", () => {
  const EXPECT = [
    ["data-rw.js", "deviceId persist failed", "getDeviceId"],
    ["chain.js", "task event log persist failed", "_emitTaskEvent"],
    ["ui-palette.js", "skills block skipped in palette", "paletteSkills"]
  ];

  it("每条都能找到 pushDiag 消息 + 正确 where + 二次保护", () => {
    for (const [f, msg, where] of EXPECT) {
      const raw = readSrc(f);
      expect(raw, f + " 的「" + msg + "」被删了").toContain(msg);
      const re = new RegExp(esc(msg) + "[\\s\\S]{0,200}?where\\s*:\\s*\"" + esc(where) + "\"");
      expect(re.test(raw), f + " 的 where 应为 " + where).toBe(true);
      const i = raw.indexOf(msg);
      const around = raw.slice(Math.max(0, i - 120), i + 260);
      expect(/try\{[\s\S]{0,80}pushDiag/.test(around), f + " 的留痕没包在 try 里").toBe(true);
      expect(/catch\s*\(\s*_e[0-9]?\s*\)/.test(around), f + " 缺 catch(_eN) 二次保护").toBe(true);
    }
  });
});

describe("③ 计数锁：39 → 36，且「有理由的降级」不许被硬改", () => {
  it("这 3 个文件的 P0 必须为 0", () => {
    for (const f of ["data-rw.js", "chain.js", "ui-palette.js"]) {
      const p0 = scanSource(readSrc(f), f).filter((i) => i.level === "P0");
      expect(p0.length, f + " 又出现 P0：" + p0.map((i) => ":" + i.line).join(" ")).toBe(0);
    }
  });

  it("全仓 P0 总数 ≤ 36", () => {
    let n = 0;
    for (const f of fs.readdirSync("src").filter((x) => x.endsWith(".js"))) {
      n += scanSource(readSrc(f), f).filter((i) => i.level === "P0").length;
    }
    expect(n, "P0 回涨说明有人新增静默吞错，或把本批留痕删了").toBeLessThanOrEqual(36);
  });

  it("被判定「有理由的降级」保持原样（改动它们前应该先读懂理由）", () => {
    const KEEP = [
      ["ui-drawer.js", 5],
      /* 3 → 2：**尺子换了**，不是代码改了 —— :401 那条 `.catch(function(e){ …pushDiag… })`
         体里有留痕，旧判定器的惰性跨段匹配把它误判成"空处理器"（v3.7.152 已修）。 */
      ["ui-backup-stats.js", 2],
      ["ui-onboarding.js", 1],
      ["ui-daily.js", 1],
      ["core-i18n.js", 1],
      ["ai-loop.js", 1]
    ];
    for (const [f, n] of KEEP) {
      const p0 = scanSource(readSrc(f), f).filter((i) => i.level === "P0");
      expect(p0.length, f + " 的 P0 数变了（原判 " + n + " 处为「有理由的降级」，要改请先读注释）").toBe(n);
    }
    expect(readSrc("ui-backup-stats.js").includes("已被上面的 _exportReadFailed 点名"), ":48 的理由注释被删了").toBe(true);
  });
});
