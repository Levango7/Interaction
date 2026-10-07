/**
 * empty-catch-slice5.test.js —— R-2 第五片（尾栏统计谎报 + 主题配置落盘）的可观测行为用例
 * ----------------------------------------------------------------------------
 * 本片 4 处，取自 P0-a（连注释都没有）剩余 16 处里**与并行会话零交集**的部分：
 *   render-entry.js `appendFoot` / ui-drawer.js `_appendDrawerFoot`（同一逻辑的两份副本）
 *   ui-drawer.js `_moveDrawerHome`（样式清理）、ui-global-events.js 主题下拉 onchange。
 * 刻意避开 ui-backup-stats（7 处）与 render-overview（3 处）—— 那是对方在推的批次；
 * ai-tools 的 2 处是他手上未提交的改动，属禁区。
 *
 * 🔴 本片与第四片的关键区别：**这里不是「没保存」，是「谎报」**。
 *   `let recN = 0; try{ …forEach…; }catch(e){}` —— 统计失败时 recN **停在 0**，
 *   页脚于是渲染出「资料 0 条」，而数据其实都还在。用户看到的是一个**错误的数字**，
 *   比单纯的静默更糟：静默只是没说，谎报是说了假话。
 *   同理主题那处：cfg 写不进去，下面却照常 toast「已切换为跟随系统主题」。
 *   这两处与第三片 api 面的「谎报成功」是同一型，故按同一标准处理。
 *
 * 分档（同第四片）：
 *   · 两处尾栏统计 → 留痕，但尾栏**每次切页都渲染**，故只报第一次（两个副本各报各的，
 *     where 不同，便于定位是哪条渲染路径出的问题）；
 *   · 主题 cfg → 低频操作，无需一次性标记；
 *   · 样式清理 → 纯视觉偏差、不影响功能，属预期降级，**不报**，只补注释说明。
 *
 * 关于「要不要把 0 改成显 '-'」：那才是真正消灭谎报，但涉及 i18n 新增键与 e2e 文案断言，
 * 本片按「改变静默、不改变控制流」的边界不动，只把问题暴露出来（已在源码注释里写明）。
 *
 * ⚠️ 三个环境坑（前两片各踩过，这里再记一次）：
 *   ① 改完 `src/` 必须手动拼回（`node scripts/src-split.mjs && node scripts/pet-art.mjs`）——
 *      loadApp 读的是 HTML，不拼回就跑 = 跑旧代码，故障注入会假绿。
 *   ② jsdom 里 mock 要打 `Storage.prototype`（本片未用到，但同类问题通用）。
 *   ③ **`_cfgThemeSel` 不挂在 window 上**（IIFE 闭包内），主题那条只能做静态契约断言 ——
 *      探针实测 `typeof win._cfgThemeSel === "undefined"`，别浪费时间找触发入口。
 *
 * 运行：npx vitest run tests/empty-catch-slice5.test.js   （需拼回态）
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";

const readSrc = (f) => fs.readFileSync(path.resolve(process.cwd(), "src", f), "utf8");

let win, diagCalls, restoreGetRec;

/** 装探针：捕获 pushDiag 入参 */
function installDiagProbe() {
  diagCalls = [];
  Object.defineProperty(win, "pushDiag", {
    configurable: true,
    value: function (level, msg, ctx) { diagCalls.push({ level, msg, ctx }); },
  });
}

/** 让「资料条数」统计抛错（getRec 挂在 window 上，可直接换） */
function breakRecCount() {
  const orig = win.getRec;
  restoreGetRec = () => Object.defineProperty(win, "getRec", { configurable: true, value: orig });
  Object.defineProperty(win, "getRec", {
    configurable: true,
    value: function () { throw new Error("corrupt-rec"); },
  });
}

const warnOf = (where) => diagCalls.filter((d) => d.ctx && d.ctx.where === where);

beforeEach(async () => {
  win = loadApp({ storage: {} });
  await new Promise((r) => setTimeout(r, 300));
  installDiagProbe();
});

afterEach(() => {
  try { restoreGetRec && restoreGetRec(); } catch (_) { /* 每个用例都重新 loadApp，不影响 */ }
  try { win && win.close && win.close(); } catch (_) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① 尾栏「资料 N 条」统计失败 → 必须留痕（此前是谎报 0）", () => {
  it("appendFoot 失败 → pushDiag 收到 warn，带 where 与原始原因", () => {
    breakRecCount();
    expect(typeof win.appendFoot).toBe("function");

    win.appendFoot();

    const hits = warnOf("appendFoot");
    expect(hits).toHaveLength(1);
    expect(hits[0].level).toBe("warn");
    expect(String(hits[0].msg)).toMatch(/recN count failed/);
    expect(String(hits[0].msg)).toMatch(/corrupt-rec/);
  });

  it("抽屉版副本 _appendDrawerFoot 也留痕，且 **where 与 appendFoot 不同**（能分辨是哪条路径）", () => {
    breakRecCount();
    expect(typeof win._appendDrawerFoot).toBe("function");

    win._appendDrawerFoot();

    const hits = warnOf("_appendDrawerFoot");
    expect(hits).toHaveLength(1);
    expect(warnOf("appendFoot")).toHaveLength(0);   // 互不串台
  });

  it("两份副本各报一次 → 共 2 条，重复渲染不再增加（尾栏每次切页都渲染）", () => {
    breakRecCount();
    win.appendFoot();
    win._appendDrawerFoot();
    expect(diagCalls).toHaveLength(2);

    win.appendFoot();
    win._appendDrawerFoot();
    win.appendFoot();
    expect(diagCalls).toHaveLength(2);   // 一次性标记：重复渲染不刷屏
  });

  it("统计失败不阻断渲染：尾栏照常生成（本片不改控制流）", () => {
    breakRecCount();
    const main = win.document.querySelector("#main");
    expect(main).toBeTruthy();

    win.appendFoot();

    expect(main.querySelector(":scope > .foot")).toBeTruthy();
  });

  it("统计正常 → 零 diag（反向守护）", () => {
    win.appendFoot();
    win._appendDrawerFoot();
    expect(diagCalls).toHaveLength(0);
  });
});

describe("② 静态契约：主题落盘与样式清理各就各位", () => {
  it("主题 cfg 写失败要留痕（且注释点明这是谎报，不只是静默）", () => {
    const s = readSrc("ui-global-events.js");
    expect(s).toMatch(/where:"cfgThemeSel.onchange"/);
    expect(s).toMatch(/谎报成功/);
  });

  it("主题处**不用**一次性标记（低频操作，报一次就少一次线索）", () => {
    const s = readSrc("ui-global-events.js");
    const block = s.slice(s.indexOf('cfg.theme = "system"'), s.indexOf('cfg.theme = "system"') + 600);
    expect(block).toMatch(/typeof pushDiag === "function"/);
    expect(block).not.toMatch(/_Warned/);
  });

  it("样式清理保持静默，但必须写明理由（消除「作者未评估」标记）", () => {
    const s = readSrc("ui-drawer.js");
    expect(s).toMatch(/清的是\*\*旧版本残留的内联样式\*\*/);
    expect(s).toMatch(/属预期降级，不登记诊断/);
  });

  it("🔴 两份副本的一次性标记变量**不能同名**（两块拼回后共享全局作用域，同名 let = SyntaxError）", () => {
    const a = readSrc("render-entry.js");
    const b = readSrc("ui-drawer.js");
    expect(a).toMatch(/let _recCountWarnedFoot = false;/);
    expect(b).toMatch(/let _recCountWarnedDrawer = false;/);

    const names = (a + "\n" + b).match(/let (_recCountWarned\w*) = false;/g) || [];
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);   // 真的两个不同名字，不是同一串被复制
  });

  it("🔴 样式清理的说明必须写在 **catch 体内**，不能写在 try 块末尾", () => {
    /* 本片实测踩到：为了说明「为什么静默」把注释写在 `}catch` **之前**，
       那段注释会被算进 tryBody（tryBody = 左花括号到 catch 之间的全部内容）
       → sig 改变 → 门禁判「新增 P0」而 FAIL，而代码行为其实一点没变。
       这是**假失败**：门禁看起来在拦问题，实际拦的是一行注释。 */
    const s = readSrc("ui-drawer.js");
    expect(s).toMatch(/\}catch\(_\)\{ \/\* v3\.7\.102：这里清的是/);

    const lines = s.split("\n");
    const idx = lines.findIndex((l) => l.includes("这里清的是"));
    expect(idx).toBeGreaterThan(0);
    expect(lines[idx - 1].trim()).not.toMatch(/\/\*|\*\//);   // 上一行不能有注释落在 tryBody 里
  });

  it("三次留痕都带二次保护（登记诊断自身失败不能连累业务）", () => {
    const all = readSrc("render-entry.js") + readSrc("ui-drawer.js") + readSrc("ui-global-events.js");
    const guards = all.match(/typeof pushDiag === "function"/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(3);
    expect((all.match(/catch\(_e2\)\{\}/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
