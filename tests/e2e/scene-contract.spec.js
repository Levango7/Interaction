/**
 * scene-contract.spec.js —— 场景清单的**防漂移对账**（v3.7.123）
 * ----------------------------------------------------------------------------
 * 定位：helpers/scene-list.cjs 提供了静态清单，但静态清单本身也会**过期** ——
 * 它只是一份手抄的快照。没有对账的话，「源码里加了第 8 个内置场景」这件事
 * 会让三份消费方（theme-matrix / viewport）继续按老清单跑，新场景零覆盖，
 * 而全仓一片绿。这正是本次改造要堵的洞：**清单漂移 = 静默丢失覆盖**。
 *
 * 本 spec 因此把「静态快照 vs 运行时真值」钉成断言（三条，全部机械、无 sleep）：
 *   ① ORDER 对账：运行时 ORDER 与 BUILTIN_SCENES 快照**逐项且同序**一致
 *      —— 缺项 / 多项 / 换序，任一即红。
 *   ② 令牌全覆盖：SCENARIOS 里**每一个**键（含自定义场景）都必须有 `--sc-<k>`
 *      —— 新增场景忘了配令牌即红（这一条是反向的：不查固定清单，查运行时全集）。
 *   ③ 预置场景语义：finance 的定义与令牌都在，但默认**不在** ORDER
 *      —— 防止「预置场景被误塞进默认侧栏」或「定义被误删」两类回归。
 *
 * 为什么单独一个文件而不是塞进 theme-matrix：theme-matrix 关心的是
 * 「令牌对比度达不达标」，本文件关心的是「清单本身对不对」——
 * 前者是取值问题，后者是契约问题，混在 10 主题 × 8 场景的循环里会让失败信息难读。
 *
 * 视口无关（同 theme-matrix），只在 desktop 项目跑一次；已在 playwright.config.js
 * 的 tablet testIgnore 里排除，避免 e2e 时长无谓翻倍。
 *
 * 守护策略同其它 e2e：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");
const {
  BUILTIN_SCENES,
  PRESET_SCENES,
  ALL_SCENES,
  READ_ORDER_FN,
  READ_SCENARIO_KEYS_FN,
  diffOrder,
} = require("./helpers/scene-list.cjs");

const APP_URL = "./agent-workbench.html";

/** 所有用例共用的一次性导航（本 spec 只读运行时状态，不切场景、不改存储） */
async function openApp(page) {
  await page.goto(APP_URL);
  await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });
  /* 判别式等待：应用启动后才会把场景注册进 SCENARIOS/ORDER（插件注册在存储初始化之后）。
     原固定 sleep 是本仓 flaky 的共性根因（慢机不够、快机白等）——
     这里等的是「ORDER 里已有内置场景」这个**真实条件**，不是等一段时长。 */
  await page.waitForFunction(
    () => {
      try {
        return typeof ORDER !== "undefined" && Array.isArray(ORDER) && ORDER.length > 0;
      } catch (e) {
        return false;
      }
    },
    null,
    { timeout: 15_000 }
  );
}

test("① 运行时 ORDER 与内置场景快照逐项同序一致（缺/多/换序即红）", async ({ page }) => {
  await openApp(page);
  const runtime = await page.evaluate(READ_ORDER_FN);
  /* 读不到必须判失败：把它当「空清单」放过的话，这条守护会静默失效
     （与「只查 status 码」那类弱断言同族——看着绿，其实什么都没守）。
     实测这条拦住过真实情况：file:// 不挂 __test 桥时，它就是红的而不是空跑绿。 */
  expect(runtime, "运行时 ORDER 读不到 —— 检查是否源码态 / 标识符是否改名 / 取值通道是否又变了").toBeTruthy();

  const d = diffOrder(runtime, BUILTIN_SCENES);
  expect(d.missing, `快照里的场景在运行时 ORDER 中缺失：${d.missing.join(", ")}`).toEqual([]);
  expect(d.extra, `运行时 ORDER 出现了快照外的场景（源码加了新场景？同步 helpers/scene-list.cjs）：${d.extra.join(", ")}`).toEqual([]);
  expect(d.reorder, `运行时 ORDER 顺序与快照不符（顺序=侧栏显示序与滑动手势序，是契约）：运行时 ${(runtime || []).join(">")} vs 快照 ${BUILTIN_SCENES.join(">")}`).toBe(false);
});

test("② SCENARIOS 每个场景都有 --sc-<k> 令牌（新增场景漏配令牌即红）", async ({ page }) => {
  await openApp(page);
  const keys = await page.evaluate(READ_SCENARIO_KEYS_FN);
  expect(keys, "运行时 SCENARIOS 读不到").toBeTruthy();
  expect(keys.length, "SCENARIOS 一个键都没有 —— 桥返回值异常").toBeGreaterThan(0);

  const noToken = await page.evaluate((ks) => {
    const cs = getComputedStyle(document.documentElement);
    return ks.filter((k) => !String(cs.getPropertyValue("--sc-" + k) || "").trim());
  }, keys);
  expect(noToken, `以下场景在 SCENARIOS 里有定义但没有 --sc-* 令牌（对比度/渲染类断言会静默跳过它们）：${noToken.join(", ")}`).toEqual([]);

  /* 正向补一条：契约清单（含预置 finance）必须都在运行时 SCENARIOS 里，
     否则消费方遍历的场景压根不存在 —— 属于「断言了一个不存在的东西」的空转。 */
  const absent = ALL_SCENES.filter((k) => keys.indexOf(k) < 0);
  expect(absent, `契约清单里的场景在运行时 SCENARIOS 中不存在：${absent.join(", ")}`).toEqual([]);
});

test("③ 预置场景 finance：定义与令牌在，但默认不进 ORDER", async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate((presets) => {
    const cs = getComputedStyle(document.documentElement);
    const order = (typeof ORDER !== "undefined" && Array.isArray(ORDER) ? ORDER : []);
    const sc = (typeof SCENARIOS !== "undefined" ? SCENARIOS : null) || ((window.__test && window.__test.SCENARIOS) || {});
    return presets.map((k) => ({
      k,
      defined: Object.prototype.hasOwnProperty.call(sc, k),
      token: String(cs.getPropertyValue("--sc-" + k) || "").trim(),
      inOrder: order.indexOf(k) >= 0,
    }));
  }, PRESET_SCENES);

  for (const row of r) {
    expect(row.defined, `预置场景 ${row.k} 的定义不在 SCENARIOS 里（PRESET_SC_KEYS 被改或定义被删）`).toBe(true);
    expect(row.token, `预置场景 ${row.k} 没有 --sc-${row.k} 令牌 —— 它虽不在默认侧栏，但启用插件后要渲染`).not.toBe("");
    expect(row.inOrder, `预置场景 ${row.k} 默认出现在了 ORDER 里 —— 它必须等商店启用插件才进侧栏`).toBe(false);
  }
});
