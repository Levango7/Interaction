/**
 * build-structure.test.js —— 构建结构守护（分层外置 + 立绘外置的"防复发"测试）
 * ----------------------------------------------------------------------------
 * 背景：源码态（HTML 只有占位标记 + src/ 35 个层块 + assets/pet 9 张立绘）经 pre 钩子拼回成
 * 交付态单文件。这套"外置/拼回"机制在开发中踩过四类结构性坑，本文件把它们固化成断言：
 *   ① 块边界越过 </script>（收尾标签被搬进 src，拼回后 END 标记落到 HTML 之外）
 *   ② 拼回后再抽取产生重复标记（BEGIN/END 嵌套成两份）
 *   ③ 依赖 HTML 字面量的老脚本失效（如 pet-art 找不到 _PET_ART 占位符）
 *   ④ post 钩子顺序颠倒：立绘 base64 被抽回 src/（v3.7.58~v3.7.63 双存 ~849KB；v3.7.64 修复并在此设防）
 * 因此这里断言的是「结构不变量」，与具体业务无关，任何一次外置/拼回改动都要过这一关。
 *
 * 注意：本测试读磁盘文件（HTML + src/ + assets/pet），不通过 loadApp 加载应用。
 *   CI 的 npm test 会先跑 pretest（src-split 拼回 → pet-art 注入），所以断言的是**交付态**。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
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

  it("src/ 不含 base64 图片数据（立绘只在 assets/pet；防 post 钩子顺序回归）", () => {
    const offenders = srcFiles.filter(f => /data:image\/[a-z0-9.+-]+;base64,/i.test(readFileSync(join(srcDir, f), "utf8")));
    expect(offenders, "以下 src 文件内联了 base64 —— 抽取必须按「pet-art --extract → src-split --extract」顺序").toEqual([]);
  });

  it("静态标记里同一元素不得有两个 class 属性（第二个会被解析器静默丢弃）", () => {
    /* v3.7.65：实测清掉 4 处（btnHelp / btnInstall / chatSessionBtn / pluginAddJson）。
       HTML 规范只采用第一个 class 属性，第二个连同它的意图一起消失 —— 表现为「样式莫名失效」，
       不报错、lint 与用例都照不到，只有对比渲染才发现。故把这条结构不变量钉住。
       只扫静态标记：注入态的 JS 里合法存在拼 HTML 的字符串，先剥掉 <script> 再匹配。 */
    const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
    const dup = [...markup.matchAll(/<[a-zA-Z][^>]*\bclass="[^"]*"[^>]*\bclass="/g)].map(m => m[0].slice(0, 120));
    expect(dup, "发现重复 class 属性：" + dup.join(" ;; ")).toEqual([]);
  });

  it("拼回态下 check:source-state 必须拦住并说出还原指令（npm 失败不跑 posttest 的兜底）", () => {
    /* npm 的语义是 test 脚本非 0 → posttest 不执行，工作区会留在拼回态（v3.7.64 记为「仅观察」）。
       本版把兜底核实并钉住：门禁必须①拒绝退出、②给出可执行指令；且实测该指令幂等安全
       （源码态重复跑 `src:extract` 走「跳过」分支，src 与 HTML 逐字节不变，不会抽空源码）。
       断言按当前状态分支：npm test 下是拼回态 → 要求拦住；源码态手跑 → 要求放行。 */
    const injected = Buffer.byteLength(html) > 1_200_000;
    const r = spawnSync(process.execPath, [join(root, "scripts", "check-source-state.mjs")], { encoding: "utf8", cwd: root });
    const out = (r.stdout || "") + (r.stderr || "");
    if (injected) {
      expect(r.status, "拼回态下 check:source-state 必须非 0 退出").not.toBe(0);
      expect(out, "拦截信息必须给出可执行的还原指令").toContain("npm run src:extract");
    } else {
      expect(r.status, "源码态下 check:source-state 应放行：" + out).toBe(0);
    }
  });
});
