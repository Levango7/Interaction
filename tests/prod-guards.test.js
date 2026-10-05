/**
 * prod-guards.test.js —— build:prod 的「转换 + 转换后自检」守护（审计 P2-4）
 * ----------------------------------------------------------------------------
 * 被测对象：scripts/lib/prod-guards.mjs（build.mjs --prod 的转换与自检全走它）。
 *
 * 背景：`build:prod` 此前只做存在性检查（RE.test）就替换落盘：
 *   ① __TEST_GATE__ 的 RE 是非贪心 `[\s\S]*?\}\)\(\);`，命中**第一个** `})();` ——
 *      块体内一旦出现更早的 `})();`（嵌套函数/字符串），替换会截断块体，
 *      产物留下悬挂尾巴（整段 <script> 语法错误），而构建步骤照样绿。
 *   ② `<script` 字样在本产物里出现 6 次、其中 5 次是 JS 字符串字面量（审计实测）——
 *      用 lastIndexOf("<script") 之类朴素截取会抽到字符串中间（取证时首版即踩此坑）。
 *   ③ SW 的 CACHE_VERSION 若出现第二处定义，replace 只换第一处、旧值覆盖回来，
 *      缓存失效被静默绕过。
 *
 * 本测试全部**进程内**执行（不 spawn、不联网），理由与 tests/dep-graph-parity.test.js 同：
 * 本仓测试沙箱禁止子进程派生，spawn 型断言会在本机「假红」、在 CI「假绿」。
 * 仅末尾 2 例 CLI 冒烟需要 spawn（真跑 build.mjs 验证接线），用 spawn-available.js
 * 的 EBUSY 指纹识别沙箱并跳过——在 CI / 正常环境真实执行。
 *
 * 真产物集成用例（恰 1 个 JS 块、2.8MB 整体编译）在**拼回态**才运行：
 *   · CI 的 npm test：pretest 已拼回 → 执行；
 *   · 本机 `npm run test:local` 若处于源码态 → 显示 skipped（可见，不伪装成绿色通过）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  transformTestGate,
  findScriptBlocks,
  assertScriptParses,
  assertScriptsParse,
  bumpServiceWorker,
} from "../scripts/lib/prod-guards.mjs";
import { isSandboxSpawnResult, SANDBOX_SKIP_REASON } from "./helpers/spawn-available.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const GATE_LINE = 'var __TEST_GATE__ = (function(){ return false; })();';
const PROD_MARK = 'var __TEST_GATE__ = false; /* [prod build] test hooks disabled */';

/** 合成一份最小 HTML（含恰好 1 处 gate 定义 + 一段可编译 JS）。 */
const mkHtml = (gateLine = GATE_LINE) =>
  [
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>',
    "<script>",
    gateLine,
    'const marker = "ok";',
    "</script>",
    "</body></html>",
  ].join("\n");

/* ===========================================================================
 * ① __TEST_GATE__ 转换：定义数必须恰为 1，替换后逐项自检
 * ======================================================================== */
describe("prod-guards ① transformTestGate：定义数恰 1 + 替换后自检", () => {
  it("正常：1 定义 → 恰 1 处 false 标记、IIFE 消失、其余字节不动", () => {
    const html = mkHtml();
    const out = transformTestGate(html);
    expect((out.match(/var __TEST_GATE__ = false;/g) || []).length).toBe(1);
    expect(out).not.toContain("var __TEST_GATE__ = (function");
    expect(out).toContain('const marker = "ok";'); // 尾部未被误伤
    expect(out.length).toBe(html.length - GATE_LINE.length + PROD_MARK.length);
  });

  it("0 定义 → 必须抛（不得在无 gate 的输入上静默「生成」残缺产物）", () => {
    expect(() => transformTestGate(mkHtml("var X = 1;"))).toThrow(/定义数应为 1，实际 0/);
  });

  it("2 定义 → 必须抛（旧实现只换第一处，第二处会把钩子带进生产）", () => {
    const html = mkHtml() + "\n<script>" + GATE_LINE + "</script>";
    expect(() => transformTestGate(html)).toThrow(/定义数应为 1，实际 2/);
  });

  it("截断类：块体内更早的 `})();` —— transform 不报错，但产物**编译**必须红（证明编译步是承重的）", () => {
    /* 复刻 RE 非贪心的坏形态：字符串字面量里的 `})();` 是第一个命中点，
       替换到那里就停 → 产物尾部留下 `"; return false; })();` 悬挂片段。
       transform 自身的三项检查（定义数/不再匹配/false 计数）全都发现不了它，
       只有把整段 <script> 交给解析器（vm.Script）才会拒绝 —— 这正是 P2-4 的核心理由。 */
    const BAD = 'var __TEST_GATE__ = (function(){ const s = "})();"; return false; })();';
    let prod;
    expect(() => { prod = transformTestGate(mkHtml(BAD)); }).not.toThrow();
    expect(prod).toContain('"; return false; })();'); // 悬挂尾巴确实在
    expect(() => assertScriptParses(prodHtmlScript(prod), "fixture")).toThrow(/编译失败/);
  });
});

/** 抽出合成 HTML 里 <script> 块正文（供 ① 的截断用例复用浏览器语义扫描）。 */
function prodHtmlScript(html) {
  const js = findScriptBlocks(html).filter((b) => b.kind === "js");
  if (js.length !== 1) throw new Error(`合成夹具应恰有 1 个 JS 块，实际 ${js.length}`);
  return js[0].code;
}

/* ===========================================================================
 * ② 真实 <script> 块抽取（浏览器语义）+ 整体编译
 * ======================================================================== */
describe("prod-guards ② findScriptBlocks / assertScriptsParse", () => {
  it("浏览器语义：块内的 `<script` 字面量与转义 `\\<\\/script>` 不产生假块", () => {
    const synth = [
      "<!DOCTYPE html><html><head>",
      '<script type="application/ld+json">{"a":1}</script>',
      '<script src="ext.js"></script>',
      "</head><body>",
      "<script>",
      'const a = "<script>"; const b = "<\\/script>"; const c = "<script src=x>";',
      "var __TEST_GATE__ = (function(){ return false; })();",
      "</script>",
      "</body></html>",
    ].join("\n");
    const blocks = findScriptBlocks(synth);
    expect(blocks.map((b) => b.kind)).toEqual(["other", "external", "js"]);
    const js = blocks[2];
    expect(js.code).toContain("var __TEST_GATE__");
    expect(js.code).toContain('const b = "<\\/script>";'); // 转义写法未被当成结束标签
    expect(js.code.endsWith("\n")).toBe(true);
  });

  it("无任何真实 <script> 块 → 抛（HTML 未注入 / 结构损坏，不得静默通过）", () => {
    expect(() => assertScriptsParse("<html><body>no script</body></html>", "x")).toThrow(/未找到任何真实 <script> 块/);
  });

  /* 真产物集成：拼回态才有意义（源码态 HTML 无 gate 定义、无应用 JS）。
     it.skipIf 让本机源码态运行显示为 skipped（可见），CI 拼回态真实执行。 */
  const assembled = readFileSync(join(root, "agent-workbench.html"), "utf8");
  const injected = Buffer.byteLength(assembled) > 1_200_000;
  it.skipIf(!injected)("真产物：恰 1 个 JS 块（2.8MB 级）且 build:prod 全链（转换+编译）通过", () => {
    const js = findScriptBlocks(assembled).filter((b) => b.kind === "js");
    expect(js.length, "真产物应恰有 1 个真实 JS 块（其余 `<script` 字样是 JS 字符串）").toBe(1);
    expect(js[0].code.length).toBeGreaterThan(2_000_000);
    const info = assertScriptsParse(transformTestGate(assembled), "agent-workbench.prod.html");
    expect(info.checked).toBe(1);
    expect(info.bytes).toBeGreaterThan(2_000_000);
  });
});

/* ===========================================================================
 * ③ SW 缓存版本 bump：定义数恰 1，替换后自检
 * ======================================================================== */
describe("prod-guards ③ bumpServiceWorker", () => {
  it("正常：新值恰 1 处、旧值消失、其余字节不动", () => {
    const sw = 'var CACHE_VERSION = "v3.7.92-20261005d";\nvar OTHER = 1;\n';
    const { code, cacheVer } = bumpServiceWorker(sw, "3.7.93", "20261006120000");
    expect(cacheVer).toBe("v3.7.93-20261006120000");
    expect((code.match(/var CACHE_VERSION = "[^"]*";/g) || []).length).toBe(1);
    expect(code).toContain('var CACHE_VERSION = "v3.7.93-20261006120000";');
    expect(code).not.toContain("v3.7.92-20261005d");
    expect(code).toContain("var OTHER = 1;");
  });

  it("异常入参必须显式报错：0 定义 / 2 定义 / 空版本 / 时间戳格式", () => {
    const ok = 'var CACHE_VERSION = "v1-20260101000000";';
    expect(() => bumpServiceWorker("var X = 1;", "3.7.93", "20261006120000")).toThrow(/定义数应为 1，实际 0/);
    expect(() => bumpServiceWorker('var CACHE_VERSION = "a";\nvar CACHE_VERSION = "b";', "3.7.93", "20261006120000")).toThrow(/实际 2/);
    expect(() => bumpServiceWorker(ok, "", "20261006120000")).toThrow(/版本为空/);
    expect(() => bumpServiceWorker(ok, "3.7.93", "abc")).toThrow(/时间戳格式/);
  });

  it("真 service-worker.js：恰 1 处 CACHE_VERSION 定义（多定义会让 bump 只换第一处、缓存失效被绕过）", () => {
    const real = readFileSync(join(root, "service-worker.js"), "utf8");
    const { code } = bumpServiceWorker(real, "9.9.9", "20991231235959");
    expect((code.match(/var CACHE_VERSION = "[^"]*";/g) || []).length).toBe(1);
    expect(code).toContain('var CACHE_VERSION = "v9.9.9-20991231235959";');
  });
});

/* ===========================================================================
 * ④ build.mjs --prod 端到端冒烟（临时夹具；spawn，沙箱 EBUSY 时跳过）
 *    为什么要 CLI 级：①②③ 测的是 lib 函数，但「build.mjs 是否真的接上了它们、
 *    「校验先于落盘」是否成立」只有真跑一次进程才能验证（接线断掉时单元测试全绿）。
 * ======================================================================== */
describe("prod-guards ④ build.mjs --prod 端到端冒烟（含损坏输入负例）", () => {
  const setup = (gateLine) => {
    const dir = mkdtempSync(join(tmpdir(), "prod-guards-"));
    mkdirSync(join(dir, "scripts", "lib"), { recursive: true });
    cpSync(join(root, "scripts", "build.mjs"), join(dir, "scripts", "build.mjs"));
    cpSync(join(root, "scripts", "lib", "prod-guards.mjs"), join(dir, "scripts", "lib", "prod-guards.mjs"));
    writeFileSync(join(dir, "agent-workbench.html"), mkHtml(gateLine), "utf8");
    return dir;
  };

  it("正例：正常夹具 → 退出 0、产物含 false 标记、日志含自检", () => {
    let dir;
    try {
      dir = setup(GATE_LINE);
    } catch (e) {
      return void console.warn("[skip] 临时夹具不可写（环境限制）：" + e.message);
    }
    try {
      const r = spawnSync(process.execPath, [join(dir, "scripts", "build.mjs"), "--prod"], { encoding: "utf8", cwd: dir });
      if (isSandboxSpawnResult(r)) return void console.warn("[skip] " + SANDBOX_SKIP_REASON);
      const out = (r.stdout || "") + (r.stderr || "");
      expect(r.status, out).toBe(0);
      const prod = readFileSync(join(dir, "agent-workbench.prod.html"), "utf8");
      expect((prod.match(/var __TEST_GATE__ = false;/g) || []).length).toBe(1);
      expect(prod).not.toContain("var __TEST_GATE__ = (function");
      expect(out).toContain("产物自检");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("负例：截断类损坏输入 → 构建必须红，且不得落盘损坏产物（校验先于落盘）", () => {
    const BAD = 'var __TEST_GATE__ = (function(){ const s = "})();"; return false; })();';
    let dir;
    try {
      dir = setup(BAD);
    } catch (e) {
      return void console.warn("[skip] 临时夹具不可写（环境限制）：" + e.message);
    }
    try {
      const r = spawnSync(process.execPath, [join(dir, "scripts", "build.mjs"), "--prod"], { encoding: "utf8", cwd: dir });
      if (isSandboxSpawnResult(r)) return void console.warn("[skip] " + SANDBOX_SKIP_REASON);
      const out = (r.stdout || "") + (r.stderr || "");
      expect(r.status, out).not.toBe(0);
      expect(out).toContain("编译失败");
      expect(existsSync(join(dir, "agent-workbench.prod.html")), "损坏产物不得落盘").toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
