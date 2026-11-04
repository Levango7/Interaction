/**
 * claim-check.test.js —— 文件占用检查器的判定面（`scripts/claim-check.mjs`）
 * ----------------------------------------------------------------------------
 * 为什么值得单独测：这类协调工具**坏掉时的症状与"没人占用"完全同形**。
 * 2026-11-04/05 一夜里撞到两种形态，都是"读了、读了旧的、于是报无冲突"：
 *   ① 别的会话把认领行压在自己工作树里**未提交** ⇒ `--list` 说「当前无 ACTIVE 占用」；
 *   ② 别的会话把认领行提交到了 `main`，而我的分支还停在旧提交 ⇒ 读本地文件同样看不见。
 * 所以钉的不是"它能打印"，而是**每条判定维度**：哪一面该贡献行、哪一面不该、
 * 读不到时必须留下一支可读到的"读不到"，而不是静默按"没有占用"收工（假阴性比没门禁更糟）。
 */
import { describe, expect, it } from "vitest";
import {
  collectActive, findConflicts, listWorktrees, normalizeRoot, parseTable
} from "../scripts/claim-check.mjs";

const TABLE_HEAD = "| 路径（可通配） | 会话 | 认领时间(UTC+8) | 计划释放 | 状态 |\n|---|---|---|---|---|\n";
const board = (rows) => "## 文件占用登记表\n\n" + TABLE_HEAD + rows.join("\n") + "\n";
const row = (paths, session, status, claimedAt) =>
  "| `" + paths + "` | " + session + " | " + (claimedAt || "2026-11-05 00:00") + " | 收工即释放 | " + status + " |";

/** 默认 ctx：三面都"读不到 / 没有"，用例只开自己那一支，免得彼此串味。 */
function ctx(over) {
  return Object.assign({
    workingRows: [],
    sharedRef: "origin/main",
    readRef: () => null,
    trees: [],
    current: "f:/wt/me",
    statusOf: () => false,
    fileAt: () => null
  }, over || {});
}
const activeOf = (r) => r.session + "|" + r.paths.join(",");

describe("parseTable()：登记表解析", () => {
  it("没有「文件占用登记表」这一节 ⇒ found=false（机制未建立，不许当成「没人占用」）", () => {
    const p = parseTable("# 别的文档\n就一句话。");
    expect(p.found).toBe(false);
    expect(p.rows).toEqual([]);
  });

  it("表头与分隔行不进 rows；ACTIVE / RELEASED 都进（状态由调用方过滤）", () => {
    const p = parseTable(board([row("src/a.js", "Qoder", "ACTIVE"), row("src/b.js", "ZCode", "RELEASED")]));
    expect(p.found).toBe(true);
    expect(p.rows.length).toBe(2);
    expect(p.rows[0].status).toBe("ACTIVE");
    expect(p.rows[1].status).toBe("RELEASED");
    expect(p.rows[0].paths).toEqual(["src/a.js"]);
  });

  it("状态列里的中文尾巴不参与比较（replace 掉非大写字母 ⇒ 只认 ACTIVE/DONE 这类标号）", () => {
    const p = parseTable(board(["| `src/a.js` | Qoder | 2026-11-05 00:00 | 收工 | ACTIVE（认领） |"]));
    expect(p.rows[0].status).toBe("ACTIVE");
  });

  it("逗号支持中英文混用 ⇒ 一行多个路径要全拆开", () => {
    const p = parseTable(board([row("src/a.js`, `src/b.js，src/c.js", "Qoder", "ACTIVE")]));
    expect(p.rows[0].paths).toEqual(["src/a.js", "src/b.js", "src/c.js"]);
  });
});

describe("normalizeRoot() / listWorktrees()：树面读数的地基", () => {
  it("反斜杠、尾斜杠、盘符大小写都归一 —— Windows 的 worktree 清单与 process.cwd() 必须能等值比较", () => {
    expect(normalizeRoot("F:\\wt\\wb140\\")).toBe(normalizeRoot("f:/wt/wb140"));
    expect(normalizeRoot("F:/wt/wb140")).toBe("f:/wt/wb140");
  });

  it("正常清单只取 `worktree ` 行，HEAD/branch 空行都不算一棵树", () => {
    const out = "worktree F:/Nexus/Interaction\nHEAD 24392904\nbranch refs/heads/main\n\nworktree F:/wt/wb140\nHEAD 9c6db4ed\n\n";
    expect(listWorktrees(() => out)).toEqual(["F:/Nexus/Interaction", "F:/wt/wb140"]);
  });

  it("git 读失败 ⇒ null，而不是「没有别的树」的空数组（这一支错了就是静默假阴性）", () => {
    expect(listWorktrees(() => null)).toBe(null);
  });
});

describe("collectActive()：三面合并 —— 已提交面 / 共享分支面 / 别的树未提交面", () => {
  it("① 共享分支上别人已提交、我本地未并入的 ACTIVE ⇒ 必须算占用，且标出来源", () => {
    const r = collectActive(ctx({ readRef: () => board([row("src/ai-tools.js", "ZCode", "ACTIVE")]) }));
    expect(r.rows.length).toBe(1);
    expect(activeOf(r.rows[0])).toBe("ZCode|src/ai-tools.js");
    expect(r.rows[0].tag).toContain("origin/main");
    expect(r.notes).toEqual([]);
  });

  it("② 别的树里**未提交**的 ACTIVE 行 ⇒ 必须算占用（这正是 11-04 那次看不见的洞）", () => {
    const r = collectActive(ctx({
      trees: ["F:/Nexus/Interaction"],
      statusOf: () => true,
      fileAt: () => board([row("tests/e2e/x.spec.js", "WorkBuddy", "ACTIVE")])
    }));
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].tag).toContain("未提交，树 f:/nexus/interaction");
  });

  it("③ 反向对照：干净的别的树不贡献行 —— 否则每棵树都把同一批已提交的行再报一遍，制造假冲突", () => {
    const committed = [{ paths: ["src/a.js"], session: "ZCode", claimedAt: "x", releaseBy: "y", status: "ACTIVE" }];
    const r = collectActive(ctx({
      workingRows: committed,
      trees: ["F:/Nexus/Interaction"],
      statusOf: () => false,                       // 干净
      fileAt: () => board([row("src/a.js", "ZCode", "ACTIVE")])
    }));
    expect(r.rows.length).toBe(1);                 // 只有我自己这份工作文件里的那一条
  });

  it("④ 当前树自己跳过（它的未提交改动本就在我读到的磁盘文件里，不能再加一遍）", () => {
    const r = collectActive(ctx({
      current: "f:/wt/me",
      trees: ["F:/wt/ME/"],                        // 同一棵树，只是写法不同
      statusOf: () => true,
      fileAt: () => board([row("src/a.js", "WorkBuddy", "ACTIVE")])
    }));
    expect(r.rows).toEqual([]);
  });

  it("⑤ 同一行出现在两个面 ⇒ 去重成一条，冲突表不会重复告警", () => {
    const mine = [{ paths: ["src/a.js"], session: "ZCode", claimedAt: "2026-11-05 00:00", releaseBy: "y", status: "ACTIVE" }];
    const r = collectActive(ctx({
      workingRows: mine,
      readRef: () => board([row("src/a.js", "ZCode", "ACTIVE")]),
      trees: ["F:/other"],
      statusOf: () => true,
      fileAt: () => board([row("src/a.js", "ZCode", "ACTIVE")])
    }));
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].tag).toBeUndefined();         // 保留的是工作文件那一条，不被来源标签覆盖
  });

  it("⑥ 已提交面里的 RELEASED 不参与判定（解除以提交为准；未提交只增不减）", () => {
    const r = collectActive(ctx({
      readRef: () => board([row("src/a.js", "ZCode", "RELEASED"), row("src/b.js", "ZCode", "ACTIVE")])
    }));
    expect(r.rows.map((x) => x.paths[0])).toEqual(["src/b.js"]);
  });

  it("⑦ 读不到共享分支 ⇒ 必须留下「读不到」那一支，而不是静默按「没占用」收工", () => {
    const r = collectActive(ctx({ readRef: () => null }));
    expect(r.rows).toEqual([]);
    expect(r.notes.length).toBe(1);
    expect(r.notes[0]).toContain("读不到 origin/main");
  });

  it("⑧ 列不出工作树 ⇒ 同样要有独立的一条告警（与⑦是两面，不能互相顶替）", () => {
    const r = collectActive(ctx({ trees: null, readRef: () => board([row("src/a.js", "ZCode", "ACTIVE")]) }));
    expect(r.rows.length).toBe(1);
    expect(r.notes.some((n) => n.indexOf("工作树清单") >= 0)).toBe(true);
  });
});

describe("findConflicts()：路径 × ACTIVE 行", () => {
  const rowOf = (paths, session) => ({ paths: paths, session: session, claimedAt: "t", releaseBy: "r", status: "ACTIVE" });

  it("同会话可重入：我自己占的路径不算冲突", () => {
    const a = [rowOf(["src/a.js"], "Qoder")];
    expect(findConflicts(["src/a.js"], a, "Qoder")).toEqual([]);
  });

  it("别的会话精确命中与 * 通配都要判冲突；无关路径不误报", () => {
    const a = [rowOf(["src/ui-ge-*.js"], "ZCode"), rowOf(["docs/x.md"], "WorkBuddy")];
    const hits = findConflicts(["src/ui-ge-api.js", "src/other.js"], a, "Qoder");
    expect(hits.length).toBe(1);
    expect(hits[0].target).toBe("src/ui-ge-api.js");
    expect(hits[0].by.session).toBe("ZCode");
  });

  it("带来源标签的行照样能判冲突（合并后的行结构不许在冲突侧掉链子）", () => {
    const tagged = Object.assign(rowOf(["src/a.js"], "ZCode"), { tag: "origin/main（本地未并入）" });
    expect(findConflicts(["src/a.js"], [tagged], "Qoder").length).toBe(1);
  });
});
