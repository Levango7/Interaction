/**
 * wait-settled.cjs —— **判别式等待**（替换固定 sleep）
 * ----------------------------------------------------------------------------
 * v3.7.123 建立。背景：本仓 e2e 里曾散布 48 处 `page.waitForTimeout(ms)`。
 * 固定 sleep 是**结构性 flaky 源**，两头不讨好：
 *   · 慢机器 / CI 拥塞时不够 → 偶发红（最难查的一类：本地绿、CI 红）
 *   · 快机器上白等 → 每次跑都白扔掉几百毫秒
 *
 * 根因是同一个：**渲染是异步的**（侧栏 nav-item 由 renderSide 异步注入，实测 0 → ~30ms →
 * 10；刀 2（2026-11-16）把 7 场景 + 场景联动收进工作台 tiles 后从 17 降到 10，
 * 见 tests/ia-three-zones.test.js；场景页由 setActive + render 后异步挂内容）。等「一段时间」永远等不准，
 * 等「那个条件成立」才会既快又稳 —— 快机器上通常第一轮即命中。
 *
 * 用法约定：
 *   · 只用于**正向**等待（等某个东西出现 / 变成某个状态）
 *   · **反向断言不要用它**：「不得发出请求」「不得写入存储」这类否定式断言
 *     必须给一个真实的观察窗口（否则"还没来得及发生"会被误判成"没发生"），
 *     那种地方保留固定 sleep 并**写明理由**——见 notify-hook.spec.js ⑤、
 *     integration-push.spec.js 的用法。
 *   · 超时统一 15s（与仓内其它等待一致）；超时即红，不静默通过。
 */
"use strict";

const TIMEOUT = 15_000;

/**
 * 侧栏导航项注入完成。
 * @param {import("playwright").Page} page
 * @param {number} [min] 最少项数；默认 5（批九桌面导航收敛为 5 项：
 *        主页 / 任务 / 工作台 / 商店 / AI；10 项数据树只供移动端底栏与抽屉，
 *        `#side .nav-item` 在桌面只剩 5 个。调用方要等别的口径必须显式传值，
 *        别把默认值当历史真值）
 */
async function waitSideNav(page, min) {
  const n = typeof min === "number" ? min : 5;
  await page.waitForFunction(
    (m) => {
      try {
        return document.querySelectorAll("#side .nav-item").length >= m;
      } catch (e) {
        return false;
      }
    },
    n,
    { timeout: TIMEOUT }
  );
}

/**
 * 主内容区已渲染出真实内容（不是空壳）。
 * 用于 `setActive(x); render();` 之后 —— 那两个调用本身是同步的，
 * 但页内子块（表单 / 卡片 / 徽章）是随后挂上去的。
 */
async function waitMainRendered(page) {
  await page.waitForFunction(
    () => {
      try {
        const m = document.querySelector("#main");
        return !!m && m.children.length > 0 && (m.textContent || "").trim().length > 0;
      } catch (e) {
        return false;
      }
    },
    null,
    { timeout: TIMEOUT }
  );
}

/** 等某个选择器出现且有实际内容（比 waitForSelector 多一层"不是空壳"） */
async function waitSelectorFilled(page, selector) {
  await page.waitForFunction(
    (sel) => {
      try {
        const el = document.querySelector(sel);
        return !!el && el.getClientRects().length > 0 && (el.textContent || "").trim().length > 0;
      } catch (e) {
        return false;
      }
    },
    selector,
    { timeout: TIMEOUT }
  );
}

module.exports = { waitSideNav, waitMainRendered, waitSelectorFilled, TIMEOUT };
