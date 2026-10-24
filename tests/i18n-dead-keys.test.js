/**
 * i18n-dead-keys.test.js —— 消息字典**使用率**守护（R-36 新增，2026-10-25）
 * ----------------------------------------------------------------------------
 * 为什么需要它（`i18n-completeness` 补不上的那一半）：
 *   `i18n-completeness.test.js` 守的是**完整性** —— zh/en 两套 key 对等、值非空、
 *   源码里 `t("...")` 用到的 key 都在字典里。它回答"该翻的是否翻了"，
 *   **不回答"翻了的是否有人在用"**。于是一个键从界面上被摘掉之后，字典里那两行
 *   （zh + en）会永远躺着：不报错、不显示、只是让字典和 bundle 一直变胖，
 *   并且让后来者以为"这个功能还有文案"。
 *
 * 实测（2026-10-25，R-36 射程审计）：全字典 **3987** 个 zh 键里 **459 个零引用**
 * （11.5%）。其中一整族 42 个 `lint.*` 键（21 条规则 × msg/sug × zh/en）来自某次
 * 已经废弃的"应用内代码检查"面板 —— 面板没了，键还在，而且**一直全绿**。
 * 本批已删掉那 42 个，并把剩余死键冻成基线（棘轮只拦新增）。
 *
 * 判定口径（含两条踩过的坑）见 `tests/helpers/i18n-dead-keys.mjs`：
 *   · 动态拼接 `t("前缀." + x)` 整族豁免（实测豁免族 report.period. / tool.cat. / store.cat.）；
 *   · 含 `const MESSAGES = {` 的文件（字典自身 / Electron 构建产物副本）不是消费者；
 *   · 基线 JSON 与测试自身也不是消费者 —— 少了这条，417 个基线键会全被判成"活着"，
 *     fresh 反而从 417 涨到 483（第一版实测踩到）。
 *
 * 为什么用 vitest 而不是新的 `scripts/lint-*.mjs` + 改两条 workflow：
 *   `npm test` 已经同时挂在 ci.yml 与 deploy.yml 上，进来即双腿生效；
 *   而新增 `npm run lint:x` 要同步改 **ci.yml + deploy.yml + ci-workflow-guard 的 FULL 清单**
 *   （R4：改 workflow = 改断言，必须同提交）。`i18n-completeness` 正是这个路线。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeDeadKeys } from "./helpers/i18n-dead-keys.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(root, "tests", "i18n-dead-keys.baseline.json");

const { total, dead, dynPrefixes, corpusFiles } = computeDeadKeys();
const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, "utf8"))
  : { count: 0, keys: [] };
const baseSet = new Set(baseline.keys || []);
const fresh = dead.filter((k) => !baseSet.has(k));
/* healed = 基线里已不再是死键的（被删掉或被接上消费）—— 只报告，不算失败 */
const healed = (baseline.keys || []).filter((k) => !dead.includes(k));

describe("i18n 死键棘轮", () => {
  it("语料与字典都解析出了足够大的量（防静默退化成 0）", () => {
    expect(total, "字典键数").toBeGreaterThan(1000);
    expect(corpusFiles, "参与判定的文件数").toBeGreaterThan(20);
  });

  it("不引入新的死键（字典里有、全仓零引用）", () => {
    expect(fresh,
      `新增 ${fresh.length} 个死键：\n  ${fresh.join("\n  ")}\n` +
      `修法：① 该功能已下线 → 从 zh 与 en 两块里**同时**删掉这个键；\n` +
      `      ② 是动态拼接（t("前缀." + x)）→ 把前缀补进 helpers/i18n-dead-keys.mjs 的豁免判定；\n` +
      `      ③ 确实还要用 → 在消费处补上 t("键名")。`).toEqual([]);
  });

  it("基线本身可解析（防手改坏）", () => {
    expect(Array.isArray(baseline.keys)).toBe(true);
    expect(baseline.count).toBe((baseline.keys || []).length);
  });

  it("实测数字钉在案（供台账引用，不作为通过条件）", () => {
    /* 这条**不是**通过条件，是把量级钉在测试里 —— 将来有人问"到底多少死键"，
       跑一遍就有答案，不用重新审计。 */
    // eslint-disable-next-line no-console
    console.log(`[i18n-dead-keys] total=${total} dead=${dead.length} fresh=${fresh.length} `
      + `healed=${healed.length} dynExempt=${JSON.stringify(dynPrefixes)}`);
    expect(dead.length).toBeGreaterThanOrEqual(0);
  });
});
