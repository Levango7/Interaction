/**
 * scene-list.cjs —— 场景清单的**单一事实来源**（e2e 侧）
 * ----------------------------------------------------------------------------
 * v3.7.123 建立。背景：改造前 e2e 里有 **三份各自硬编码的场景清单**，且互不一致：
 *
 *   · theme-matrix.spec.js  8 项  office design study data code life health finance
 *   · viewport.spec.js(:314) 7 项  design study data  life  health finance office      ← 漏 code
 *   · viewport.spec.js(:373) 7 项  data office study life  health finance code        ← 漏 design
 *
 * 这不是风格问题，是**覆盖漏洞**：漏掉的那个场景在对应断言组里永远不被检查，
 * 而三份清单又各自写死，新增/改名场景时没人会想起同步三处 ——
 * 与「菜单清单写死」（toolbox.spec.js 曾犯）同源，属**清单漂移**。
 *
 * 本文件把清单收敛成一处，并给出**运行时对账**入口（见 diffOrder / readRuntime）：
 * 静态快照供 spec 离线遍历，运行时值供断言对账 —— 两者不一致即红。
 *
 * ── 为什么分「内置」与「预置」两类 ──────────────────────────────────────────
 * 内置场景（BUILTIN_SCENES）恒定出现在 ORDER（侧栏 / 滑动手势序）里；
 * 预置场景（PRESET_SCENES）**定义常驻但默认不进 ORDER** —— 理财（finance）即此类：
 * SCENARIOS.finance 始终有定义、`--sc-finance` 令牌每套主题都有值、
 * setActive("finance") 也不抛错，**只在商店启用「理财助手」插件后才进侧栏**。
 *
 * 于是「遍历所有场景」类断言（对比度 / 布局 / 触控高度）**必须用 ALL_SCENES**：
 * 只跑 ORDER 会漏掉 finance 的令牌与渲染；只写死 7 个内置同样漏。
 *
 * ── 顺序 ────────────────────────────────────────────────────────────────────
 * BUILTIN_SCENES 的顺序**是契约**：它等于 `src/core-shared.js` 的 ORDER 常量
 * （v3.7.132 起；此前在 core.js —— 拆块是纯位移，常量本身没动）
 * （侧栏场景组显示序 + 左右滑动手势序），所以对账按 `toEqual`（含顺序），
 * 不用集合比较 —— 顺序被改也是回归。
 */
"use strict";

/**
 * 内置场景契约快照 —— 对应 `src/core-shared.js` 的 `const ORDER = [...]`
 * （v3.7.132 起；原在 core.js:8232，拆块后行号不再稳定，故只记块名不记行号）
 * 与 src/data-links.js 的 BUILTIN_SC_KEYS（同一组，顺序不同；本快照取 ORDER 序）。
 * 改动这里之前先改源码，再跑 tests/e2e/scene-contract.spec.js 对账。
 */
const BUILTIN_SCENES = ["office", "data", "design", "study", "code", "life", "health"];

/**
 * 预置（插件启用后才进 ORDER）场景 —— 对应 src/data-links.js 的 PRESET_SC_KEYS。
 * 定义与 --sc-* 令牌无条件存在，故遍历型断言要带上。
 */
const PRESET_SCENES = ["finance"];

/** 全量场景：内置 + 预置。遍历型断言一律用这份。 */
const ALL_SCENES = BUILTIN_SCENES.concat(PRESET_SCENES);

/**
 * 页面内求值函数：读运行时 ORDER。
 *
 * ⚠ 取值通道（v3.7.123 实测踩坑）：本仓 e2e 走 `file://` 直加载，而 `__TEST_GATE__`
 * **已不再把 file:// 算作测试上下文**（安全收紧：避免最终用户本地双击打开时
 * devtools 能摸到内部函数）。所以 `window.__test` 桥在 e2e 里是 **undefined** ——
 * 现存的 e2e spec 全都是直接引用顶层裸标识符（`setActive` / `_buildSideMenu` …），
 * 正是这个原因。这里同法：`ORDER` / `SCENARIOS` 是顶层 const，不在 window 上，
 * 但在全局词法作用域里，page.evaluate 的函数体能直接看到。
 * 仍保留 window.__test 兜底，供将来改走 localhost 服务模式时无痛切换。
 *
 * 返回 null 表示读不到（源码态 / 标识符改名）——
 * 调用方必须把 null 当**失败**，不能当「空清单」放过（否则守护静默失效）。
 */
const READ_ORDER_FN = () => {
  try {
    if (window.__test && Array.isArray(window.__test.ORDER)) return window.__test.ORDER.slice();
    if (typeof ORDER !== "undefined" && Array.isArray(ORDER)) return ORDER.slice();
    return null;
  } catch (e) {
    return null;
  }
};

/** 页面内求值函数：读运行时 SCENARIOS 的全部键（含自定义场景）。取值通道同上。 */
const READ_SCENARIO_KEYS_FN = () => {
  try {
    const s = (window.__test && window.__test.SCENARIOS) || (typeof SCENARIOS !== "undefined" ? SCENARIOS : null);
    return s ? Object.keys(s) : null;
  } catch (e) {
    return null;
  }
};

/**
 * 对账：运行时 ORDER vs 静态快照（**顺序敏感**）。
 * @returns {{ok: boolean, missing: string[], extra: string[], reorder: boolean, runtime: string[]|null}}
 */
function diffOrder(runtime, snapshot) {
  const snap = Array.isArray(snapshot) ? snapshot : BUILTIN_SCENES;
  if (!Array.isArray(runtime)) {
    return { ok: false, missing: [], extra: [], reorder: false, runtime: null, unreadable: true };
  }
  const missing = snap.filter((k) => runtime.indexOf(k) < 0);
  const extra = runtime.filter((k) => snap.indexOf(k) < 0);
  const common = (a, b) => a.filter((k) => b.indexOf(k) >= 0);
  /* 顺序只比对交集：缺/多的项会先报 missing/extra，顺序噪音重复报没意义 */
  const ri = common(runtime, snap);
  const si = common(snap, runtime);
  const reorder = ri.join(",") !== si.join(",");
  return { ok: missing.length === 0 && extra.length === 0 && !reorder, missing, extra, reorder, runtime };
}

module.exports = {
  BUILTIN_SCENES,
  PRESET_SCENES,
  ALL_SCENES,
  READ_ORDER_FN,
  READ_SCENARIO_KEYS_FN,
  diffOrder,
};
