/**
 * form-row-rollout.test.js —— 方案 A 铺开第二批：键值行 + 表单行（v3.7.28）
 * ----------------------------------------------------------------------------
 * ⚠️ 本文件记录一次**侦察失误**（值得留档）：
 *   我最初用单行正则 `\.api-row\{[^}]*\}` 搜样式，没匹配到任何东西，于是判定
 *   "`.api-row` 完全没有样式、标签与值紧挨着" —— **这是错的**。真实规则跨多行：
 *       .api-row{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);
 *                …（续行）
 *   也就是说**改前本来就是对齐的**（标签左、值右对齐），我的 A/B 用"去掉类"当旧态是**稻草人对比**。
 *   本轮仍按方案推进（改成「定宽标签列 + 值左对齐」），但结论必须诚实：
 *   **这是"换一种整齐"，不是"从不齐变整齐"**；若要回到右对齐，把下面那条 .api-row 改成
 *   `display:flex;justify-content:space-between` 即可（一行的事）。
 *
 * 因此本文件改为断言**真正生效的那条规则**（同名规则里**最后一条**），
 * 并额外守住"不得再被更靠后的同类规则盖住"——这正是本轮踩到的坑。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");

/** 取某个选择器**最后一条**规则（同名后者覆盖前者） */
function lastRule(sel) {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([\\s\\S]*?)\\}", "g");
  let m, last = null;
  while ((m = re.exec(CSS))) last = m[1];
  return last;
}

describe("键值行 .api-row（注意：改前本来就是对齐的，见文件头说明）", () => {
  it("生效的那条（最后一条）是定宽标签列", () => {
    const body = lastRule(".api-row");
    expect(body, "应存在 .api-row 规则").toBeTruthy();
    expect(body).toContain("display:grid");
    expect(body).toContain("grid-template-columns:var(--label-col-w) 1fr");
  });

  it("新规则必须排在最前面那条老规则**之后**（否则会被盖住 —— 本轮踩过）", () => {
    const first = CSS.indexOf(".api-row{");
    const last = CSS.lastIndexOf(".api-row{");
    expect(last).toBeGreaterThan(first);
    const body = CSS.slice(last, CSS.indexOf("}", last));
    expect(body, "生效的应是带 --label-col-w 的新规则").toContain("--label-col-w");
  });

  it("行高复用既有 --control-h-sm（不另造高度体系）", () => {
    expect(lastRule(".api-row")).toContain("min-height:var(--control-h-sm)");
  });

  it("--label-col-w 令牌已定义", () => {
    expect(CSS).toMatch(/--label-col-w:\s*\d+px/);
  });

  it("长值可换行，不撑破标签列", () => {
    expect(CSS).toMatch(/\.api-row \.api-value\{[^}]*overflow-wrap:anywhere/);
  });

  it("标签与值的既有样式未被改动", () => {
    expect(CSS).toMatch(/\.api-label\{font-size:var\(--fs-sm\);color:var\(--text\)\}/);
    expect(CSS).toMatch(/\.api-value\{font-size:var\(--fs-xs\);color:var\(--muted\)\}/);
  });
});

/** 取某个选择器的**全部**规则体（同名选择器可能有多条：主规则 + 变体/媒体查询） */
function allRules(sel) {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([\\s\\S]*?)\\}", "g");
  const out = [];
  let m;
  while ((m = re.exec(CSS))) out.push(m[1]);
  return out;
}
/** .form-row 的主规则：含 flex-wrap 的那条（另有一条 flex-direction:column 的变体，不算） */
function formRowMain() {
  const hit = allRules(".form-row").filter((b) => b.includes("flex-wrap"));
  return hit[hit.length - 1] || null;
}

describe("表单行 .form-row：间距同源（改动刻意最小）", () => {
  it("主规则（含 flex-wrap 那条）行/列间距都走 --space-*", () => {
    const body = formRowMain();
    expect(body, "应存在含 flex-wrap 的 .form-row 主规则").toBeTruthy();
    expect(body).toMatch(/gap:var\(--space-\d+h?\) var\(--space-\d+h?\)/);
  });

  it("保留它本来就对的底对齐与换行", () => {
    const body = formRowMain();
    expect(body).toContain("align-items:flex-end");
    expect(body).toContain("flex-wrap:wrap");
  });

  it("刻意保留 textarea 的既有 margin（不为统一而改无谓的东西）", () => {
    expect(CSS).toMatch(/\.form-row textarea\{margin-bottom:var\(--space-3\)\}/);
  });
});
