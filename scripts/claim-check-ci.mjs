#!/usr/bin/env node
/**
 * claim-check-ci.mjs —— 认领门的 CI 适配层（v3.7.155 / E3）
 * ----------------------------------------------------------------------------
 * 为什么要有这一层，而不是在 workflow 里直接调 claim-check.mjs：
 *   ① `claim-check.mjs` 的入参是**显式路径列表**（无参形态会 die：没给要检查的路径）。
 *      CI 里没人手敲路径，得自己算「这次推了什么」。
 *   ② 它默认会话身份是 WorkBuddy（`WB_SESSION || "WorkBuddy"`）。CI 上没有 WB_SESSION，
 *      不显式传 --as 会把「本会话自己的认领」误判成「他人占用」——身份必须由这里推导。
 *   ③ 改动基线在不同触发形态下不一样（pull_request 取 base.sha；push 有 event.before；
 *      workflow_run / 本地没有），取不到基线时**必须显式跳过并说明**，不能静默放行
 *      （本仓对「空 check 判绿」有明文禁令）。
 *
 * 为什么逻辑放脚本而不是 workflow 内联：`scripts/verify-ci-order.mjs` 与
 * `tests/ci-workflow-guard.test.js` 的解析器只认**同行 `- run:` 单条命令**；写成
 * run 块多行形态会被当成命令字面量执行（实测 exit 1）。
 *
 * 用法：
 *   node scripts/claim-check-ci.mjs              # CI 默认形态（自动取基线/改动路径/身份）
 *   node scripts/claim-check-ci.mjs --warn-only  # 只告警不阻断（排查期用）
 *   node scripts/claim-check-ci.mjs --base <sha> # 显式指定基线（本地预演用）
 *
 * 退出码：0 = 无冲突（或按规则跳过）；1 = 改动路径撞他人 ACTIVE 认领；2 = 判定失败（参数/环境）
 * 导出 main(argv) 供 tests/claim-check-ci.test.js 直接调用（不派生子进程，也不经 shell）。
 */
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const ZERO = /^0{40}$/;

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

/** 取改动基线：显式参数 → push 事件载荷 → HEAD~1（本地预演）。都取不到返回 null 并说明原因。 */
function resolveBase(argv, baseArg) {
  /* 显式 --base 给全零串（新建分支形态常这么传）同样视为「无基线」，走显式跳过。 */
  if (baseArg && !ZERO.test(baseArg)) return { base: baseArg, why: "显式 --base" };
  if (baseArg) return { base: null, why: "显式 --base 为全零串（无基线）" };
  const evPath = process.env.GITHUB_EVENT_PATH;
  if (evPath && fs.existsSync(evPath)) {
    try {
      const ev = JSON.parse(fs.readFileSync(evPath, "utf8"));
      /* pull_request / pull_request_target：基线取 base 分支 tip。事件载荷的 before 是
         PR 分支的上一个 tip，rebase/强推后在新历史里不可达 ⇒ diff 直接判失败把整条 job
         拖红（2026-11-10 PR #3 实测红）；base.sha 是 base 分支 tip，fetch 必达。 */
      const prBase = ev.pull_request && ev.pull_request.base && ev.pull_request.base.sha;
      if (prBase && !ZERO.test(prBase)) return { base: prBase, why: "事件载荷 pull_request.base.sha" };
      const b = ev.before || (ev.workflow_run && ev.workflow_run.head_sha) || ev.base_sha || "";
      if (b && !ZERO.test(b)) return { base: b, why: "事件载荷 before" };
      if (b && ZERO.test(b)) return { base: null, why: "事件载荷 before 全零（新建分支/首个推送）" };
    } catch (e) {
      return { base: null, why: "事件载荷不可解析：" + ((e && e.message) || e) };
    }
  }
  if (git(["rev-parse", "--verify", "HEAD~1"])) return { base: "HEAD~1", why: "本地/无事件载荷，回退 HEAD~1 预演" };
  return { base: null, why: "取不到基线（无事件载荷且无父提交）" };
}

/** 身份：--as → WB_SESSION → 最近提交作者名。
 *  ⚠️ 本仓所有提交作者都是同一个人，所以「作者名」不等于「会话名」——
 *  门禁的语义因此定为：只把「ACTIVE 行与改动路径是否重叠」当硬信号，身份仅用于
 *  豁免「行里明写了自己会话名」的情况（WB_SESSION 由调用方给，CI 里通常为空）。 */
function resolveIdentity(argv, sha) {
  const asIdx = argv.indexOf("--as");
  if (asIdx >= 0 && argv[asIdx + 1]) return argv[asIdx + 1];
  if (process.env.WB_SESSION) return process.env.WB_SESSION;
  return git(["log", "-1", "--format=%an", sha || "HEAD"]) || "";
}

/** 主流程。返回退出码（0/1/2），不 process.exit —— 供测试直接调用。 */
export function main(argv) {
  const warnOnly = argv.includes("--warn-only");
  const baseIdx = argv.indexOf("--base");
  const baseArg = baseIdx >= 0 ? argv[baseIdx + 1] : null;

  const { base, why } = resolveBase(argv, baseArg);
  const head = process.env.GITHUB_SHA || git(["rev-parse", "HEAD"]) || "HEAD";

  if (!base) {
    console.log("[claim-check-ci] 跳过判定：" + why);
    console.log("[claim-check-ci] 说明：这是**显式跳过**（打印了原因），不是静默放行；无基线时无法界定改动面。");
    return 0;
  }

  const diffOut = git(["diff", "--name-only", base, head, "--", "."]);
  if (diffOut === null) {
    console.error("[claim-check-ci] 无法计算 " + base + ".." + head + " 的差异（基线不可达？）—— 判定失败，不静默通过。");
    console.error("[claim-check-ci] 若确属浅克隆导致基线缺失，请在 workflow 里把 fetch-depth 调大或显式传 --base。");
    return 2;
  }
  const changed = diffOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!changed.length) {
    console.log("[claim-check-ci] " + base + ".." + head + " 未改动任何文件 —— 无需判定。");
    return 0;
  }

  const me = resolveIdentity(argv, head);
  console.log("[claim-check-ci] 基线 " + base + "（" + why + "）→ " + head.slice(0, 7) + "，改动 " + changed.length + " 个文件；会话身份：" + (me || "(未知)"));

  /* 把改动路径喂给 claim-check.mjs（唯一权威判定源，避免在这里复制一份匹配规则）。
     参数走数组、不经 shell，免去分词/转义问题。 */
  const r = spawnSync(process.execPath, ["scripts/claim-check.mjs", "--as", me || "ci"].concat(changed), {
    cwd: process.cwd(), encoding: "utf8",
  });
  const out = ((r.stdout || "") + (r.stderr || "")).trim();
  if (out) console.log(out);
  if (r.status === 0) return 0;
  if (warnOnly) {
    console.log("[claim-check-ci] ⚠ 存在冲突，但当前为 --warn-only：只告警不阻断。");
    return 0;
  }
  console.error("[claim-check-ci] ✗ 认领门失败：本次推送改动了他人 ACTIVE 认领的路径。");
  console.error("[claim-check-ci] 处置：① 与占用方在 docs/agent-board.md 沟通；② 若你本就是占用方，"
    + "请在**同一提交**里把该行改成 RELEASED（R13）后重推；③ 确认是误报时用 --warn-only 临时排查。");
  return 1;
}

/* 仅作为 CLI 直接运行时才执行（被 import 时不跑）——测试 import { main } 不产生副作用。 */
if (process.argv[1] && /claim-check-ci\.mjs$/.test(String(process.argv[1]).replace(/\\/g, "/"))) {
  process.exit(main(process.argv.slice(2)));
}
