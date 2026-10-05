/**
 * dep-graph-parity.test.js —— 守住「两份依赖分析实现不许漂移」
 * ----------------------------------------------------------------------------
 * 背景：本仓的模块依赖分析**存在两份实现**：
 *   · scripts/lib/dep-graph.mjs::analyze   ← lint-layers.mjs 门禁在用（共享实现）
 *   · scripts/module-graph.mjs 内联副本    ← module-graph --check / 报告生成在用
 *
 * dep-graph.mjs 文件头（第 9-11 行）自己写明了为什么必须共用一份：
 *   「两个门禁若各算各的，判定口径会静默漂移（同一个仓库同时出现"这里绿、那里红"，
 *    比没有门禁更糟）。」
 * 而 module-graph.mjs 的副本并未删掉 —— 于是这句声明**目前只是愿望**，靠两头的人工同步维持。
 *
 * 为什么不直接删副本改 import：analyze() 的返回值**不含** module-graph 报告层必需的
 * defOwners（共享符号表"定义于"列）与 depOf（依赖矩阵、Core 出边）—— naive import 会崩，
 * 必须扩 analyze 返回类型，而它被 lint-layers 共用 → 波及另一道 CI 门禁。
 * 在双份实现**实测等价**的前提下，为消除文本重复去改过 CI 的核心路径，风险大于收益。
 *
 * 本测试的定位：**用断言替代重构**。它不做行为改动，只把"当前等价"这一事实钉成契约 ——
 * 任一侧日后被单独修改，这里立刻报红，且报出**具体是哪一项**漂移（而非只报数字不同）。
 *
 * 口径说明：比对的三个字段（duplicates / cycles / upward）正是 module-graph.baseline.json
 * 的存储格式，也是 --check 判定"新增"的依据 —— 即**门禁真正在乎的那三个集合**。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBlocks, analyze } from "../scripts/lib/dep-graph.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "module-graph.baseline.json");

describe("依赖分析等价性：analyze() 必须与 module-graph.baseline.json 一致", () => {
  const blocks = loadBlocks();
  const res = analyze(blocks);
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));

  it("块数与 src/order.json 一致（35 块）", () => {
    const order = JSON.parse(readFileSync(join(ROOT, "src", "order.json"), "utf8"));
    expect(res.blockCount).toBe(order.length);
  });

  it("循环依赖集合与基线逐项相同", () => {
    expect(res.cycles).toEqual([...base.cycles].sort());
  });

  it("逆层依赖集合与基线逐项相同", () => {
    expect(res.upward).toEqual([...base.upward].sort());
  });

  it("重复定义集合与基线逐项相同", () => {
    expect(res.duplicates).toEqual([...base.duplicates].sort());
  });

  /* 反向断言：如果这里报红，说明确实是**源码结构变化**（真实的架构改动），
     不是本测试要防的"两边实现漂移"。此时正确动作是跑 --freeze 更新基线，
     并在此确认新数字符合预期 —— 而不是放宽本测试。 */
  it("反向断言：新增项必须为 0（否则是源码结构真变了，需 --freeze 确认）", () => {
    const addedCycles = res.cycles.filter((x) => !base.cycles.includes(x));
    const addedUpward = res.upward.filter((x) => !base.upward.includes(x));
    const addedDup = res.duplicates.filter((x) => !base.duplicates.includes(x));
    expect({ addedCycles, addedUpward, addedDup }).toEqual({
      addedCycles: [],
      addedUpward: [],
      addedDup: [],
    });
  });
});

describe("module-graph.mjs 内联副本：与 analyze() 数字必须一致", () => {
  /* 本测试的核心价值：把「两份实现」的结果同时算出来比。

     ⚠️ 为什么不用 `execFileSync` 跑 `module-graph.mjs --check` 读它的 stdout：
     本仓的测试沙箱**禁止子进程 spawn**（实测 `spawnSync node EBUSY` / stdout 恒为 `""`）——
     那会让本测试在本地"假红"、在 CI"假绿"，是最糟的形态（环境相关测试）。
     故改为**进程内**静态比对。

     ⚠️ 也不要断言"两份源码文本逐字相同"：实测立刻误报 ——
     module-graph 的 topLevelDefs 写成 `const depth = depthAt(...); if (depth === 0)`，
     dep-graph 写成 `if (depthAt(...) === 0)`，**语义等价但文本不同**（前者多一行注释与中间变量）。
     文本级断言会把"无害的风格差异"当成漂移，属过度约束。

     正确口径：断言**语义锚点**——① 抽取正则相同（决定能抽到哪些定义/引用）
     ② 关键字集合相同（决定哪些标识符被排除）③ 排除规则的正则相同（决定哪些引用被过滤）。
     这三处是"漂移会造成数字变化的**唯一**位置"；其余是等价改写，允许不同。 */
  it("内联副本与 lib/dep-graph.mjs 的语义锚点一致", () => {
    const mgSrc = readFileSync(join(ROOT, "scripts", "module-graph.mjs"), "utf8");
    const dgSrc = readFileSync(join(ROOT, "scripts", "lib", "dep-graph.mjs"), "utf8");

    /* ① 定义抽取正则：必须逐字相同 —— 它决定"哪些名字算顶层定义"。 */
    const defRe = (src) => {
      const m = src.match(/const re = (\/\^\(\?:function[\s\S]*?\/gm);/);
      return m ? m[1] : null;
    };
    expect(defRe(mgSrc), "module-graph 应含顶层定义正则").not.toBeNull();
    expect(defRe(dgSrc), "dep-graph 应含顶层定义正则").not.toBeNull();
    expect(defRe(mgSrc)).toBe(defRe(dgSrc));

    /* ② 关键字集合：逐字相同 —— 不同则 identifiers() 抽出的引用集合不同，最隐蔽的漂移点。 */
    const kwOf = (src) => {
      const m = src.match(/const KEYWORDS = new Set\(\(["']([^"']*)["']\.split/);
      return m ? m[1].split(" ").sort().join(" ") : null;
    };
    expect(kwOf(mgSrc), "module-graph 应含 KEYWORDS").not.toBeNull();
    expect(kwOf(mgSrc)).toBe(kwOf(dgSrc));

    /* ③ 引用排除规则：对象字面量键名 + 成员访问两处守卫必须逐字相同。
       （用 indexOf 计数而非 matchAll —— 正则里的转义在 JS 字符串里极易写错，
        实测 matchAll 版本把 2 数成 1，是断言自身的 bug 而非被测代码的问题。） */
    const GUARD_MEMBER = 'if (prevCh === \'.\' || (prevCh === \'?\' && code[k - 1] === \'.\')) continue;';
    const GUARD_OBJKEY = 'if (/^\\s*:(?!:)/.test(after) && (prevCh === \'{\' || prevCh === \',\')) continue;';
    for (const [label, g] of [["成员访问", GUARD_MEMBER], ["对象键名", GUARD_OBJKEY]]) {
      expect(mgSrc.includes(g), `module-graph 应含「${label}」守卫`).toBe(true);
      expect(dgSrc.includes(g), `dep-graph 应含「${label}」守卫`).toBe(true);
    }

    /* ④ 函数存在性：两边都必须各自定义（说明内联副本尚未被改走 import，本测试仍有意义）。 */
    for (const fn of ["topLevelDefs", "depthAt", "identifiers"]) {
      expect(mgSrc, `module-graph.mjs 应含 ${fn}`).toMatch(new RegExp("function\\s+" + fn + "\\s*\\("));
      expect(dgSrc, `dep-graph.mjs 应含 ${fn}`).toMatch(new RegExp("function\\s+" + fn + "\\s*\\("));
    }
  });
});
