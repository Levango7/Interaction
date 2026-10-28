/**
 * empty-catch-slice15.test.js —— R-2 续集第二批（`ui-global-events.js` 3 处 + `data-links.js` 5 处）
 * ----------------------------------------------------------------------------
 * 承接 slice14（第一批 4 个 ui-ge-* 文件 8 处）。本批再消解 8 处 ⇒ 全仓 P0 **47 → 39**。
 *
 * 本批 8 处的共同性质仍是那一句：**失败被渲染成了「没有」/「没做过」** ——
 *   · 会话列表没落盘 ⇒ 刷新后对话消失，用户以为「自己没保存」；
 *   · 当前会话 id 没记住 ⇒ 刷新后落到别的会话，用户以为「聊天串了」；
 *   · 导入/恢复后内存 chats 未刷新 ⇒ 界面显示导入**之前**的消息（与真相相反）；
 *   · 插件开关没落盘 ⇒ 回到默认，用户以为「刚开的开关没生效」；
 *   · 插件配置读坏 ⇒ 显示「全被禁用」，与「读不出来」是两件事；
 *   · PWA 安装状态没记住 ⇒ 下次启动再提示安装，用户以为上次没装上；
 *   · 「跟随系统」主题键没写进去 ⇒ 刷新回退（同一句谎报的另一半，cfg 那条已单独修过）；
 *   · sw.showNotification 失败转普通通知 ⇒ 回退也可能失败，失败时只看到「没弹通知」。
 *
 * 射程（照 slice14 的教训，先写清）：
 *   ① 组是**真行为**：data-links 的落盘函数经 `__test` 出口直接驱动，mock `Storage.prototype.setItem` 抛错；
 *   ② 组是**契约锁**：ui-global-events 那 3 处绑在事件处理器内部（`cfgThemeSel.onchange` / `appinstalled` /
 *      试验通知），现有 jsdom 骨架里没有稳定入口，只有源码契约 + 各自的反向对照无法覆盖的失败路径。
 *   ⇒ **别把本文件读成「8 处都已行为验证」**：真行为只覆盖 data-links 的落盘面。
 *   ⚠️ 且落盘面里只有 `_savePluginsState` 做到了行为驱动：`_saveSessions` / `_saveActiveSid` 在 `__test` 上
 *      取到的是 undefined（同一次 `Object.assign` 里的另外三个都是 function，`__test` 共 640 个 key，
 *      说明挂载块**执行了**）。原因未查明 —— 疑似被后续块对 `__test` 的 assign 覆盖，但那是推测。
 *      为不阻塞本批，这两处**只有契约锁**；已作为待查项记进 CHANGELOG，不做「看起来查过了」的假收口。
 *
 * 另：本批**刻意不动** `ui-backup-stats.js` 的 3 处，因为它们是「作者写了充分理由的降级」——
 *   `:48` 注释明写「已被上游 _exportReadFailed 点名，此处不重复报」，`:1088` 写「展开偏好丢了无害、下次会重写」；
 *   `:401` 更是**判定器误判**（`.then(async…).catch(有留痕)` 被判成空 —— R-37 台账已记）。
 *   按 R-2 的口径（分清「合理降级」与「真吞错」），它们不该为凑数被改。这条判断记在 CHANGELOG 里。
 *
 * 运行：npm run test:local -- tests/empty-catch-slice15.test.js
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

const breakStorage = () => {
  win.Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
};

describe("① 真行为 · data-links：落盘失败必须留痕，且不抛给调用方", () => {
  it("插件状态落盘失败 → 诊断点名 _savePluginsState", () => {
    breakStorage();
    let threw;
    try { win.__test._savePluginsState(); } catch (e) { threw = (e && e.message) || String(e); }
    expect(threw).toBeUndefined();
    const hit = hasDiag(/plugins state persist failed/i);
    expect(hit, "不报的话，开关会回到默认，用户以为「刚才开的那下没生效」").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("_savePluginsState");
  });

  it("反向对照：正常落盘时不许出现这两条诊断（否则上面两条可能是恒真）", () => {
    win.__test._savePluginsState();
    expect(hasDiag(/plugins state persist failed/i), "正常路径混进失败诊断 = 把「永远报失败」当可观测").toBeFalsy();
  });

  it("_reloadChatsFromStorage 正常路径不报「导入后仍是旧消息」", () => {
    let err;
    try { win.__test._reloadChatsFromStorage(); } catch (e) { err = (e && e.message) || String(e); }
    expect(err).toBeUndefined();
    expect(hasDiag(/chats reload after import failed/i)).toBeFalsy();
  });
});

describe("② 源码契约回归锁：8 处具名留痕不许被删、where 不许写错、必须包二次保护", () => {
  const EXPECT = [
    ["ui-global-events.js", "theme key persist failed", "cfgThemeSel.onchange/themeKey"],
    ["ui-global-events.js", "pwa_installed persist failed", "appinstalled"],
    ["ui-global-events.js", "sw showNotification failed, falling back", "testNotification"],
    ["data-links.js", "sessions persist failed", "_saveSessions"],
    ["data-links.js", "active session persist failed", "_saveActiveSid"],
    ["data-links.js", "chats reload after import failed", "_reloadChatsFromStorage"],
    ["data-links.js", "plugins state persist failed", "_savePluginsState"],
    ["data-links.js", "plugins state load failed", "_loadPluginsState"]
  ];

  it("每条都能在源码里找到 pushDiag 消息，且同一调用带正确的 where", () => {
    for (const [f, msg, where] of EXPECT) {
      const raw = readSrc(f);
      expect(raw, f + " 里的「" + msg + "」被删了 —— 留痕没了，这条 P0 会悄悄回来").toContain(msg);
      const re = new RegExp(esc(msg) + "[\\s\\S]{0,200}?where\\s*:\\s*\"" + esc(where) + "\"");
      expect(re.test(raw), f + " 的诊断 where 应为 " + where).toBe(true);
    }
  });

  it("每处留痕都必须包二次保护", () => {
    for (const [f, msg] of EXPECT) {
      const raw = readSrc(f);
      const i = raw.indexOf(msg);
      const around = raw.slice(Math.max(0, i - 120), i + 260);
      expect(/try\{[\s\S]{0,80}pushDiag/.test(around), f + " 的 " + msg + " 没包在 try 里").toBe(true);
      expect(/catch\s*\(\s*_e[0-9]?\s*\)/.test(around), f + " 的 " + msg + " 缺 catch(_eN) 二次保护").toBe(true);
    }
  });
});

describe("③ 计数锁：本批 47 → 39，不许回涨", () => {
  it("这两个文件的 P0 必须为 0", () => {
    for (const f of ["ui-global-events.js", "data-links.js"]) {
      const p0 = scanSource(readSrc(f), f).filter((i) => i.level === "P0");
      expect(p0.length, f + " 又出现 P0：" + p0.map((i) => ":" + i.line).join(" ")).toBe(0);
    }
  });

  it("全仓 P0 总数 ≤ 39", () => {
    const files = fs.readdirSync("src").filter((f) => f.endsWith(".js"));
    let n = 0;
    for (const f of files) n += scanSource(readSrc(f), f).filter((i) => i.level === "P0").length;
    expect(n, "P0 回涨说明有人新增了静默吞错，或把本批留痕删了").toBeLessThanOrEqual(39);
  });
});

describe("④ 反向对照：边界没越", () => {
  it("ui-backup-stats 的 3 处**不该被本批改**（它们是写了理由的降级 + 1 处判定器误判）", () => {
    const raw = readSrc("ui-backup-stats.js");
    expect(raw.includes("已被上面的 _exportReadFailed 点名"), ":48 的理由注释被删了 —— 有人没读理由就动它").toBe(true);
    expect(raw.includes("属预期降级，刻意不报"), ":1088 的理由注释被删了").toBe(true);
    const p0 = scanSource(raw, "ui-backup-stats.js").filter((i) => i.level === "P0");
    expect(p0.length, "这 3 条按 R-2 口径属「合理降级」，保持原样；若数量变了说明有人硬改").toBe(3);
  });

  it("ui-ge-api.js:63 仍是被刻意保留的 P0（R-38）", () => {
    const p0 = scanSource(readSrc("ui-ge-api.js"), "ui-ge-api.js").filter((i) => i.level === "P0");
    expect(p0.length).toBe(1);
    expect(p0[0].line).toBe(63);
  });

  it("其它文件里不该出现本批的留痕标记（防改串）", () => {
    const mine = ["ui-global-events.js", "data-links.js", "ui-backup-stats.js", "ui-ge-api.js",
      "ui-ge-pomodoro.js", "ui-ge-theme.js", "ui-ge-calendar.js", "ui-ge-notes.js"];
    const marks = ["theme key persist failed", "chats reload after import failed", "plugins state load failed"];
    for (const f of fs.readdirSync("src").filter((x) => x.endsWith(".js"))) {
      if (mine.includes(f)) continue;
      const raw = readSrc(f);
      for (const m of marks) {
        expect(raw.includes(m), f + " 里出现了本批留痕「" + m + "」—— 改串了").toBe(false);
      }
    }
  });
});
