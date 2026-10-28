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
 */
import fs from "node:fs";
import path from "node:path";

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

function parseTable(md) {
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

  const active = rows.filter((r) => r.status === "ACTIVE");

  if (listOnly) {
    if (!active.length) { console.log("[claim-check] 当前无 ACTIVE 占用"); return 0; }
    console.log("[claim-check] ACTIVE 占用（" + active.length + " 条，本会话 = " + me + "）：");
    for (const r of active) {
      console.log("  · " + r.paths.join(", ") + "  ← " + r.session + "（" + r.claimedAt + "，计划释放：" + r.releaseBy + "）");
    }
    return 0;
  }

  if (!targets.length) die("没给要检查的路径。用法：node scripts/claim-check.mjs <path...> 或 --list");

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

  if (!conflicts.length) {
    console.log("[claim-check] ✓ 可动：" + targets.join(", ") + "（本会话 = " + me + "，无他人 ACTIVE 占用）");
    return 0;
  }
  console.error("[claim-check] ✗ 冲突：以下路径被其他会话占用，先按 R13 沟通或换文件：");
  for (const c of conflicts) {
    console.error("  · " + c.target + "  ← " + c.by.session + " 占用于 " + c.by.claimedAt + "（计划释放：" + c.by.releaseBy + "）");
  }
  return 1;
}

process.exit(main(process.argv.slice(2)));
