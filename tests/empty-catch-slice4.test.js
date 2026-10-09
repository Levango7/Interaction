/**
 * empty-catch-slice4.test.js —— R-2 第四片（render-widgets · UI 偏好持久化面）的可观测行为用例
 * ----------------------------------------------------------------------------
 * 背景：lint-empty-catch 存量 P0 里有一类 **P0-a（连一句注释都没有 = 作者压根没评估过）**，
 * 本片取其中 **render-widgets.js 的 6 处**（22 → 16，本片清零该文件）。
 * 选这个文件而不选 ui-backup-stats（7 处最多）的理由：render-widgets 是第一片（c0a0dfe）的
 * 地盘，**与并行会话零交集**；ui-backup-stats / render-overview 是对方在动的批次，不碰。
 *
 * 本片的分档原则（不搞一刀切，是这个文件的核心判断）：
 *   · **写失败且丢的是用户自造内容**（persistCanvas 画布）→ 必须留痕；
 *   · **写失败但只是 UI 偏好**（sideCollapsed / _setPref）→ 留痕，但它们是**每次点击都走**
 *     的高频路径，次次登记会把诊断面板刷满、反而盖住真问题 → **只报第一次**；
 *   · **读失败**（918 / 3110）→ 回落默认即预期降级，**不报**，只补注释说明为什么静默。
 *   一句话：改变的是「静默」，不是「控制流」—— 写不进去依然继续，不弹 toast（配额满时
 *   弹窗打扰更糟，且与第三片 api 面的「谎报成功」性质不同：这里失败是可感知的、无害的）。
 *
 * 🔴 用例断言的是**外部可观测结果**，不是「catch 里填了日志」：
 *   ① 失败 → pushDiag 真的收到 warn，且带 where 归因；
 *   ② 高频路径**只报一次**（本片的关键设计，漏了就退化成刷屏）；
 *   ③ 失败后**控制流不变**（class 照常切换 / 不抛向外）；
 *   ④ 成功 → 零 diag（反向守护，防把降级路径做成一律报警）。
 *
 * ⚠️ 三个环境坑（各踩一次，写在这里防回头）：
 *   ① **改 src 后必须手动拼回**：`node scripts/src-split.mjs && node scripts/pet-art.mjs`。
 *      loadApp 读的是 agent-workbench.html，不拼回就跑 = 跑旧代码。
 *      本片的惨痛实证：修复写完后跑探针，diag 一条都没有，查了半天是没拼回 ——
 *      **故障注入若不红，先怀疑「跑的不是最新代码」**。
 *   ② **jsdom 里必须改 `Storage.prototype.setItem`**：直接 `win.localStorage.setItem = fn`
 *      或 `Object.defineProperty(win.localStorage, …)` 都**静默失效**（jsdom 的 Storage 是
 *      Proxy，实例层赋值不生效）—— 表现为「替换明明成功了、调用却不抛」，
 *      用例于是退化成一条都收不到的空转绿。只有打到 prototype 上才生效。
 *   ③ 本文件刻意用直跑 vitest 而非 npm test —— 避免 posttest 把工作区抽回源码态，
 *      干扰并行会话（它们可能正依赖拼回态）。
 *
 * 运行：npx vitest run tests/empty-catch-slice4.test.js   （需拼回态）
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src", "render-widgets.js");

let win, diagCalls, restoreSetItem;

/** 装探针：捕获 pushDiag 入参（用 defineProperty 更稳，见文件头坑②） */
function installDiagProbe() {
  diagCalls = [];
  Object.defineProperty(win, "pushDiag", {
    configurable: true,
    value: function (level, msg, ctx) { diagCalls.push({ level, msg, ctx }); },
  });
}

/** 让 localStorage 写一律抛错（打到 prototype，见文件头坑②） */
function breakStorageWrite() {
  const proto = win.Storage.prototype;
  const orig = proto.setItem;
  restoreSetItem = () => Object.defineProperty(proto, "setItem", { configurable: true, value: orig });
  Object.defineProperty(proto, "setItem", {
    configurable: true,
    value: function () { throw new Error("QuotaExceededError"); },
  });
}

const warnOf = (where) => diagCalls.filter((d) => d.ctx && d.ctx.where === where);

beforeEach(async () => {
  win = loadApp({ storage: {} });
  /* v3.7.105：固定 300ms 在慢机/全量并行下不够 —— 实测本文件全量跑 113s（单跑秒级），
     启动链没走完 #sideToggle 还不存在，断言 `side && toggle` 拿 null 假红（"expected null
     to be truthy"）。改为轮询等元素出现（≤8s）+ 保留原 300ms 沉淀等待（等委托绑定装好）。 */
  for (let i = 0; i < 160 && !win.document.querySelector("#sideToggle"); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await new Promise((r) => setTimeout(r, 300));   // 等启动异步链（含 setupSideToggle 的委托绑定）
  installDiagProbe();
});

afterEach(() => {
  try { restoreSetItem && restoreSetItem(); } catch (_) { /* 还原失败不影响后续：每个用例都重新 loadApp */ }
  try { win && win.close && win.close(); } catch (_) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① 侧栏折叠写失败 → 留痕，且高频路径只报一次", () => {
  it("setItem 抛错 → pushDiag 收到 warn 且带 where 归因", () => {
    breakStorageWrite();
    const side = win.document.querySelector("#side");
    const toggle = win.document.querySelector("#sideToggle");
    expect(side && toggle).toBeTruthy();

    toggle.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

    expect(warnOf("setupSideToggle")).toHaveLength(1);
    expect(diagCalls[0].level).toBe("warn");
    expect(String(diagCalls[0].msg)).toMatch(/sideCollapsed persist failed/);
    expect(String(diagCalls[0].msg)).toMatch(/QuotaExceededError/);   // 原始原因要带出来
  });

  it("连点 3 次 → 仍只有 1 条（一次性标记，防诊断刷屏）", () => {
    breakStorageWrite();
    const toggle = win.document.querySelector("#sideToggle");
    for (let i = 0; i < 3; i++) toggle.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

    expect(warnOf("setupSideToggle")).toHaveLength(1);
  });

  it("写失败不阻断控制流：collapsed 照常切换（本片不改行为）", () => {
    breakStorageWrite();
    const side = win.document.querySelector("#side");
    const toggle = win.document.querySelector("#sideToggle");
    const before = side.classList.contains("collapsed");

    toggle.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

    expect(side.classList.contains("collapsed")).toBe(!before);
  });

  it("写入成功 → 零 diag（反向守护：不能把降级路径做成一律报警）", () => {
    const toggle = win.document.querySelector("#sideToggle");
    toggle.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

    expect(diagCalls).toHaveLength(0);
  });
});

describe("② 通用偏好写入口 _setPref → 同样留痕且只报一次", () => {
  it("多个复用方连续失败 → 只登记 1 条，且 msg 带出是哪个 key", () => {
    breakStorageWrite();
    expect(typeof win.applyPetRhythm).toBe("function");
    expect(typeof win.initPetRhythmFromPref).toBe("function");

    win.applyPetRhythm("lively");
    win.applyPetRhythm("quiet");
    win.initPetRhythmFromPref();

    const hits = warnOf("_setPref");
    expect(hits).toHaveLength(1);
    expect(String(hits[0].msg)).toMatch(/pref persist failed/);
    expect(String(hits[0].msg)).toMatch(/key=petRhythm/);   // 归因到具体键，否则排查无从下手
  });

  it("_setPref 与 setupSideToggle 的一次性标记互相独立（各报 1 条，共 2 条）", () => {
    breakStorageWrite();
    win.applyPetRhythm("lively");
    win.document.querySelector("#sideToggle").dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

    expect(warnOf("_setPref")).toHaveLength(1);
    expect(warnOf("setupSideToggle")).toHaveLength(1);
    expect(diagCalls).toHaveLength(2);
  });
});

describe("③ 静态契约：另 3 处（画布 / 闹钟 / 读路径）按分档各就各位", () => {
  const src = () => fs.readFileSync(SRC, "utf8");

  it("persistCanvas（用户自造内容）与 _beepAlarm（用户可感知）都登记诊断", () => {
    const s = src();
    expect(s).toMatch(/where:"persistCanvas"/);
    expect(s).toMatch(/where:"_beepAlarm"/);
  });

  it("两处读失败保持静默，但**必须写明为什么**（消除「作者未评估」标记）", () => {
    const s = src();
    /* 读失败回落默认是预期降级：报了反而是噪声。判据 = 那两行仍是不带诊断的裸形态，
       但上方有说明注释（bare 判据认「catch 体或 try 上方」任一处有解释）。 */
    const readSites = s.match(/localStorage\.getItem\(PREFIX\+"sideCollapsed"\)/g) || [];
    expect(readSites.length).toBeGreaterThanOrEqual(2);
    expect(s).toMatch(/读失败按「未持久化」处理/);
    expect(s).toMatch(/读失败按「用户没折叠过」处理/);
  });

  it("一次性标记的两个开关都在位（漏一个就会退化成刷屏）", () => {
    const s = src();
    expect(s).toMatch(/let _sideFoldWarned = false;/);
    expect(s).toMatch(/let _setPrefWarned = false;/);
    expect(s).toMatch(/if\(!_sideFoldWarned && typeof pushDiag === "function"\)/);
    expect(s).toMatch(/if\(!_setPrefWarned && typeof pushDiag === "function"\)/);
  });

  it("二次保护：登记诊断自身也被 try 包住（诊断坏了不能连累业务）", () => {
    const s = src();
    const guards = s.match(/typeof pushDiag === "function"/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(4);
    expect((s.match(/catch\(_e2\)\{\}/g) || []).length).toBe(4);
  });
});
