/**
 * visual-global-teardown.cjs —— 模板 globalTeardown 桥（双态架构项目专用，其他项目自动空转）
 * ----------------------------------------------------------------------------
 * 职责：与 visual-global-setup.cjs 对称 —— **只抽回本轮 visual 运行自己拼回的状态**，
 * 跑完把工作区还原成源码态，不让使用者（也不让并行会话）踩「提交前工作区必须源码态」
 * 「拼回态禁跑 npm test / lint」这两条铁律的坑。
 *
 * 判定协议（标记文件 verify-out/.visual-injected，由 setup 桥在本轮真拼回时写下）：
 *   · 无标记 → 静默返回（非双态项目 / 用户本就交付态 / 上一轮已抽回）；
 *   · 有标记 → 读完即删，然后按仓库文档链顺序抽回：
 *       node scripts/pet-art.mjs --extract && node scripts/src-split.mjs --extract --no-backup
 *   · 抽回失败 → console.error 大声报 + 明确人话，**禁止静默**；
 *   · 标记在但双态脚本不见了（仓库结构被改）→ 同样大声报，不静默跳过。
 *
 * 为什么不在 teardown 里直接按体积判断：用户可能本就故意停留在交付态（那不是我们改的），
 * 体积判断会把他的工作区也抽掉；标记文件精确表达「这一态是 visual 运行造成的」。
 * 陈旧标记（上轮 teardown 没跑成，如被 globalTimeout 杀掉）会在下一轮被消费并抽回 ——
 * 这是有意的恢复语义，源码态是仓库的提交常态。
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PET_ART = path.join(PROJECT_ROOT, "scripts", "pet-art.mjs");
const SRC_SPLIT = path.join(PROJECT_ROOT, "scripts", "src-split.mjs");
const MARKER = path.join(PROJECT_ROOT, "verify-out", ".visual-injected");

module.exports = async () => {
  /* 无标记 = 本轮没有拼回过 → 静默跳过（非双态项目的干跑路径就走这里，不报错） */
  if (!fs.existsSync(MARKER)) return;

  /* 读完即删：无论抽回成败，标记只消费一次 */
  let note = "";
  try { note = fs.readFileSync(MARKER, "utf8").trim().split("\n")[0]; } catch (e) { /* 内容读不到不影响判定 */ }
  try { fs.unlinkSync(MARKER); } catch (e) { /* 删不掉不阻塞抽回 */ }

  /* 双态脚本存在性守卫（与 setup 桥同口径）：标记在但脚本没了 = 仓库结构异常，大声报 */
  if (!fs.existsSync(PET_ART) || !fs.existsSync(SRC_SPLIT)) {
    console.error("[visual globalTeardown] 检测到本轮拼回标记（" + note + "），但找不到 scripts/pet-art.mjs 或 scripts/src-split.mjs。");
    console.error("[visual globalTeardown] 无法自动抽回：工作区可能停留在拼回态，请手动 npm run src:extract");
    return;
  }

  console.log("[visual globalTeardown] 本轮由 visual 运行拼回（" + note + "）—— 按文档链顺序抽回源码态。");
  const r1 = spawnSync(process.execPath, [PET_ART, "--extract"], { cwd: PROJECT_ROOT, stdio: "inherit" });
  if (r1.status !== 0) {
    console.error("[visual globalTeardown] pet-art --extract 失败（exit=" + r1.status + "）。");
    console.error("[visual globalTeardown] 工作区可能停留在拼回态，请手动 npm run src:extract");
    return;
  }
  const r2 = spawnSync(process.execPath, [SRC_SPLIT, "--extract", "--no-backup"], { cwd: PROJECT_ROOT, stdio: "inherit" });
  if (r2.status !== 0) {
    console.error("[visual globalTeardown] src-split --extract 失败（exit=" + r2.status + "）。");
    console.error("[visual globalTeardown] 工作区可能停留在拼回态，请手动 npm run src:extract");
    return;
  }
  console.log("[visual globalTeardown] 已抽回源码态（提交前工作区洁净）。");
};
