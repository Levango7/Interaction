/**
 * release-claim.mjs —— 切版路径的板面认领门（`scripts/release.mjs` 的前置）
 * ----------------------------------------------------------------------------
 * 为什么要它：`docs/agent-board.md` 铁律第 5 条把版本源那一组文件列为「高共写/高破坏面」，
 * 动之前**必须**在登记表里声明一行。而切版恰好是全仓共写面最大的一次改动（一口气写 9 个文件），
 * 却长期只靠记性执行 —— 2026-11-05 实测：`0e6b760`（切 v3.7.154）动了 9 个文件、其中 6 个在铁律
 * 第 5 条的清单里，**没有任何板面声明**；对照 ZCode 切 v3.7.153 是有登记行的（表内 `2026-11-03 05:10`）。
 * 根因不是"不知道规矩"，是规矩没有机械判据。
 *
 * 形态由用户 2026-11-05 拍板为「拒冲突 + 自动登记」：
 *   · 他人握有覆盖发版路径的 ACTIVE 行 ⇒ 切版直接失败（判定复用 claim-check 的三面 `collectActive`，
 *     不另造一套：那三面分别是我的工作文件 / `origin/main` / 其它**脏**工作树）；
 *   · 无冲突 ⇒ 由脚本自己往登记表追加一行 ACTIVE，切完随收工提交翻 RELEASED。
 *     「声明」不再依赖记性，漏项机械上不会再发生。
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

/** 幂等判据：我已有一条 ACTIVE 行覆盖**全部**发版路径 ⇒ 不重复登记（切版失败后重跑的场景）。
 *  只覆盖一部分不算 —— 那是另一件事的认领，发版这行仍要写。 */
export function alreadyClaimed(rows, me) {
  return (rows || []).some((r) => r.status === "ACTIVE" && r.session === me
    && RELEASE_PATHS.every((p) => r.paths.includes(p)));
}

/** 反漂移判据：release.mjs 实际写过的路径必须都在 RELEASE_PATHS 里。
 *  返回**未声明**的那部分（空数组 = 一致）。加新版本源却忘了补清单时，登记范围会小于实际改动范围
 *  —— 那是"假声明"，比没有声明更难发现，所以在切版当场就拦住。 */
export function undeclaredWrites(written) {
  const set = new Set(written || []);
  return [...set].filter((p) => !RELEASE_PATHS.includes(String(p).split("\\").join("/")));
}

/** 往板面登记一行 ACTIVE。返回新板面文本；已登记过则原样返回。
 *  写完自己复核一遍（`parseTable` 必须多出一行、且该行 ACTIVE + 会话正确）——
 *  登记不进去却报"已登记"是本模块最坏的失效形状。 */
export function claimBoardForRelease({ md, me, ver, now }) {
  const { found, rows } = parseTable(md);
  if (!found) throw new Error("板面里没有「" + SECTION + "」一节 —— 无法登记，切版中止");
  if (!rows.length) throw new Error("登记表解析出 0 行 —— 表结构可能已被改坏，切版中止（先看 " + BOARD + "）");
  if (alreadyClaimed(rows, me)) return { md, appended: false, rowLine: null };

  const rowLine = renderClaimRow({
    paths: RELEASE_PATHS,
    session: me,
    claimedAt: stampUtc8(now),
    /* 刻意写短：claim-check 报冲突时会把整格原样打出来，长文本会把"谁占了哪条路径"这个有用信息淹掉。
       细节该进 CHANGELOG 与板面条目区，不该塞进表格单元格。 */
    releaseBy: "切版 v" + ver + " 的提交推送后翻 RELEASED（release.mjs 自动登记；细节见 CHANGELOG）",
    status: "ACTIVE",
  });
  const next = insertClaimRow(md, rowLine);

  const after = parseTable(next);
  if (after.rows.length !== rows.length + 1) {
    throw new Error("登记后行数不是 +1（" + rows.length + " → " + after.rows.length + "）—— 插错了位置，切版中止");
  }
  const mine = after.rows.filter((r) => r.status === "ACTIVE" && r.session === me
    && RELEASE_PATHS.every((p) => r.paths.includes(p)));
  if (mine.length !== 1) {
    throw new Error("登记后读不回恰好 1 条自己的 ACTIVE 行（实得 " + mine.length + "）—— 切版中止");
  }
  return { md: next, appended: true, rowLine };
}
