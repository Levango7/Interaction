/**
 * manual-consistency.test.js —— 用户手册的结构守护（v3.7.132 新增）
 * ----------------------------------------------------------------------------
 * 背景：`docs/user-manual.md` 的「0. 十分钟上手」是**新用户唯一的转化路径**，
 * 而它内部靠 4 个站内锚点跳到 5.1 / 5.2 的判定表。锚点这种东西**断了不会报错**：
 * 点一下没反应，或者跳到页首 —— 谁也不会以为是文档的问题。
 * 所以这里只守**结构**（不守文案内容）：
 *   ① 每个 `](#anchor)` 都能对上某个标题算出来的 slug；
 *   ② 目录里的编号与章节标题一一对应（防止"目录里有第 0 章、正文没有"）；
 *   ③ 十分钟上手必须引用判定口径（它可以被删掉，但那等于把唯一的上手路径退化成目录）。
 *
 * 为什么不守"文案是否与产品一致"：那需要把每条 toast 的语义搬进测试里，
 * 维护成本高于收益，且会被"改文案"这类无害改动反复打红。文案口径的守护放在
 * 判定表的**源头**（ui-global-events.js 的分支 + i18n），这里只管**链接不烂**。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MD = readFileSync(join(ROOT, "docs", "user-manual.md"), "utf8");
const LINES = MD.split("\n");

/** GitHub 风格标题 slug：小写；去掉行内标记与标点；**每个空白各变一个连字符**（中文保留）。
 *  ⚠️ 空白必须逐个替换而不是 `\s+ → "-"`：`（三个必填 + 一个可选）` 去掉 `+` 后剩两个空格，
 *  GitHub 会生成两个连字符（`--`），折叠成一个就会把正确锚点误判成坏链（本用例第一版就栽在这）。 */
const slugOf = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");

/** 所有标题（# 开头的行）→ slug 集合 */
function headingSlugs() {
  const out = new Set();
  for (const l of LINES) {
    const m = /^#{1,6}\s+(.*)$/.exec(l);
    if (m) out.add(slugOf(m[1]));
  }
  return out;
}

describe("用户手册 · 结构守护", () => {
  it("① 所有站内锚点都能解析（断了不会报错，所以必须机械守）", () => {
    const slugs = headingSlugs();
    const anchors = [...MD.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
    expect(anchors.length, "手册里应有站内锚点（十分钟上手会跳到 5.1/5.2）").toBeGreaterThan(0);
    const broken = [...new Set(anchors)].filter((a) => !slugs.has(a));
    expect(broken, "这些锚点找不到对应标题（标题改了就同步改锚点）：" + broken.join(", ")).toEqual([]);
  });

  it("② 目录条目与正文章节一一对应", () => {
    const toc = LINES.slice(0, LINES.findIndex((l) => l.startsWith("## 0.")));
    const tocItems = toc.map((l) => /^(\d+)\.\s+/.exec(l)).filter(Boolean).map((m) => m[1]);
    const sections = [...MD.matchAll(/^## (\d+)\.\s+/gm)].map((m) => m[1]);
    expect(tocItems, "目录编号与正文标题必须同集合（缺一个就是死链目录）").toEqual(sections);
  });

  it("③ 十分钟上手必须把判定口径指出来（否则新用户只剩目录可读）", () => {
    const start = MD.indexOf("## 0. 十分钟上手");
    const end = MD.indexOf("## 1. ");
    expect(start, "第 0 章缺失 —— 它是新用户唯一的转化路径").toBeGreaterThan(-1);
    const ch0 = MD.slice(start, end);
    expect(ch0).toMatch(/测试连接/);
    expect(ch0).toMatch(/扫描模型/);
    expect(ch0).toMatch(/\]\(#5/); // 至少一个跳到 5.x 判定表的锚点
    /* 五步骨架：建任务 → 配 AI → 让 AI 动手 → 危险操作 → 备份。少一步就是转化路径缺环。 */
    for (const must of ["第 1 步", "第 2 步", "第 3 步", "第 4 步", "第 5 步"]) {
      expect(ch0, "缺 " + must).toContain(must);
    }
  });
});
