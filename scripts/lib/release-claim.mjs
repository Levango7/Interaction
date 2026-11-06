/**
 * release-claim.mjs —— 切版路径的板面认领门（`scripts/release.mjs` 的前置）
 * ----------------------------------------------------------------------------
 * 为什么要它：`docs/agent-board.md` 铁律第 5 条把版本源那一组文件列为「高共写/高破坏面」，
 * 动之前**必须**在登记表里声明一行。而切版恰好是全仓共写面最大的一次改动（一口气写 9 个文件），
 * 却长期只靠记性执行 —— 2026-11-05 实测：`0e6b760`（切 v3.7.154）动了 9 个文件、其中 6 个在铁律
 * 第 5 条的清单里，**没有任何板面声明**；对照 ZCode 切 v3.7.153 是有登记行的（表内 `2026-11-03 05:10`）。
 * 根因不是"不知道规矩"，是规矩没有机械判据。
 *
 * 形态由用户 2026-11-05 拍板为「拒冲突 + 自动登记」，2026-11-06 订正登记行的状态：
 *   · 他人握有覆盖发版路径的 ACTIVE 行 ⇒ 切版直接失败（判定复用 claim-check 的三面 `collectActive`，
 *     不另造一套：那三面分别是我的工作文件 / `origin/main` / 其它**脏**工作树）；
 *   · 无冲突 ⇒ 由脚本自己往登记表追加一行**生而 RELEASED** 的审计行。
 *     「声明」不再依赖记性，漏项机械上不会再发生。
 *
 * 为什么登记行生而 RELEASED（v3.7.155 事故的订正，2026-11-06）：
 *   v3.7.155 的发版提交里带了 D1 自动登记的 **ACTIVE** 行，而 E3 接进 CI 的认领门
 *   （`claim-check-ci.mjs`）在 CI 里取的会话身份是**提交作者名**（本仓全员同为 `Levango7`），
 *   与登记行里写的会话名**永不匹配** ⇒ 发版提交自己的 9 条 RELEASE_PATHS 全被自判为「他人占用」，
 *   首推 CI/Deploy 双红（`42130755022` / `42130755030`），靠补笔翻 RELEASED 重推才解。
 *   ACTIVE 自登记行的「保护」价值在 CI 侧是负数：它拦不住别人（别人的推不经过我的会话名），
 *   只拦得住发版提交自己。RELEASED 行任何门都不消费，登记照样留痕（铁律第 5 条的声明义务
 *   由「落一行」本身履行，不依赖那行持续 ACTIVE）。
 *
 * 本模块是**纯函数**（不碰 fs / 不 spawn），因此可直接单测；真接线在 release.mjs 里。
 */
import { BOARD, SECTION, parseTable, renderClaimRow, insertClaimRow } from "../claim-check.mjs";

/** 切版会写到 / 按惯例必须一起提交的路径。
 *  前 8 个是 `release.mjs` 的真实写入目标（与 `build.mjs --check` 的多源门禁一致），
 *  第 9 个 `CHANGELOG.md` 是发版提交的惯例内容，也是铁律第 5 条点名的最高共写面。
 *  ⚠️ 这份清单不许和 release.mjs 的实际写入漂移 —— `undeclaredWrites()` 在切版当场核对。 */
export const RELEASE_PATHS = [
  "package.json",
  "electron/package.json",
  "manifest.json",
  "agent-workbench.html",
  "service-worker.js",
  "README.md",
  "package-lock.json",
  "electron/package-lock.json",
  "CHANGELOG.md",
];

/** 会话身份：`--as <名>` 优先，其次环境变量 `WB_SESSION`（与 claim-check 同一套约定）。
 *  两者都没有 ⇒ 返回 null，由调用方**失败**而不是猜一个：自动登记要是落到别人名下，
 *  比不登记更糟（对方会以为自己占着，而真正的占用者查不到）。 */
export function resolveIdentity(argv, env) {
  const a = Array.isArray(argv) ? argv : [];
  const i = a.indexOf("--as");
  if (i >= 0 && a[i + 1] && !a[i + 1].startsWith("--")) return a[i + 1];
  const e = (env && env.WB_SESSION) || "";
  return e.trim() ? e.trim() : null;
}

/** UTC+8 的 `YYYY-MM-DD HH:MM`，与登记表既有行的时间格式一致（表头写的就是 UTC+8）。 */
export function stampUtc8(now) {
  const d = new Date(now.getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate())
    + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes());
}

/** 幂等判据：我已有一条**本次版本**的登记行（状态不限）覆盖**全部**发版路径 ⇒ 不重复登记。
 *  切版失败后重跑、或同版本号跑了两次，都不该往板面追加重复行。
 *  版本号靠 `releaseBy` 里的「切版 v{ver}」标记对上 —— 登记行生而 RELEASED 后，幂等不能再只认
 *  ACTIVE（那会漏掉刚登记的那一行）；也不能与版本无关（否则下个版本连审计行都没有）。
 *  只覆盖一部分不算 —— 那是另一件事的认领，发版这行仍要写。 */
export function alreadyClaimed(rows, me, ver) {
  return (rows || []).some((r) => r.session === me
    && RELEASE_PATHS.every((p) => r.paths.includes(p))
    && String(r.releaseBy || "").includes("切版 v" + ver));
}

/** 反漂移判据：release.mjs 实际写过的路径必须都在 RELEASE_PATHS 里。
 *  返回**未声明**的那部分（空数组 = 一致）。加新版本源却忘了补清单时，登记范围会小于实际改动范围
 *  —— 那是"假声明"，比没有声明更难发现，所以在切版当场就拦住。 */
export function undeclaredWrites(written) {
  const set = new Set(written || []);
  return [...set].filter((p) => !RELEASE_PATHS.includes(String(p).split("\\").join("/")));
}

/** 往板面登记一行**生而 RELEASED** 的审计行。返回新板面文本；本次版本已登记过则原样返回。
 *  写完自己复核一遍（`parseTable` 必须多出一行、且该行 RELEASED + 会话正确 + 版本标记在）——
 *  登记不进去却报"已登记"是本模块最坏的失效形状。
 *  ⚠️ 若板面已有一条**本会话**的 ACTIVE 行覆盖全部发版路径（手动按旧习惯预登记的），直接抛错
 *  而不是追加：那条 ACTIVE 行会随发版提交上 main，在 CI 认领门里被自判占用（v3.7.155 双红形态）。
 *  抛错发生在任何版本写入之前，操作者把该行翻 RELEASED（R13 收工动作）再重跑即可。 */
export function claimBoardForRelease({ md, me, ver, now }) {
  const { found, rows } = parseTable(md);
  if (!found) throw new Error("板面里没有「" + SECTION + "」一节 —— 无法登记，切版中止");
  if (!rows.length) throw new Error("登记表解析出 0 行 —— 表结构可能已被改坏，切版中止（先看 " + BOARD + "）");
  if (alreadyClaimed(rows, me, ver)) return { md, appended: false, rowLine: null };

  const strayActive = rows.filter((r) => r.session === me && r.status === "ACTIVE"
    && RELEASE_PATHS.every((p) => r.paths.includes(p)));
  if (strayActive.length) {
    throw new Error("板面已有本会话（" + me + "）一条 ACTIVE 行覆盖全部发版路径 —— 手动预登记？"
      + "它会随发版提交让 CI 认领门自判占用（v3.7.155 双红实证）。"
      + "请先把该行翻成 RELEASED（R13 收工动作），再重跑切版");
  }

  const rowLine = renderClaimRow({
    paths: RELEASE_PATHS,
    session: me,
    claimedAt: stampUtc8(now),
    /* 刻意写短：claim-check 报冲突时会把整格原样打出来，长文本会把"谁占了哪条路径"这个有用信息淹掉。
       细节该进 CHANGELOG 与板面条目区，不该塞进表格单元格。
       「切版 v<版本>」是幂等判据的标记（见 alreadyClaimed），改动时两处要一起改。 */
    releaseBy: "切版 v" + ver + "（release.mjs 自动登记，生而 RELEASED：CI 认领门按提交作者名取身份，"
      + "与会话名不匹配，ACTIVE 自登记行会让发版提交自判占用——v3.7.155 双红实证；本行仅作审计）",
    status: "RELEASED",
  });
  const next = insertClaimRow(md, rowLine);

  const after = parseTable(next);
  if (after.rows.length !== rows.length + 1) {
    throw new Error("登记后行数不是 +1（" + rows.length + " → " + after.rows.length + "）—— 插错了位置，切版中止");
  }
  const mine = after.rows.filter((r) => r.session === me
    && RELEASE_PATHS.every((p) => r.paths.includes(p))
    && String(r.releaseBy || "").includes("切版 v" + ver));
  if (mine.length !== 1) {
    throw new Error("登记后读不回恰好 1 条本次版本的审计行（实得 " + mine.length + "）—— 切版中止");
  }
  return { md: next, appended: true, rowLine };
}
