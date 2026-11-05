/**
 * release-claim-gate.test.js —— 切版前的板面认领门（D1）
 * ----------------------------------------------------------------------------
 * 钉的是 `scripts/lib/release-claim.mjs`（纯函数）+ `scripts/claim-check.mjs` 的两个新导出，
 * 以及**最后一节**：`scripts/release.mjs` 里那三处判据到底有没有被接线。
 *
 * 为什么最后一节不能省：这类门的失效形状不是"报错"，是**静默不生效** ——
 * 函数写对了却没人调、调了却不看返回值、看了返回值却不 fail。三种都表现为"切版照常成功"。
 * 本仓已有的同类教训：`check_wiring` 自报非门禁且零消费者（MAOP）、`--ok-soft` 0 消费者＝死键。
 * 所以判据本身要自带"我有射程"的证明（见最后一节的 4 条）。
 *
 * 背景（为什么要这道门）：铁律第 5 条把版本源那组文件列为高共写面、动前必须登记，
 * 但长期只靠记性 ⇒ 2026-11-05 实测 `0e6b760`（切 v3.7.154）写了 9 个文件、6 个在清单里、板上零声明。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { insertClaimRow, parseTable, renderClaimRow } from "../scripts/claim-check.mjs";
import {
  RELEASE_PATHS, alreadyClaimed, claimBoardForRelease, resolveIdentity, stampUtc8, undeclaredWrites
} from "../scripts/lib/release-claim.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (p) => readFileSync(join(root, p), "utf8");

const TABLE_HEAD = "| 路径（可通配） | 会话 | 认领时间(UTC+8) | 计划释放 | 状态 |\n|---|---|---|---|---|\n";
const board = (rows) => "## 文件占用登记表\n\n" + TABLE_HEAD + rows.join("\n") + "\n";
const row = (paths, session, status, claimedAt) =>
  "| `" + paths + "` | " + session + " | " + (claimedAt || "2026-11-05 00:00") + " | 收工即释放 | " + status + " |";

/** release.mjs 真实写入的 8 个版本源（与 build.mjs --check 的多源门禁一致）。 */
const WRITE_TARGETS = [
  "package.json", "electron/package.json", "manifest.json", "agent-workbench.html",
  "service-worker.js", "README.md", "package-lock.json", "electron/package-lock.json",
];

describe("renderClaimRow()：一行登记表的渲染", () => {
  it("5 个单元格 ⇒ 恰好 6 个竖线，且顺序是 路径/会话/时间/计划释放/状态", () => {
    const line = renderClaimRow({
      paths: ["a.js"], session: "Qoder", claimedAt: "2026-11-05 10:00",
      releaseBy: "收工即释放", status: "ACTIVE",
    });
    expect(line.split("|").length - 1).toBe(6);
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    expect(cells).toEqual(["`a.js`", "Qoder", "2026-11-05 10:00", "收工即释放", "ACTIVE"]);
  });

  it("多路径用逗号连接并各自反引号包裹；单元格里的反引号被剥掉（否则表格会串列）", () => {
    const line = renderClaimRow({
      paths: ["a.js", "b`c.js"], session: "Qoder", claimedAt: "t", releaseBy: "r", status: "ACTIVE",
    });
    expect(line).toContain("`a.js`, `bc.js`");
  });

  it("单元格含竖线 ⇒ 抛错（会把这行切成 6 格，状态列被挤掉 ⇒ 该行静默失去 ACTIVE 语义）", () => {
    expect(() => renderClaimRow({
      paths: ["a.js"], session: "Qoder", claimedAt: "t", releaseBy: "收工|即释放", status: "ACTIVE",
    })).toThrow(/竖线/);
  });

  it("任一单元格为空 ⇒ 抛错（空格子会被 parseTable 当成「没写会话」直接跳过 ⇒ 等于没登记）", () => {
    expect(() => renderClaimRow({
      paths: ["a.js"], session: "", claimedAt: "t", releaseBy: "r", status: "ACTIVE",
    })).toThrow(/空单元格/);
  });
});

describe("insertClaimRow()：插到哪一行", () => {
  /* 板面实况（2026-11-05）：登记表里有**两条**分隔行 —— 表头下那条，
     以及 `6ec9920`（切 v3.7.152）留下的游离那条。取最后一条会把新行插进表格中间。
     而 parseTable 主动跳过分隔行 ⇒ 插错位置**不会报错**，只会让人读表时看不见。 */
  const twoSeps = [
    "## 文件占用登记表", "",
    "| 路径（可通配） | 会话 | 认领时间(UTC+8) | 计划释放 | 状态 |",
    "|---|---|---|---|---|",
    row("src/old.js", "ZCode", "RELEASED"),
    "|---|---|---|---|---|",
    row("src/tail.js", "WorkBuddy", "RELEASED"),
    "", "## 下一节",
  ].join("\n") + "\n";

  it("表内有两条分隔行时，插在**第一条**之后（表头下），不是插在游离那条后面", () => {
    const out = insertClaimRow(twoSeps, row("src/new.js", "Qoder", "ACTIVE"));
    const lines = out.split("\n");
    const firstSep = lines.findIndex((l) => l.trim() === "|---|---|---|---|---|");
    expect(lines[firstSep + 1]).toContain("src/new.js");
    const secondSep = lines.indexOf("|---|---|---|---|---|", firstSep + 1);
    expect(lines[secondSep + 1]).not.toContain("src/new.js");
  });

  it("LF 板面保持 LF；CRLF 板面保持 CRLF（混行尾会让 diff 整片变红）", () => {
    const crlf = twoSeps.split("\n").join("\r\n");
    const out = insertClaimRow(crlf, row("src/new.js", "Qoder", "ACTIVE"));
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
    expect(out.split("\r\n").length).toBe(crlf.split("\r\n").length + 1);
  });

  it("没有「文件占用登记表」这一节 ⇒ 抛错（不许静默当作已登记）", () => {
    expect(() => insertClaimRow("# 别的文档\n一句话\n", row("a.js", "Qoder", "ACTIVE")))
      .toThrow(/文件占用登记表/);
  });

  it("节内走到下一个 `## ` 都没见分隔行 ⇒ 抛错（表头被改坏时不能硬写）", () => {
    const broken = "## 文件占用登记表\n\n没有表头\n\n## 下一节\n";
    expect(() => insertClaimRow(broken, row("a.js", "Qoder", "ACTIVE"))).toThrow(/分隔行/);
  });

  it("往返：插进去的行 parseTable 读得回来，且原有行一条不少", () => {
    const before = parseTable(twoSeps);
    const out = insertClaimRow(twoSeps, row("src/new.js`, `src/x.js", "Qoder", "ACTIVE"));
    const after = parseTable(out);
    expect(after.rows.length).toBe(before.rows.length + 1);
    const mine = after.rows.find((r) => r.session === "Qoder");
    expect(mine.status).toBe("ACTIVE");
    expect(mine.paths).toEqual(["src/new.js", "src/x.js"]);
  });
});

describe("resolveIdentity()：会话身份靠解析，不靠猜", () => {
  it("--as 优先于环境变量", () => {
    expect(resolveIdentity(["3.7.155", "--as", "Qoder"], { WB_SESSION: "ZCode" })).toBe("Qoder");
  });

  it("没有 --as 时退回 WB_SESSION", () => {
    expect(resolveIdentity(["3.7.155"], { WB_SESSION: " WorkBuddy " })).toBe("WorkBuddy");
  });

  it("`--as --tag 20261105a` ⇒ 下一个 token 是选项不是身份（否则会把 --tag 登记成会话名）", () => {
    expect(resolveIdentity(["3.7.155", "--as", "--tag", "20261105a"], {})).toBe(null);
  });

  it("两者都没有 ⇒ null（调用方必须失败：身份猜错＝把认领登记到别人名下，比不登记更糟）", () => {
    expect(resolveIdentity(["3.7.155"], {})).toBe(null);
    expect(resolveIdentity(["3.7.155"], { WB_SESSION: "   " })).toBe(null);
  });
});

describe("stampUtc8()：与登记表既有行的时间格式一致", () => {
  it("跨日边界：UTC 23:59 ⇒ UTC+8 的次日 07:59（表头写的就是 UTC+8，用本机时区会差出日期）", () => {
    expect(stampUtc8(new Date("2026-11-04T23:59:00Z"))).toBe("2026-11-05 07:59");
  });

  it("格式是 YYYY-MM-DD HH:MM（个位数补零）", () => {
    expect(stampUtc8(new Date("2026-01-02T03:04:05Z"))).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(stampUtc8(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02 11:04");
  });
});

describe("alreadyClaimed()：幂等判据（切版失败后重跑不该追加重复行）", () => {
  const rowsOf = (md) => parseTable(md).rows;

  it("我已有一条 ACTIVE 行覆盖全部发版路径 ⇒ true", () => {
    const md = board([row(RELEASE_PATHS.join("`, `"), "Qoder", "ACTIVE")]);
    expect(alreadyClaimed(rowsOf(md), "Qoder")).toBe(true);
  });

  it("只覆盖一部分 ⇒ false（那是另一件事的认领，发版这行仍要写）", () => {
    const md = board([row("package.json`, `README.md", "Qoder", "ACTIVE")]);
    expect(alreadyClaimed(rowsOf(md), "Qoder")).toBe(false);
  });

  it("覆盖全但状态是 RELEASED ⇒ false", () => {
    const md = board([row(RELEASE_PATHS.join("`, `"), "Qoder", "RELEASED")]);
    expect(alreadyClaimed(rowsOf(md), "Qoder")).toBe(false);
  });

  it("覆盖全且 ACTIVE 但是别人的会话 ⇒ false（那该由冲突门拦，不是幂等门）", () => {
    const md = board([row(RELEASE_PATHS.join("`, `"), "ZCode", "ACTIVE")]);
    expect(alreadyClaimed(rowsOf(md), "Qoder")).toBe(false);
  });
});

describe("undeclaredWrites()：反漂移判据（登记范围不得小于实际改动范围）", () => {
  it("全部都在清单里 ⇒ 空数组", () => {
    expect(undeclaredWrites([...WRITE_TARGETS, "CHANGELOG.md"])).toEqual([]);
  });

  it("写了清单外的路径 ⇒ 报出来（加第 9 个版本源却忘补 RELEASE_PATHS 就是假声明）", () => {
    expect(undeclaredWrites(["package.json", "src/new-version-source.js"]))
      .toEqual(["src/new-version-source.js"]);
  });

  it("反斜杠路径归一（Windows 上 join 出来的形状不该被误判成未声明）", () => {
    expect(undeclaredWrites(["electron\\package.json"])).toEqual([]);
  });

  it("重复写入只报一次（write() 用的是 Set，但入参可能是数组）", () => {
    expect(undeclaredWrites(["x.js", "x.js", "y.js"])).toEqual(["x.js", "y.js"]);
  });
});

describe("RELEASE_PATHS：清单本身的不变量", () => {
  it("必须覆盖 release.mjs 的真实写入目标 + CHANGELOG（铁律第 5 条点名的高共写面）", () => {
    for (const p of WRITE_TARGETS) expect(RELEASE_PATHS).toContain(p);
    expect(RELEASE_PATHS).toContain("CHANGELOG.md");
    expect(RELEASE_PATHS.length).toBe(WRITE_TARGETS.length + 1);
  });

  it("必须**不含** docs/agent-board.md：它是追加式共享账本，认领它不等于排他 —— 算进去则任何会话挂一行板面认领就能拦死别人的切版", () => {
    expect(RELEASE_PATHS).not.toContain("docs/agent-board.md");
    expect(RELEASE_PATHS.some((p) => p.includes("agent-board"))).toBe(false);
  });

  it("无重复、无反斜杠、无空串（重复会让「覆盖 N 条」的日志数字失真）", () => {
    expect(new Set(RELEASE_PATHS).size).toBe(RELEASE_PATHS.length);
    expect(RELEASE_PATHS.some((p) => !p || p.includes("\\") || p !== p.trim())).toBe(false);
  });
});

describe("claimBoardForRelease()：登记 + 自我复核", () => {
  const base = board([row("src/a.js", "ZCode", "RELEASED"), row("src/b.js", "WorkBuddy", "ACTIVE")]);

  it("无自己的行 ⇒ 追加恰好 1 行，ACTIVE、会话正确、覆盖全部发版路径", () => {
    const now = new Date("2026-11-05T02:00:00Z");
    const r = claimBoardForRelease({ md: base, me: "Qoder", ver: "3.7.155", now });
    expect(r.appended).toBe(true);
    const after = parseTable(r.md);
    expect(after.rows.length).toBe(parseTable(base).rows.length + 1);
    const mine = after.rows.filter((x) => x.session === "Qoder");
    expect(mine.length).toBe(1);
    expect(mine[0].status).toBe("ACTIVE");
    expect(mine[0].claimedAt).toBe("2026-11-05 10:00");
    for (const p of RELEASE_PATHS) expect(mine[0].paths).toContain(p);
    /* 计划释放格里要点名版本号：翻 RELEASED 时靠它对上是哪一次切版 */
    expect(mine[0].releaseBy).toContain("3.7.155");
  });

  it("已有自己的覆盖行 ⇒ 幂等跳过，板面**逐字节不变**", () => {
    const once = claimBoardForRelease({ md: base, me: "Qoder", ver: "3.7.155", now: new Date() });
    const twice = claimBoardForRelease({ md: once.md, me: "Qoder", ver: "3.7.156", now: new Date() });
    expect(twice.appended).toBe(false);
    expect(twice.md).toBe(once.md);
  });

  it("板面里没有登记表这一节 ⇒ 抛错（不许「登记不了也继续切」）", () => {
    expect(() => claimBoardForRelease({ md: "# 空板\n", me: "Qoder", ver: "3.7.155", now: new Date() }))
      .toThrow(/文件占用登记表/);
  });

  it("登记表解析出 0 行 ⇒ 抛错（表结构被改坏时继续写只会把行插到没人读的地方）", () => {
    const empty = "## 文件占用登记表\n\n| 路径（可通配） | 会话 | 认领时间(UTC+8) | 计划释放 | 状态 |\n|---|---|---|---|---|\n";
    expect(() => claimBoardForRelease({ md: empty, me: "Qoder", ver: "3.7.155", now: new Date() }))
      .toThrow(/0 行/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   接线自证：纯函数全绿**不等于**门在生效。
   这一节直接读 scripts/release.mjs 的源码，钉住四处"必须真的调 / 真的看返回值"。
   判据用**窄**锚点（整行的形状），不用宽泛关键字 —— 宽关键字会被注释里的同一句话喂绿。 */
describe("接线：release.mjs 里那几处判据真的生效（防死码）", () => {
  const src = readSrc("scripts/release.mjs");
  const lines = src.split("\n").map((l) => l.replace(/\r$/, ""));
  const codeLines = lines.filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("/*")
    && !l.trim().startsWith("//"));
  const hasCode = (re) => codeLines.some((l) => re.test(l));

  it("① write() 真的把路径记进 written 集合（否则反漂移判据永远看到空集＝恒绿）", () => {
    expect(hasCode(/^function write\(p, s\)\{ writeFileSync\(join\(root, p\), s\); written\.add\(p\); \}$/)).toBe(true);
    expect(hasCode(/const written = new Set\(\);/)).toBe(true);
  });

  it("② 认领门真的 spawn claim-check.mjs，带 --as 与全部发版路径，且非零即 fail", () => {
    expect(hasCode(/spawnSync\(process\.execPath, \[join\(__dirname, 'claim-check\.mjs'\), '--as', me\]\.concat\(RELEASE_PATHS\)/)).toBe(true);
    const i = codeLines.findIndex((l) => /if \(cc\.status !== 0\)/.test(l));
    expect(i).toBeGreaterThan(-1);
    expect(codeLines[i + 1]).toMatch(/fail\(/);
    /* 门必须在**任何写入之前**：bump 之后再拦，工作树已经被改脏了 */
    const gateAt = codeLines.findIndex((l) => /resolveIdentity\(process\.argv/.test(l));
    const firstWriteAt = codeLines.findIndex((l) => /^for \(const p of \['package\.json'/.test(l));
    expect(gateAt).toBeGreaterThan(-1);
    expect(firstWriteAt).toBeGreaterThan(gateAt);
  });

  it("③ 身份缺失真的 fail（不许猜一个名字去登记）", () => {
    const i = codeLines.findIndex((l) => /^if \(!me\) \{$/.test(l));
    expect(i).toBeGreaterThan(-1);
    expect(codeLines[i + 1]).toMatch(/fail\(/);
  });

  it("④ 反漂移判据真的调 undeclaredWrites(written) 且命中即 fail", () => {
    expect(hasCode(/const undeclared = undeclaredWrites\(written\);/)).toBe(true);
    const i = codeLines.findIndex((l) => /if \(undeclared\.length\)/.test(l));
    expect(i).toBeGreaterThan(-1);
    expect(codeLines[i + 1]).toMatch(/fail\(/);
  });

  it("⑤ 板面那次写入**不走** write()（它是登记机制本身，进 written 就会自指矛盾：登记动作被判成未声明改动）", () => {
    expect(hasCode(/writeFileSync\(boardP, claim\.md/)).toBe(true);
    expect(hasCode(/\bwrite\(BOARD/) || hasCode(/\bwrite\('docs\/agent-board\.md'/)).toBe(false);
  });

  it("⑥ claimBoardForRelease 的返回值真的被读（appended 分支决定写不写板面）", () => {
    expect(hasCode(/claim = claimBoardForRelease\(\{/)).toBe(true);
    expect(hasCode(/if \(claim\.appended\) \{/)).toBe(true);
  });
});
