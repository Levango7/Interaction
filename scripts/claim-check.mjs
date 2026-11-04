#!/usr/bin/env node
/**
 * claim-check.mjs —— 文件占用冲突检查器（`docs/agent-board.md` 的「占用登记表」的机械判据）
 * ----------------------------------------------------------------------------
 * 为什么要它：板子上原来只有「动手前声明一行」这条软要求，靠人读全文 + 自觉比对。
 * 并行会话一多，读漏一行就撞车（2026-10-28 双向各踩过一次：两人裸 commit 互相夹带）。
 * 这个脚本把「占没占」变成**退出码**，让冲突在动手之前暴露，而不是在合并时。
 *
 * 用法：
 *   node scripts/claim-check.mjs src/ai-tools.js tests/foo.test.js
 *   node scripts/claim-check.mjs --as Qoder src/ai-tools.js     # 以别的会话身份检查（默认 WorkBuddy）
 *   node scripts/claim-check.mjs --list                          # 列出全部 ACTIVE 占用
 *
 * 退出码：0 = 全部可动（无他人占用）；1 = 有路径被**其他会话**占用；2 = 用法/解析错误
 *
 * 登记表规则：
 *   · 路径支持简单通配 *（如 src/ui-ge-*.js），不支持 **
 *   · 只有状态 ACTIVE 参与判定；RELEASED / DONE 一律忽略
 *   · 自己占的路径不算冲突（同会话可重入）
 *
 * 2026-11-05 补的第二只眼（未提交的认领也算占用）：
 *   判据原来只读**当前树的磁盘板面文件**，而别的会话的认领行可能正压在他自己那棵未提交的工作树里
 *   （实测：WorkBuddy 2026-11-04 23:26 的 ACTIVE 行未提交，我从自己的树 `--list` 得到的是
 *   「当前无 ACTIVE 占用」—— 机械门禁看不见未提交的占用，洞就在这儿；只能靠人肉去读主树 diff）。
 *   现在额外扫 `git worktree list` 里**其它**工作树的 `docs/agent-board.md`：
 *     - 只在那棵树对该文件**确有未提交改动**时才取它的行（干净树的内容等于某个提交，重复计入会造假冲突）；
 *     - 当前树自己的未提交改动本来就在磁盘文件里，不重复加；
 *     - git 不可用 / 列不出工作树 ⇒ 明确打一行「只判已提交面」的告警，而不是静默退回旧行为。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BOARD = "docs/agent-board.md";
const SECTION = "## 文件占用登记表";
const BS = String.fromCharCode(92); // 反斜杠：用 charCode 构造，避免被 heredoc / 多层转义吃掉

function die(msg) {
  console.error("[claim-check] " + msg);
  process.exit(2);
}

const REGEX_META = ".+^${}()|[]";

function globToRe(g) {
  let out = "";
  for (const ch of g) {
    if (ch === "*") out += "[^/]*";
    else if (ch === BS || REGEX_META.includes(ch)) out += BS + ch;
    else out += ch;
  }
  return new RegExp("^" + out + "$");
}

export function parseTable(md) {
  const start = md.indexOf(SECTION);
  if (start < 0) return { found: false, rows: [] };
  const after = md.slice(start + SECTION.length);
  const nextSection = after.search(/^## /m);
  const body = nextSection >= 0 ? after.slice(0, nextSection) : after;

  const rows = [];
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || !t.endsWith("|")) continue;
    const cells = t.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    if (/^-+:?$/.test(cells[0])) continue;
    if (/^路径/.test(cells[0])) continue;
    const p = cells[0], session = cells[1], claimedAt = cells[2], releaseBy = cells[3], status = cells[4];
    if (!p || !session) continue;
    const paths = p.split(/[,，]/).map((s) => s.trim().replace(/[`]/g, "")).filter(Boolean);
    rows.push({ paths, session, claimedAt, releaseBy, status: status.replace(/[^A-Z]/g, "") });
  }
  return { found: true, rows };
}

/* 统一成小写正斜杠、去尾斜杠：`F:/wt/wb140` 与 `F:\\wt\\wb140` 必须认成同一棵树。 */
export function normalizeRoot(p) {
  return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** `git worktree list --porcelain` 的树清单；读不到返回 null —— 调用方必须走「读不到」那一支，
    不能把 null 当成"没有别的树"（那正是本门禁要防的静默失效）。 */
export function listWorktrees(run) {
  const out = run(["worktree", "list", "--porcelain"]);
  if (out === null) return null;
  return String(out).split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9).trim());
}

/** 汇总三面 ACTIVE 占用（同一天里两次都撞到过，所以三面都得读）：
 *    ① 我的工作文件 —— 含我自己未提交的行；
 *    ② 共享分支上的板面 —— 别人**已提交到我本地还没并进来的分支**（实测：WorkBuddy 2026-11-05 把
 *       认领行提交在 `main` 的 `2439290`，我的分支停在 `9c6db4e` ⇒ 只读工作文件等于没读）；
 *    ③ 其它工作树里**未提交**的板面改动（实测：他 2026-11-04 23:26 那行压在自己树里，机械门禁看不见）。
 *  注入 readRef / statusOf / fileAt ⇒ 单测不必真开 git 或工作树。
 *  只增不减：解除占用必须以**已提交**的 RELEASED 为准，未提交改动只能用来"补看不见的占用"。 */
export function collectActive({ workingRows, sharedRef, readRef, trees, current, statusOf, fileAt }) {
  const out = workingRows.map(function (r) { return Object.assign({}, r); });
  const seen = new Set(out.map(keyOf));
  const notes = [];
  function push(r, tag) {
    const k = keyOf(r);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(Object.assign({}, r, tag ? { tag: tag } : {}));
  }

  const remoteMd = readRef(sharedRef);
  if (remoteMd === null) {
    notes.push("读不到 " + sharedRef + " 的板面 ⇒ 本次不判「别人已提交、我本地未并入」的认领；先 git fetch 再判。");
  } else {
    parseTable(remoteMd).rows.forEach(function (r) {
      if (r.status === "ACTIVE") push(r, sharedRef + "（本地未并入）");
    });
  }

  if (trees === null) {
    notes.push("读不到工作树清单 ⇒ 本次不判其它树上未提交的认领。");
  } else {
    for (const wt of trees) {
      const key = normalizeRoot(wt);
      if (key === current) continue;
      if (!statusOf(wt)) continue;
      const md = fileAt(wt);
      if (md === null) continue;
      parseTable(md).rows.forEach(function (r) {
        if (r.status === "ACTIVE") push(r, "未提交，树 " + key);
      });
    }
  }
  return { rows: out, notes: notes };
}

function keyOf(r) { return r.session + "|" + r.claimedAt + "|" + r.paths.join(","); }

/** 目标路径 × ACTIVE 行 ⇒ 冲突表（同会话可重入；支持 `*` 通配）。 */
export function findConflicts(targets, active, me) {
  const conflicts = [];
  for (const t of targets) {
    const norm = path.normalize(t).split(BS).join("/");
    for (const r of active) {
      if (r.session === me) continue;
      for (const p of r.paths) {
        if (p === norm || globToRe(p).test(norm)) conflicts.push({ target: norm, by: r });
      }
    }
  }
  return conflicts;
}

/** 出处尾巴：不是来自我这份工作文件的行，都要标出是从哪一面读来的，让对方能直接去核而不是猜。 */
function where(r) { return r.tag ? "〔来源：" + r.tag + "〕" : ""; }

function main(argv) {
  const asIdx = argv.indexOf("--as");
  let me = process.env.WB_SESSION || "WorkBuddy";
  if (asIdx >= 0) { me = argv[asIdx + 1]; argv.splice(asIdx, 2); }
  const listOnly = argv.includes("--list");
  const targets = argv.filter((a) => !a.startsWith("--"));

  if (!fs.existsSync(BOARD)) die("找不到 " + BOARD + "（请在仓库根运行）");
  const md = fs.readFileSync(BOARD, "utf8");
  const { found, rows } = parseTable(md);
  if (!found) die("板子里没有「" + SECTION + "」一节 —— 机制未建立，先按 R13 补上再检查");
  if (!rows.length) die("登记表是空的或格式不符。表头应为：| 路径（可通配） | 会话 | 认领时间(UTC+8) | 计划释放 | 状态 |");

  const committed = rows.filter((r) => r.status === "ACTIVE");
  const scan = collectActive({
    workingRows: committed,
    sharedRef: SHARED_REF,
    readRef: readRefBoard,
    trees: listWorktrees((a) => gitRun(a)),
    current: normalizeRoot(process.cwd()),
    statusOf: (wt) => {
      const st = gitRun(["status", "--porcelain", "--", BOARD], wt);
      return st !== null && st.trim() !== "";
    },
    fileAt: (wt) => {
      try { return fs.readFileSync(path.join(wt, BOARD), "utf8"); } catch (_e) { return null; }
    }
  });
  const active = scan.rows;
  for (const n of scan.notes) console.error("[claim-check] ⚠ " + n);

  if (listOnly) {
    if (!active.length) { console.log("[claim-check] 当前无 ACTIVE 占用" + (scan.notes.length ? "（仅判到能读到的面）" : "")); return 0; }
    console.log("[claim-check] ACTIVE 占用（" + active.length + " 条，本会话 = " + me + "）：");
    for (const r of active) {
      console.log("  · " + r.paths.join(", ") + "  ← " + r.session + "（" + r.claimedAt + "，计划释放：" + r.releaseBy + "）" + where(r));
    }
    return 0;
  }

  if (!targets.length) die("没给要检查的路径。用法：node scripts/claim-check.mjs <path...> 或 --list");

  const conflicts = findConflicts(targets, active, me);

  if (!conflicts.length) {
    console.log("[claim-check] ✓ 可动：" + targets.join(", ") + "（本会话 = " + me + "，无他人 ACTIVE 占用" +
      (scan.notes.length ? "；⚠ 有面读不到，见上" : "") + "）");
    return 0;
  }
  console.error("[claim-check] ✗ 冲突：以下路径被其他会话占用，先按 R13 沟通或换文件：");
  for (const c of conflicts) {
    console.error("  · " + c.target + "  ← " + c.by.session + " 占用于 " + c.by.claimedAt +
      "（计划释放：" + c.by.releaseBy + "）" + where(c.by));
  }
  return 1;
}

/* —— 真 git / 文件系统接线：判定全在上面那几个纯函数里，单测不必真开 git 或工作树 —— */
const SHARED_REF = "origin/main";

function gitRun(args, cwd) {
  try {
    return execFileSync("git", cwd ? ["-C", cwd].concat(args) : args,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (_e) { return null; }
}

/** 读共享分支上的板面（不是我本地这份文件）。git 报错一律返回 null ⇒ 由 collectActive 走「读不到」那一支。 */
export function readRefBoard(ref) {
  const out = gitRun(["show", ref + ":" + BOARD]);
  return out === null ? null : out;
}

/* 被测试 import 时不自动跑 CLI（同 watch-runs.mjs 的做法） */
if (process.argv[1] && /claim-check.mjs$/.test(process.argv[1].replace(/\\/g, "/"))) {
  process.exit(main(process.argv.slice(2)));
}
