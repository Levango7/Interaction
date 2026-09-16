/**
 * build-structure.test.js —— 构建结构守护（分层外置 + 立绘外置的"防复发"测试）
 * ----------------------------------------------------------------------------
 * 背景：源码态（HTML 只有占位标记 + src/ 26 个层块 + assets/pet 9 张立绘）经 pre 钩子拼回成
 * 交付态单文件。这套"外置/拼回"机制在开发中踩过三类结构性坑，本文件把它们固化成断言：
 *   ① 块边界越过 </script>（收尾标签被搬进 src，拼回后 END 标记落到 HTML 之外）
 *   ② 拼回后再抽取产生重复标记（BEGIN/END 嵌套成两份）
 *   ③ 依赖 HTML 字面量的老脚本失效（如 pet-art 找不到 _PET_ART 占位符）
 * 因此这里断言的是「结构不变量」，与具体业务无关，任何一次外置/拼回改动都要过这一关。
 *
 * 注意：本测试读磁盘文件（HTML + src/ + assets/pet），不通过 loadApp 加载应用。
 *   CI 的 npm test 会先跑 pretest（src-split 拼回 → pet-art 注入），所以断言的是**交付态**。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");
const exists = p => existsSync(join(root, p));

const html = read("agent-workbench.html");
const srcDir = join(root, "src");
const srcFiles = existsSync(srcDir) ? readdirSync(srcDir).filter(f => f.endsWith(".js")) : [];
const order = exists("src/order.json") ? JSON.parse(read("src/order.json")) : [];
const petAssets = existsSync(join(root, "assets/pet")) ? readdirSync(join(root, "assets/pet")).filter(f => f.endsWith(".png")) : [];

const BEGIN = /\/\*SRC:([\w-]+):BEGIN\*\//g;
const END = /\/\*SRC:([\w-]+):END\*\//g;
const names = (re, s) => [...s.matchAll(re)].map(m => m[1]);

describe("构建结构守护 · 分层外置", () => {
  it("src/ 与 order.json 一一对应（没有孤儿文件 / 空条目）", () => {
    expect(srcFiles.length).toBeGreaterThan(0);
    const ordered = order.map(o => o.name);
    expect(ordered.length).toBe(srcFiles.length);
    for (const n of ordered) expect(srcFiles).toContain(n + ".js");
    /* order.json 里不允许重复条目（重复会导致拼回两次） */
    expect(new Set(ordered).size).toBe(ordered.length);
  });

  it("拼回态：每个层块的 BEGIN/END 标记恰好各一个（防嵌套重复）", () => {
    const begins = names(BEGIN, html);
    const ends = names(END, html);
    expect(begins.length).toBe(order.length);
    expect(ends.length).toBe(order.length);
    expect(new Set(begins).size).toBe(begins.length);
    expect(new Set(ends).size).toBe(ends.length);
    expect([...begins].sort()).toEqual([...ends].sort());
  });

  it("拼回态：标记成对且顺序正确（BEGIN 在对应 END 之前）", () => {
    for (const n of order.map(o => o.name)) {
      const b = html.indexOf(`/*SRC:${n}:BEGIN*/`);
      const e = html.indexOf(`/*SRC:${n}:END*/`);
      expect(b, n + " 缺少 BEGIN").toBeGreaterThan(-1);
      expect(e, n + " 缺少 END").toBeGreaterThan(b);
    }
  });

  it("拼回态：所有标记都落在 <script> 内（防块边界越过 </script>）", () => {
    const scriptStart = html.indexOf("<script");
    const scriptEnd = html.lastIndexOf("</script>");
    const lastMarker = html.lastIndexOf("/*SRC:");
    expect(scriptEnd).toBeGreaterThan(scriptStart);
    expect(lastMarker, "最后一个标记必须在 </script> 之前").toBeLessThan(scriptEnd);
    expect(html.indexOf("/*SRC:"), "首个标记必须在 <script> 之后").toBeGreaterThan(scriptStart);
  });

  it("拼回态：7 大层的关键层注释都还在（分层契约未被外置破坏）", () => {
    for (const layer of ["Util", "Crypto", "Data", "Chain", "AI", "Render", "UI"]) {
      expect(html, layer + " Layer 注释缺失").toContain(`// ===== ${layer} Layer`);
    }
  });

  it("拼回态：块内容确实被拼了回来（不是空占位）", () => {
    /* 取第一个块，断言标记之间存在非空内容 */
    const n = order[0].name;
    const b = html.indexOf(`/*SRC:${n}:BEGIN*/`);
    const e = html.indexOf(`/*SRC:${n}:END*/`);
    const body = html.slice(b, e);
    expect(body.length).toBeGreaterThan(200);
  });
});

describe("构建结构守护 · 立绘外置", () => {
  it("assets/pet 的 PNG 与 order.json 里的立绘键一致", () => {
    expect(petAssets.length).toBeGreaterThan(0);
    expect(exists("assets/pet/order.json")).toBe(true);
    const artOrder = JSON.parse(read("assets/pet/order.json"));
    expect(artOrder.length).toBe(petAssets.length);
    for (const k of artOrder) expect(petAssets).toContain(k + ".png");
  });

  it("拼回态：_PET_ART 注入的 base64 与 assets/pet 的文件字节一致", () => {
    const block = html.match(/const _PET_ART = \{[\s\S]*?\};/);
    expect(block, "未找到 _PET_ART 字面量（pet-art 未注入？）").toBeTruthy();
    const injected = {};
    for (const kv of block[0].matchAll(/"([\w]+)"\s*:\s*"data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)) injected[kv[1]] = kv[2];
    const artOrder = JSON.parse(read("assets/pet/order.json"));
    expect(Object.keys(injected).length, "注入的立绘数量与 assets 不符").toBe(artOrder.length);
    for (const k of artOrder) {
      const a = Buffer.from(injected[k], "base64");
      const b = readFileSync(join(root, "assets/pet", k + ".png"));
      expect(a.equals(b), k + ".png 注入内容与素材文件不一致").toBe(true);
    }
  });
});
