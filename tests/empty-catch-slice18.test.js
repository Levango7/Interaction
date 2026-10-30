/**
 * empty-catch-slice18.test.js —— R-2 续集第五片：`ui-drawer.js` + `render-widgets.js`（B12）
 * ----------------------------------------------------------------------------
 * 片内共 9 处 P0，**只修 2 处，其余 7 处判为「理由成立、不动」**。与 slice17 同一分寸：
 * 数字降得少，但每条判断都留了原文，后人要改先读理由。
 *
 * 修的 2 处（共同后果：**界面说成功，磁盘上没有** —— 刷新即失，且与「用户没做过」同形）：
 *   ① `ui-drawer.js` `saveCfg()` 的待续意图外层 catch（原 :640）：
 *      读坏/解析坏时，用户点「在 AI 助手中讨论」带过来的那句提示词被静默丢弃，
 *      界面只表现为「没自动续上」。→ `saveCfg.pendingAiAsk` 留痕。
 *   ② `render-widgets.js` `restoreFromRecycleBin()` 的 AI Profile 分支（原 :1081）：
 *      `persistCfg(...).catch(()=>{})` 吞掉落盘失败，而 `_cfgCache` 已改 ⇒ 回收站「恢复成功」
 *      只是内存态，刷新后那条 Profile 又没了。→ `restoreRecycle.profileCfg` 留痕（两种失败形态都覆盖）。
 *
 * 不动的 7 处及理由（本文件用断言钉住理由原文，防「顺手改掉」）：
 *   · `ui-drawer.js:431` 清旧版本残留内联样式 —— 清不掉只是视觉偏差，注释已论证「属预期降级」；
 *   · `ui-drawer.js` 三处 `localStorage.removeItem(__pendingAiAsk)` —— 清不掉只会让过期的待续意图
 *     多留一轮，5 分钟窗口内自动作废，无副作用；
 *   · `render-widgets.js` 两处 `getItem(sideCollapsed)` 读 —— 读失败按「未持久化」处理（保持展开），
 *     **写**侧早就有 `sideExpanded persist failed` 留痕（slice17 钉着）；
 *   · `render-widgets.js` 宠物浮层 `artImg.decode().catch` —— 解码失败由 180 帧重试窗口兜住
 *     （v3.7.81 注释说明 1s 太短、3s 才够），不留痕不丢功能。
 *
 * ⚠️ 本片**只补可观测性、不动控制流**：两处都不新增返回值、不改调用方分支。
 * ⚠️ 全仓正则：本文件不用正则（slice17 踩过「shell 吃掉反斜杠导致断言恒真」）。
 *
 * 运行：npm run test:local -- tests/empty-catch-slice18.test.js
 */
import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { loadApp } from "./helpers/loadApp.js";
import { scanSource } from "../scripts/lib/empty-catch.mjs";

const PREFIX = "wb_agent_";
const readSrc = (f) => fs.readFileSync("src/" + f, "utf8");

let win, diag;
function boot(storage) {
  win = loadApp({ storage: storage || {} });
  diag = [];
  const orig = win.pushDiag;
  win.pushDiag = function (level, msg, ctx) {
    diag.push({ level, msg: String(msg), ctx });
    return orig && orig.apply(win, arguments);
  };
  return win;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

beforeEach(() => { win = null; diag = []; });

describe("① saveCfg：待续意图解析形态不符必须留痕（坏 JSON 由 load() 自己记，见用例 ③）", () => {
  /* ⚠️ 存储里的形态有两种，别写错 fixture（第一版就写错过，红出来才发现）：
     · 生产写入路径是 `save(k, JSON.stringify(obj))`，而 `save()` 内部再 `JSON.stringify(v)` 一次
       ⇒ 存储里是**双重编码**：load() 解一层得到字符串，`JSON.parse(raw)` 再解一层拿到对象 —— **正常**。
     · 若某写入方直接 `save(k, obj)` 或云同步/备份恢复写回**单重编码**的对象，则 load() 直接返回对象，
       `JSON.parse(raw)` 对对象求值 ⇒ 抛错 ⇒ 这句提示词被静默丢弃。本用例打的就是这一支。 */
  const CFG = {
    enabled: true,
    profiles: [{ id: "p1", name: "x", base: "http://127.0.0.1:11434/v1", key: "sk-test", model: "qwen" }],
    activeId: "p1",
  };
  function bootWithPending(storedValue) {
    boot({ [PREFIX + "cfg"]: JSON.stringify(CFG), [PREFIX + "__pendingAiAsk"]: storedValue });
    return (async () => {
      await tick(60);
      const d = win.document;
      d.getElementById("cfgEnabled").checked = true;
      d.getElementById("cfgBase").value = "http://127.0.0.1:11434/v1";
      d.getElementById("cfgKey").value = "sk-test";
      d.getElementById("cfgModel").value = "qwen";
    })();
  }

  it("单重编码（load 直接给对象）⇒ 一条 warn，where=saveCfg.pendingAiAsk，保存本身照常成功", async () => {
    await bootWithPending(JSON.stringify({ sc: "office", ts: Date.now() }));
    await win.__test.saveCfg();
    const hit = diag.find((x) => x.msg.indexOf("pending AI ask unreadable") > -1);
    expect(hit, "形态不符被吞掉了：用户点过的提示词丢了，日志里一个字都没有").toBeTruthy();
    expect(hit.level).toBe("warn");
    expect(hit.ctx && hit.ctx.where).toBe("saveCfg.pendingAiAsk");
    expect(win.__test.getCfg().enabled, "留痕不得把保存流程打断").toBe(true);
  });

  it("反向对照：生产形态（双重编码）⇒ 待续意图正常读出，一条 warn 都不许有", async () => {
    /* 双重编码 = save() 对字符串再 stringify 一次，这正是四条写入方（ai-retry ×2 / render-overview /
       data-links 注册表）经 save() 落盘的真实形态。 */
    await bootWithPending(JSON.stringify(JSON.stringify({ sc: "office", ts: Date.now() })));
    await win.__test.saveCfg();
    expect(diag.filter((x) => x.msg.indexOf("pending AI ask unreadable") > -1), "正常路径不许刷 warn").toEqual([]);
    /* 正常路径的副作用：读到了就删（5 分钟窗口内的待续意图已被消费） */
    expect(win.localStorage.getItem(PREFIX + "__pendingAiAsk"), "正常消费后应清掉该键").toBeNull();
  });

  it("坏 JSON ⇒ 由 load() 自己留痕（where=load），本处不触发：两支射程写清楚", async () => {
    await bootWithPending("{ 这不是 JSON");
    await win.__test.saveCfg();
    const loadHit = diag.find((x) => x.msg.indexOf("load parse error") > -1);
    expect(loadHit, "坏数据并非完全静默：load() 自己记 —— 这条假如也丢了，才是真·黑洞").toBeTruthy();
    expect(loadHit.ctx && loadHit.ctx.where).toBe("load");
    expect(diag.filter((x) => x.msg.indexOf("pending AI ask unreadable") > -1), "坏 JSON 在 load 层就返回默认值，本处看不见它").toEqual([]);
  });
});

describe("② restoreFromRecycleBin：恢复的 AI Profile 没落盘必须留痕（两种失败形态）", () => {
  const ITEM = {
    id: "recycle_t1",
    type: "config",
    title: "x",
    deletedAt: Date.now(),
    data: { kind: "profile", profile: { id: "p-restored", name: "r", base: "https://a", key: "sk-x", model: "m" } },
  };
  function seedItem() {
    win.localStorage.setItem(PREFIX + "recycle_bin", JSON.stringify([ITEM]));
  }

  it("persistCfg 返回 false ⇒ warn，where=restoreRecycle.profileCfg", async () => {
    boot();
    await tick(60);
    seedItem();
    win.persistCfg = () => Promise.resolve(false);
    const r = win.restoreFromRecycleBin("recycle_t1");
    expect(r && r.ok, "恢复本身仍要报成功（控制流不变）").toBe(true);
    await tick(0);
    const hit = diag.find((x) => x.msg.indexOf("not persisted (save returned false)") > -1);
    expect(hit, "返回 false 被当成成功：界面说恢复了，刷新就没了").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("restoreRecycle.profileCfg");
    /* 反向：此时磁盘上确实没有这条 profile（证明留痕不是噪声） */
    const raw = win.localStorage.getItem(PREFIX + "cfg") || "";
    expect(raw.indexOf("p-restored"), "本用例的前提是「真没落盘」").toBe(-1);
  });

  it("persistCfg reject ⇒ 同样留痕（带原始错误文本）", async () => {
    boot();
    await tick(60);
    seedItem();
    win.persistCfg = () => Promise.reject(new Error("QuotaExceededError"));
    win.restoreFromRecycleBin("recycle_t1");
    await tick(0);
    const hit = diag.find((x) => x.msg.indexOf("restored AI profile not persisted: ") > -1);
    expect(hit, "reject 被吞：落盘失败完全静默").toBeTruthy();
    expect(hit.msg).toContain("QuotaExceededError");
    expect(hit.ctx && hit.ctx.where).toBe("restoreRecycle.profileCfg");
  });

  it("反向对照：persistCfg 正常 ⇒ 没有本批的 warn", async () => {
    boot();
    await tick(60);
    seedItem();
    win.persistCfg = () => Promise.resolve(true);
    win.restoreFromRecycleBin("recycle_t1");
    await tick(0);
    expect(diag.filter((x) => x.msg.indexOf("restored AI profile not persisted") > -1)).toEqual([]);
  });
});

describe("③ 源码契约：留痕可查、唯一、带二次保护；7 处理由原文不许被删", () => {
  const EXPECT = [
    ["ui-drawer.js", "pending AI ask unreadable, prompt lost", "saveCfg.pendingAiAsk"],
    ["render-widgets.js", "restored AI profile not persisted (save returned false)", "restoreRecycle.profileCfg"],
  ];

  it("每条都能找到 pushDiag + 正确 where + 二次保护（indexOf，不用正则）", () => {
    for (const [f, msg, where] of EXPECT) {
      const raw = readSrc(f);
      const at = raw.indexOf(msg);
      expect(at, f + " 的「" + msg + "」被删了 —— 留痕没了，这条 P0 会悄悄回来").toBeGreaterThan(-1);
      const near = raw.slice(Math.max(0, at - 200), at + 400);
      expect(near.indexOf('where: "' + where + '"') > -1 || near.indexOf('where:"' + where + '"') > -1,
        f + " 的 where 应为 " + where).toBe(true);
      expect(near.indexOf("pushDiag") > -1, f + " 附近没有 pushDiag").toBe(true);
      expect(near.indexOf("catch(_e") > -1, f + " 缺二次保护（上报自己抛错会变未处理拒绝）").toBe(true);
    }
  });

  it("两条消息在整仓内各出现一次（防复制粘贴到别处造成假绿）", () => {
    let all = "";
    for (const f of fs.readdirSync("src").filter((x) => x.endsWith(".js"))) all += readSrc(f);
    for (const [, msg] of EXPECT) {
      const first = all.indexOf(msg);
      expect(first > -1).toBe(true);
      expect(all.indexOf(msg, first + 1), "「" + msg + "」出现了不止一次").toBe(-1);
    }
  });

  it("7 处「判过合理」的理由原文必须还在", () => {
    const drawer = readSrc("ui-drawer.js");
    const widgets = readSrc("render-widgets.js");
    const REASONS = [
      [drawer, "属预期降级，不登记诊断"],
      [drawer, "清不掉只会让过期意图多留一轮"],
      [widgets, "读失败按「未持久化」处理"],
      [widgets, "读失败按「用户没折叠过」处理"],
      [widgets, "解码兜底"],
    ];
    for (const [raw, r] of REASONS) {
      expect(raw.indexOf(r) > -1, "理由注释「" + r + "」被删了 —— 那处就不能再算「判过合理」").toBe(true);
    }
  });
});

describe("④ 计数锁：全仓 P0 26 → 24（本片 −2）", () => {
  it("全仓 P0 总数 ≤ 24", () => {
    let n = 0;
    for (const f of fs.readdirSync("src").filter((x) => x.endsWith(".js"))) {
      n += scanSource(readSrc(f), f).filter((i) => i.level === "P0").length;
    }
    expect(n, "P0 回涨说明有人新增静默吞错，或把本片留痕删了").toBeLessThanOrEqual(24);
  });

  it("ui-drawer 剩 4 处、render-widgets 剩 3 处、data-links 为 0（计划里那条已不成立，见下）", () => {
    /* data-links 原排期写「2 处值得动」，实测为 0：WorkBuddy 的 B11 结案（save() 不吞错、
       调用方留痕是死代码但保留）之后，该文件已无可消解的 P0。此处把「0」钉住，
       免得后人照旧排期又去找那两条不存在的条目。 */
    const cnt = (f) => scanSource(readSrc(f), f).filter((i) => i.level === "P0").length;
    expect(cnt("ui-drawer.js")).toBe(4);
    expect(cnt("render-widgets.js")).toBe(3);
    expect(cnt("data-links.js")).toBe(0);
  });
});
