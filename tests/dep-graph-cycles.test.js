/**
 * dep-graph-cycles.test.js —— 环口径的契约：全部初等环、起点规范、与遍历顺序无关
 * ----------------------------------------------------------------------------
 * 起因（2026-11-01 实测）：`module-graph.mjs` / `lib/dep-graph.mjs` 原来用「DFS 回边」报环，
 * 有两个缺陷叠在一起：
 *   ① 同一个环**记在哪个起点**取决于遍历顺序 ⇒ 加一块新块，一批老环换起点，被精确串比对判成「新增」；
 *   ② DFS 回边只报「树上碰到的」那些环 ⇒ **会整条漏枚举**（实测 39 块时 `render-entry ↔ render-scene-main`
 *      从未被报出，老基线只盖住 14 条，而真实初等环有 34 条 ⇒ 20 条债从来没被这道门守过）。
 * 现在换成 `elementaryCycles`（每个环由「环内编号最小的节点」枚举一次）。本文件把三件事钉住：
 * 起点稳定、枚举完备、基线里不许有陈旧/非规范条目；并留一条「老块之间不许凭空冒出新环」的反向哨兵。
 * 2026-11-01 收口时基线已重冻成**当前图的全量初等环**（40 块 = 35 条环 / 20 条逆层块对），
 * 其中 `draw-canvas` 那 2 条由画布块作者 ZCode 在 `0baf401` 指名冻结 —— 换血只改口径，不替他做决定。
 *
 * 运行：npm run test:local -- tests/dep-graph-cycles.test.js
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { canonCycle, elementaryCycles, analyze, loadBlocks } from "../scripts/lib/dep-graph.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "module-graph.baseline.json");

/** 邻接表：对象字面量 → Map，便于用例里手写图 */
const adjOf = (o) => {
  const m = new Map();
  for (const [k, vs] of Object.entries(o)) m.set(k, vs);
  return m;
};

describe("① elementaryCycles 纯函数行为", () => {
  it("同一个环从不同起点写，只算一条（起点规范）", () => {
    const g = adjOf({ a: ["b"], b: ["c"], c: ["a"] });
    const fromA = elementaryCycles(["a", "b", "c"], g);
    const fromB = elementaryCycles(["b", "c", "a"], g);
    const rotated = elementaryCycles(["c", "a", "b"], adjOf({ c: ["a"], a: ["b"], b: ["c"] }));
    expect(fromA).toEqual(["a → b → c → a"]);
    expect(fromB).toEqual(fromA);
    expect(rotated).toEqual(fromA);
  });

  it("反向对照：两条不同的环不许被规范化合并成一条", () => {
    // a↔b 与 a↔c 是两个不同的 2-环，成员集合不同 ⇒ 必须各报一条
    const g = adjOf({ a: ["b", "c"], b: ["a"], c: ["a"] });
    expect(elementaryCycles(["a", "b", "c"], g)).toEqual([
      "a → b → a",
      "a → c → a",
    ]);
  });

  it("枚举完备：DFS 会漏的那条 2-环必须报出来（本修的靶心）", () => {
    // a→b→a 与 a→c→a，再让 c 也连到 b：环 {a,b}、{a,c}、{a,b,c} 三条都在
    const g = adjOf({ a: ["b", "c"], b: ["a", "c"], c: ["a"] });
    const got = elementaryCycles(["a", "b", "c"], g);
    expect(got).toContain("a → b → a");
    expect(got).toContain("a → c → a");
    expect(got.length).toBe(3);
    expect(got).toContain("a → b → c → a");
  });

  it("输入顺序（节点与邻接插入序）不影响输出", () => {
    const g1 = adjOf({ x: ["y"], y: ["z"], z: ["x"], w: ["x"] });
    const g2 = adjOf({ y: ["z"], x: ["y"], w: ["x"], z: ["x"] });
    expect(elementaryCycles(["w", "x", "y", "z"], g2)).toEqual(elementaryCycles(["x", "y", "z", "w"], g1));
  });

  it("自环与指向集合外的边都不炸（引用了不存在的块 ⇒ 忽略）", () => {
    const g = adjOf({ a: ["a", "ghost", "b"], b: ["a", "ghost"] });
    expect(elementaryCycles(["a", "b"], g)).toEqual(["a → b → a"]);
  });

  it("canonCycle：非规范串归一、幂等、非环串原样返回", () => {
    expect(canonCycle("b → c → a → b")).toBe("a → b → c → a");
    expect(canonCycle(canonCycle("b → c → a → b"))).toBe("a → b → c → a");
    expect(canonCycle("a → a")).toBe("a → a");     // 2 节点以下的形态不动它
    expect(canonCycle("")).toBe("");
  });
});

describe("② 仓内真值：基线与当前图必须同口径", () => {
  const cur = analyze(loadBlocks());
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));

  it("当前每条环都已是规范形态（否则起点会漂）", () => {
    const bad = cur.cycles.filter((x) => canonCycle(x) !== x);
    expect(bad, "非规范环：" + bad.join(" | ")).toEqual([]);
  });

  it("基线里每条环都已是规范形态、且仍在当前图里（不许有陈旧条目）", () => {
    const badForm = base.cycles.filter((x) => canonCycle(x) !== x);
    expect(badForm, "基线里的非规范环（跑 npm run module:freeze 重写）：" + badForm.join(" | ")).toEqual([]);
    const orphan = base.cycles.filter((x) => !cur.cycles.includes(x));
    expect(orphan, "基线里有、图上已不存在的环（债已消就该重冻）：" + orphan.join(" | ")).toEqual([]);
    expect(new Set(base.cycles).size, "基线环集合不许有重复").toBe(base.cycles.length);
  });

  it("基线 = 当前全量初等环（新块闭出的环不许悬在外面 ⇒ 忘了 freeze 就在这儿红）", () => {
    const added = cur.cycles.filter((x) => !base.cycles.includes(x));
    expect(added, "有环没进基线：确认是有意保留后跑 npm run module:freeze").toEqual([]);
  });

  it("反向哨兵自带射程：从基线里偷删一条「成员全是老块」的环，必须被判成新增", () => {
    /* 2026-11-01 之前，加一块 draw-canvas 就把 8 条老环报成新增（2 条旋转假象 + 5 条漏枚举 + 1 条真新增）。
       现在基线是全量 ⇒ 现场 added 恒为空，光写一条「added 里不许有老块环」是**空集判定**，
       谁都能蒙过去。所以这条不靠现场漂移自证：自己造一个"删掉一条老环"的基线，
       确认那条规则真的抓得到它（对应用语境的变异 M4）。 */
    const oldOnly = cur.cycles.filter((c) => !c.split(" → ").includes("draw-canvas"));
    expect(oldOnly.length, "图上应存在不含 draw-canvas 的老环可供取证").toBeGreaterThan(0);
    const victim = oldOnly[0];
    const crippled = base.cycles.filter((c) => c !== victim);
    expect(crippled.length, "victim 必须真的在基线里").toBe(base.cycles.length - 1);
    const added = cur.cycles.filter((x) => !crippled.includes(x));
    const phantom = added.filter((cyc) => !cyc.split(" → ").includes("draw-canvas"));
    expect(phantom, "删掉老环却没被抓到 ⇒ 哨兵无射程").toEqual([victim]);
  });

  it("规模哨兵：初等环集合非空且远大于旧基线的 14 条（证明枚举完备真的生效）", () => {
    expect(cur.cycles.length).toBeGreaterThan(20);
    expect(base.cycles.length).toBeGreaterThan(20);
  });
});
