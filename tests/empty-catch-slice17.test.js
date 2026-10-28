/**
 * empty-catch-slice17.test.js —— R-2 续集第四批：`ai-tools.js`（全仓 36 → 33）
 * ----------------------------------------------------------------------------
 * ai-tools 原有 **11** 处 P0，逐条读过上下文后：**只修 3 条，其余 8 条判定为「有理由的降级」不动**。
 * 这条「读了再判、不是全改」的分寸，是本批的主要产出 —— 数字降得少，但判断可复用。
 *
 * 修的 3 条（共同后果：**检索/统计静默降级**，用户以为是「没搜到」而不是「检索坏了」）：
 *   · `ragIndexSync` 的 bigBatch 分支：批量回填失败 ⇒ 这一轮新文档没有向量，刚加的内容搜不到；
 *   · `ragRebuildAll`：全表重建后回填失败 ⇒ 重建完仍缺向量，质量低于预期且无从察觉；
 *   · `_addTokenUsage`：token 用量落盘失败 ⇒ 用量统计漏记，成本/账单视图偏低。
 *
 * 不动的 8 条，理由都在源码注释里（本文件用断言钉住这些理由的**原文**，防后人「顺手改掉」）：
 *   · `:926` / `:2471` 孤儿向量 / 已删文档的向量删不掉 —— 注释明写「不影响召回」「下次重载仍会清」；
 *   · `:1648` / `:1788` 工具返回非 JSON —— 注释写明「解析不出来就拿不到 ok，故如实记为失败，
 *     **并非把错误吞成成功**；resultStr 原文照旧回喂模型，信息不丢」；
 *   · `:1946` 摘要失败 —— 用结构化 summary 兜底，功能不降级；
 *   · `:3341` 图表 spec 解析失败 —— 回退成文本渲染，用户仍看得到内容；
 *   · `:680` MCP `notifications/initialized` —— 「有的实现不回这条，不影响 tools/list」；
 *   · `:2531` `Promise.race` 里的 `_ragEnsuring.catch` —— **必须**吞掉否则 race 会 reject，
 *     而且后面 `cache = await ragVecLoadAll()` 会重读；注释有完整论证（引用 `RAG_BACKFILL_WAIT_MS`）。
 *
 * ⚠️ 本文件刻意**不使用正则**（只用 indexOf / includes）：
 *     写这个文件时连续两次被 shell 吃掉反斜杠（`\\s\\S` 变成 `[sS]`），导致「正则静默退化成字面量、
 *     断言恒假或恒真」这种最难查的错。而断言目标本来只是「这段字符串在附近」，不需要正则。
 *
 * 运行：npm run test:local -- tests/empty-catch-slice17.test.js
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { scanSource } from "../scripts/lib/empty-catch.mjs";

const readSrc = (f) => fs.readFileSync("src/" + f, "utf8");

describe("① 源码契约：本批 3 处具名留痕不许被删、where 不许写错、必须包二次保护", () => {
  const EXPECT = [
    ["ai-tools.js", "rag batch backfill failed", "ragIndexSync/bigBatch"],
    ["ai-tools.js", "rag full rebuild backfill failed", "ragRebuildAll"],
    ["ai-tools.js", "token usage not recorded", "_addTokenUsage"]
  ];

  it("每条都能找到 pushDiag + 正确 where + 二次保护（用 indexOf，不用正则）", () => {
    for (const [f, msg, where] of EXPECT) {
      const raw = readSrc(f);
      const at = raw.indexOf(msg);
      expect(at, f + " 的「" + msg + "」被删了 —— 留痕没了，这条 P0 会悄悄回来").toBeGreaterThan(-1);

      const near = raw.slice(Math.max(0, at - 140), at + 300);
      expect(near.indexOf('where:"' + where + '"') > -1,
        f + " 的 where 应为 " + where + "（附近 300 字符内没找到）").toBe(true);
      expect(near.indexOf("pushDiag") > -1, f + " 附近没有 pushDiag 调用").toBe(true);
      expect(near.indexOf("catch(_e") > -1, f + " 缺二次保护（上报自己抛错会变未处理拒绝）").toBe(true);
    }
  });

  it("三条消息在整仓内唯一出现一次（防复制粘贴到别处造成假绿）", () => {
    let all = "";
    for (const f of fs.readdirSync("src").filter((x) => x.endsWith(".js"))) all += readSrc(f);
    for (const item of EXPECT) {
      const msg = item[1];
      const first = all.indexOf(msg);
      expect(first > -1).toBe(true);
      expect(all.indexOf(msg, first + 1), "「" + msg + "」出现了不止一次").toBe(-1);
    }
  });
});

describe("② 计数锁：36 → 33，且 ai-tools 的 8 处「有理由的降级」不许被硬改", () => {
  it("全仓 P0 总数 ≤ 33", () => {
    let n = 0;
    for (const f of fs.readdirSync("src").filter((x) => x.endsWith(".js"))) {
      n += scanSource(readSrc(f), f).filter((i) => i.level === "P0").length;
    }
    expect(n, "P0 回涨说明有人新增静默吞错，或把本批留痕删了").toBeLessThanOrEqual(33);
  });

  it("ai-tools.js 必须恰好剩 8 处 P0（改它们之前请先读注释）", () => {
    const p0 = scanSource(readSrc("ai-tools.js"), "ai-tools.js").filter((i) => i.level === "P0");
    expect(p0.length, "数量变了：要么有人硬改，要么有人新增（都该先读那 8 处注释里的理由）").toBe(8);
  });

  it("那 8 处理由的原文必须还在（删理由注释 = 后人失去判断依据）", () => {
    const raw = readSrc("ai-tools.js");
    const REASONS = [
      "删不掉也不影响召回",
      "并非把错误吞成成功",
      "汇总失败用结构化 summary 兜底",
      "删不掉下次重载仍会清",
      "解析失败回退文本",
      "不影响 tools/list",
      "RAG_BACKFILL_WAIT_MS"
    ];
    for (const r of REASONS) {
      expect(raw.indexOf(r) > -1, "理由注释「" + r + "」被删了 —— 那处就不能再算「判过合理」").toBe(true);
    }
  });
});

describe("③ 反向对照：不该动的没被动", () => {
  it("ui-ge-api.js:63 仍是被刻意保留的 P0（R-38）", () => {
    const p0 = scanSource(readSrc("ui-ge-api.js"), "ui-ge-api.js").filter((i) => i.level === "P0");
    expect(p0.length).toBe(1);
    expect(p0[0].line).toBe(63);
  });

  it("其它文件里不该出现本批的留痕标记（防改串）", () => {
    const marks = ["rag batch backfill failed", "token usage not recorded"];
    for (const f of fs.readdirSync("src").filter((x) => x.endsWith(".js"))) {
      if (f === "ai-tools.js") continue;
      const raw = readSrc(f);
      for (const m of marks) expect(raw.indexOf(m) === -1, f + " 里出现了本批留痕「" + m + "」").toBe(true);
    }
  });
});
