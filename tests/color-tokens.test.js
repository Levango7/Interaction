import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "agent-workbench.html");
const LINT = path.join(ROOT, "scripts", "lint-colors.mjs");

describe("P0-9 硬编码颜色门禁", () => {
  let out = "";
  let code = -1;

  beforeAll(() => {
    expect(fs.existsSync(HTML), "agent-workbench.html 应存在").toBe(true);
    expect(fs.existsSync(LINT), "scripts/lint-colors.mjs 应存在").toBe(true);
    try {
      out = execFileSync("node", [LINT, HTML], { encoding: "utf8" });
      code = 0;
    } catch (e) {
      // execFileSync 在非零退出时抛错，stdout/stderr 在 e.stdout / e.stderr
      code = e.status ?? 1;
      out = (e.stdout || "") + (e.stderr || "");
    }
  });

  it("lint-colors 脚本以 exit 0 通过（0 处硬编码字面量）", () => {
    expect(code, `lint 输出:\n${out}`).toBe(0);
  });

  it("输出包含 PASS 且未报告任何违规行", () => {
    expect(out).toContain("PASS");
    expect(out).not.toContain("FAIL");
  });

  it("令牌系统同时定义了亮色与暗色双套（语义令牌已补全）", () => {
    const src = fs.readFileSync(HTML, "utf8");
    // 亮色基础令牌
    expect(src).toMatch(/--surface-muted:/);
    expect(src).toMatch(/--danger:/);
    expect(src).toMatch(/--on-accent:/);
    // 暗色主题块存在且提供了双值
    expect(src).toMatch(/:root\[data-theme="dark"\]/);
    expect(src).toMatch(/:root\[data-theme="dark"\][^]*--surface-muted:/);
    expect(src).toMatch(/:root\[data-theme="dark"\][^]*--danger:/);
  });

  it("白名单内的场景色 / 品牌渐变仍允许硬编码（不被误杀）", () => {
    const src = fs.readFileSync(HTML, "utf8");
    // SCENARIOS 场景语义色（办公主色在 v3.5.2 由 #0067c0 调整为 #0a6cbd）
    expect(src).toMatch(/office:\{\s*name:t\("scenario\.office",\s*"办公"\),\s*color:"#0a6cbd"/);
    // 亮色主题的品牌渐变令牌
    expect(src).toMatch(/--brand-grad:linear-gradient\(135deg,#0070f3,#0050d0\)/);
  });

  it("门禁精度：DOM id 不误报；var() 回退值与纯黑/白 alpha 不算违规", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-colors-"));
    const probe = path.join(dir, "probe.html");
    const src = [
      "<style>",
      ".a{color:#ccDec}",                                        // 非法 hex 长度（5 位）→ 不是颜色，不应报
      ".b{background:var(--accent-soft,rgba(10,108,189,.12))}",   // var() 回退值 → 允许
      ".c{box-shadow:0 1px 2px rgba(0,0,0,.25)}",                 // 纯黑 alpha（阴影）→ 允许
      ".d{color:#fff}",                                           // 纯白 → 允许
      ".e{color:#3498db}",                                        // 真正的硬编码 UI 色 → 必须报
      "</style>"
    ].join("\n");
    fs.writeFileSync(probe, src, "utf8");
    try {
      let code = 0, out = "";
      try {
        out = execFileSync("node", [LINT, probe], { encoding: "utf8" });
      } catch (e) {
        code = e.status ?? 1;
        out = (e.stdout || "") + (e.stderr || "");
      }
      // 只应报 .e 一处
      expect(code, `probe 输出:\n${out}`).toBe(1);
      expect(out).toContain("发现 1 处");
      expect(out).not.toContain("#ccDec");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
