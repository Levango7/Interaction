/**
 * probe-binding.test.js —— 探针捕获数组必须绑在"本次安装"上（B14）
 * ----------------------------------------------------------------------------
 * **要防的东西**（2026-11-01 实测到，不是假想）：测试用 `win.pushDiag = function (…){ diagCalls.push(…) }`
 * 这类**装在窗口上的探针**捕获诊断，而 `diagCalls` 是**模块级变量**、每个 `beforeEach` 只把它 `= []` 清空。
 * jsdom 窗口里有 fire-and-forget 的链（`_loadApiPanels()` 不 await 列表刷新、启动期异步等），
 * 上一个测试的窗口完全可能在**下一个测试装完探针之后**才 settle —— 于是迟到那条写进了新用例刚清空的数组。
 *
 * 两头症状，红只是响的那头：
 *   · `toBe(0)` 那类断言**假红**：`tests/empty-catch-slice3.test.js:160` 就是这么红的
 *     （CI `41311047198` windows 腿 `1 failed / 2398 passed`，received 1；同树 ubuntu 绿、本机单跑 9/9 绿）。
 *   · `toBeGreaterThan(0)` 那类断言**假绿**：「失败必须让用户看见」这条契约没接上，
 *     也能靠上一例的迟到条目过。**这一头更贵，因为不会响。**
 *
 * **判据**（按形状，不按名字）：某标识符同时满足两条就算违规 ——
 *   ① 列 0 声明（模块级）；② **被某个装在窗口上的包装函数往里 push**。
 *   不要求"清空必须写成 `X = []`"：泄漏的前提是**包装读的是模块级绑定**，
 *   清空语句写成 `X = []` 还是 `X = d` 一样会串（这条是变异实验教出来的，见 ②-3）。
 * 正当形状不误报：`const d = []` 绑在本次安装上、包装 push 的是 `d`（slice3/slice4 的修法）、
 * `windows = []` + `windows.push(win)` 那种窗口登记表（push 点不在包装函数体内）。
 * 现测（2026-11-01 扫 224 个 `tests/*.test.js`）：违规 **13** 个，全在 empty-catch 这一族；
 * 判据从三条收到两条，抓到的还是同一批 13 个 ⇒ 说明抓的是形状而不是字符串巧合。
 *
 * **不碰 workflow**：本文件进 `npm test` 就自动在 CI 上跑（改 ci.yml = 改断言，须另拍板）。
 * 基线只许缩不许涨：改好一个就把那行从 `BASELINE` 删掉，留着不删也算红（防空转）。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SELF = "probe-binding.test.js";
const DIR = path.resolve(process.cwd(), "tests");

/** 已知的存量违规（2026-11-01 现测，13 个）。修好一个删一行。 */
const BASELINE = [
  "empty-catch-ai-tools.test.js",
  "empty-catch-slice10.test.js",
  "empty-catch-slice11.test.js",
  "empty-catch-slice13.test.js",
  "empty-catch-slice14.test.js",
  "empty-catch-slice15.test.js",
  "empty-catch-slice16.test.js",
  "empty-catch-slice18.test.js",
  "empty-catch-slice5.test.js",
  "empty-catch-slice6.test.js",
  "empty-catch-slice7.test.js",
  "empty-catch-slice8.test.js",
  "empty-catch-slice9.test.js",
].sort();

/** 列 0 的顶层声明 ⇒ 模块级标识符（缩进声明是函数局部，不算） */
function moduleLevelNames(src) {
  const names = new Set();
  for (const line of src.split(/\r?\n/)) {
    const m = /^(?:let|const|var)\s+(.+?);?\s*$/.exec(line);
    if (!m) continue;
    for (const part of m[1].split(",")) {
      const n = part.trim().split(/[\s=]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  return names;
}

/** 从 open（指向 `{`）起做花括号配对，返回整块文本 */
function braceBlock(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return src.slice(open);
}

/** 找"装在窗口上的探针包装函数"的函数体：`win.pushDiag = function(…){…}` / `= (…) => …`
 *  以及 `Object.defineProperty(win, "toast", { value: function (…){…} })` 这两种写法。 */
function wrapperBodies(src) {
  const HEADER = /(?:\bwin|\bw|\.window)\.[A-Za-z_$][\w$]*\s*=\s*(?:async\s+)?(?:function\s*\([^)]*\)\s*|\(([^)]*)\)\s*=>\s*|([A-Za-z_$][\w$]*)\s*=>\s*)|value\s*:\s*(?:async\s+)?(?:function\s*\([^)]*\)\s*|\(([^)]*)\)\s*=>\s*|([A-Za-z_$][\w$]*)\s*=>\s*)/g;
  const out = [];
  let m;
  while ((m = HEADER.exec(src)) !== null) {
    const after = m.index + m[0].length;
    if (src[after] === "{") {
      out.push(braceBlock(src, after));
      HEADER.lastIndex = after;                       // 跳过整块，嵌套不重复命中
    } else {
      const end = src.indexOf("\n", after);
      out.push(src.slice(after, end < 0 ? src.length : end));   // 表达式体：到行尾
    }
  }
  return out;
}

/** 返回该源码里的违规标识符（可能多个）：模块级声明 + 被窗口上的包装函数往里 push */
function offenders(src) {
  const names = moduleLevelNames(src);
  const bodies = wrapperBodies(src);
  const hits = new Set();
  for (const n of names) {
    for (const b of bodies) {
      if (new RegExp(`\\b${n}\\.(?:push|unshift)\\s*\\(`).test(b)) { hits.add(n); break; }
    }
  }
  return [...hits].sort();
}

function scanAll() {
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".test.js") && f !== SELF).sort();
}

function currentOffenders() {
  const bad = [];
  for (const f of scanAll()) {
    if (offenders(fs.readFileSync(path.join(DIR, f), "utf8")).length) bad.push(f);
  }
  return bad;
}

describe("① 判据自带射程（正向：违规形状必须被抓到）", () => {
  const BAD_FUNC = [
    'let win, diagCalls;',
    'function installProbes() {',
    '  diagCalls = [];',
    '  win.pushDiag = function (level, msg, ctx) { diagCalls.push({ level, msg, ctx }); };',
    '}',
  ].join("\n");
  const BAD_ARROW = [                                  // defineProperty + 表达式体箭头（slice9/10/11 的真实形状）
    'let win, toasts, diagCalls;',
    'function installProbes() {',
    '  toasts = [];',
    '  diagCalls = [];',
    '  Object.defineProperty(win, "toast", { configurable: true, value: (msg, kind) => toasts.push({ msg, kind }) });',
    '  Object.defineProperty(win, "pushDiag", { configurable: true, value: (level, msg, ctx) => diagCalls.push({ level, msg, ctx }) });',
    '}',
  ].join("\n");

  it("function 型包装 push 模块级数组 ⇒ 判红", () => {
    expect(offenders(BAD_FUNC)).toEqual(["diagCalls"]);
  });

  it("defineProperty + 箭头表达式体 ⇒ 两个数组都判红（判据不挑写法）", () => {
    expect(offenders(BAD_ARROW)).toEqual(["diagCalls", "toasts"]);
  });
});

describe("② 反向对照：正当形状不许误报", () => {
  const GOOD_LOCAL = [                                 // slice3/slice4 的修法：绑在本次安装的局部量上
    'let win, diagCalls;',
    'function installProbes() {',
    '  const d = [];',
    '  diagCalls = d;',
    '  win.pushDiag = function (level, msg, ctx) { d.push({ level, msg, ctx }); };',
    '}',
  ].join("\n");
  const GOOD_REGISTRY = [                              // 34 个文件共有的窗口登记表：push 点不在包装函数体内
    'let windows;',
    'beforeEach(() => {',
    '  windows = [];',
    '  const w = loadApp();',
    '  windows.push(w);',
    '  w.pushDiag = function (level, msg) { w.__diag.push({ level, msg }); };',
    '});',
    'afterEach(() => windows.forEach((w) => w.close()));',
  ].join("\n");

  it("数组绑在本次安装的局部量上 ⇒ 不判（这正是要求的修法）", () => {
    expect(offenders(GOOD_LOCAL)).toEqual([]);
  });

  it("模块级数组只做窗口登记、push 不在包装函数体内 ⇒ 不判（否则整仓误报，门会被关掉）", () => {
    expect(offenders(GOOD_REGISTRY)).toEqual([]);
  });

  it("变异自证：把修好的形状改回读模块级变量，必须立刻被判（判据活在 push 的目标上，不在清空语句上）", () => {
    const mutated = GOOD_LOCAL.replace("d.push({ level, msg, ctx })", "diagCalls.push({ level, msg, ctx })");
    expect(offenders(GOOD_LOCAL), "改之前不该有违规").toEqual([]);
    expect(offenders(mutated), "改回旧写法必须被抓到").toEqual(["diagCalls"]);
  });
});

describe("③ 现网对账", () => {
  it("扫描集合非空（对准空集合的门比没门更坏）", () => {
    expect(scanAll().length).toBeGreaterThan(100);
  });

  it("违规清单必须与 BASELINE 逐条相等：新增判红，改好没删也判红", () => {
    const cur = currentOffenders();
    const added = cur.filter((f) => !BASELINE.includes(f));
    const stale = BASELINE.filter((f) => !cur.includes(f));
    expect(added, "新写进探针却把捕获数组绑在模块级变量上 ⇒ 会造假绿；改法是 const 局部数组再赋值给模块级变量").toEqual([]);
    expect(stale, "这些文件已经修好了，把对应行从 BASELINE 删掉（留着基线会让守卫空转）").toEqual([]);
  });

  it("本批修好的 slice3 / slice4 不许回潮（它们是最早发现的两处）", () => {
    for (const f of ["empty-catch-slice3.test.js", "empty-catch-slice4.test.js"]) {
      expect(offenders(fs.readFileSync(path.join(DIR, f), "utf8")), f + " 又变回模块级绑定了").toEqual([]);
    }
  });

  it("守卫自己不在扫描面里，但豁免不许用来藏自己的债", () => {
    // 夹具里那些样例源码（`let win, diagCalls;` / `diagCalls = [];` / `diagCalls.push(...)`）
    // 理论上会让扫描器命中自己，所以先把 SELF 排除出扫描面 —— 但排除不等于允许：
    // 本文件自己必须也是干净形状，否则这条豁免就是在藏债。
    expect(scanAll()).not.toContain(SELF);
    expect(offenders(fs.readFileSync(path.join(DIR, SELF), "utf8")),
      "probe-binding.test.js 自己就写了违规形状（豁免不该用来藏债）").toEqual([]);
  });
});
