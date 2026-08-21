import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "agent-workbench.html");

describe("T4.1 设计令牌体系", () => {
  let src = "";
  let rootBlock = "";
  let darkBlock = "";

  beforeAll(() => {
    expect(fs.existsSync(HTML), "agent-workbench.html 应存在").toBe(true);
    src = fs.readFileSync(HTML, "utf8");
    // 提取 :root{...} 第一个块（亮色令牌定义）
    const rootMatch = src.match(/:root\{([^}]*)\}/);
    expect(rootMatch, ":root 块应存在").toBeTruthy();
    rootBlock = rootMatch[1];
    // 提取 :root[data-theme="dark"]{...} 块
    const darkMatch = src.match(/:root\[data-theme="dark"\]\{([^}]*)\}/);
    expect(darkMatch, "暗色主题块应存在").toBeTruthy();
    darkBlock = darkMatch[1];
  });

  it(":root 包含完整间距令牌 --space-1 到 --space-8", () => {
    for (let i = 1; i <= 8; i++) {
      expect(rootBlock, `应包含 --space-${i}`).toContain(`--space-${i}:`);
    }
  });

  it(":root 间距令牌值为 4px 基线网格（4/8/12/16/20/24/28/32px）", () => {
    const expected = { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "20px", 6: "24px", 7: "28px", 8: "32px" };
    for (const [k, v] of Object.entries(expected)) {
      expect(rootBlock, `--space-${k} 应为 ${v}`).toContain(`--space-${k}:${v}`);
    }
  });

  it(":root 包含完整字号令牌 --fs-xs 到 --fs-2xl", () => {
    const sizes = ["xs", "sm", "base", "md", "lg", "xl", "2xl"];
    for (const s of sizes) {
      expect(rootBlock, `应包含 --fs-${s}`).toContain(`--fs-${s}:`);
    }
  });

  it(":root 包含完整圆角令牌 --radius-sm/md/lg/xl", () => {
    const radii = ["sm", "md", "lg", "xl"];
    for (const r of radii) {
      expect(rootBlock, `应包含 --radius-${r}`).toContain(`--radius-${r}:`);
    }
  });

  it(":root 包含阴影令牌 --shadow-1/2/3 与过渡令牌 --transition-fast/base/slow", () => {
    for (let i = 1; i <= 3; i++) {
      expect(rootBlock, `应包含 --shadow-${i}`).toContain(`--shadow-${i}:`);
    }
    const transitions = ["fast", "base", "slow"];
    for (const t of transitions) {
      expect(rootBlock, `应包含 --transition-${t}`).toContain(`--transition-${t}:`);
    }
  });

  it("暗色主题 [data-theme=dark] 覆盖所有新令牌（间距/字号/圆角/阴影/过渡）", () => {
    // 间距
    for (let i = 1; i <= 8; i++) {
      expect(darkBlock, `暗色应覆盖 --space-${i}`).toContain(`--space-${i}:`);
    }
    // 字号
    for (const s of ["xs", "sm", "base", "md", "lg", "xl", "2xl"]) {
      expect(darkBlock, `暗色应覆盖 --fs-${s}`).toContain(`--fs-${s}:`);
    }
    // 圆角
    for (const r of ["sm", "md", "lg", "xl"]) {
      expect(darkBlock, `暗色应覆盖 --radius-${r}`).toContain(`--radius-${r}:`);
    }
    // 阴影
    for (let i = 1; i <= 3; i++) {
      expect(darkBlock, `暗色应覆盖 --shadow-${i}`).toContain(`--shadow-${i}:`);
    }
    // 过渡
    for (const t of ["fast", "base", "slow"]) {
      expect(darkBlock, `暗色应覆盖 --transition-${t}`).toContain(`--transition-${t}:`);
    }
  });

  it("暗色阴影较亮色加深（alpha 更大）以保持深色背景可见性", () => {
    // 亮色 --shadow-1 alpha=.06，暗色应更大
    expect(rootBlock).toContain("--shadow-1:0 1px 2px rgba(0,0,0,.06)");
    expect(darkBlock).toContain("--shadow-1:0 1px 2px rgba(0,0,0,.4)");
    expect(darkBlock).toContain("--shadow-2:0 2px 8px rgba(0,0,0,.5)");
    expect(darkBlock).toContain("--shadow-3:0 4px 16px rgba(0,0,0,.6)");
  });

  it("组件设计规范类 .btn-primary/.btn-ghost/.btn-danger 已定义", () => {
    // 匹配 CSS 类选择器（行首或前导空白后跟 .className{）
    expect(src, "应定义 .btn-primary").toMatch(/\.btn-primary\s*\{/);
    expect(src, "应定义 .btn-ghost").toMatch(/\.btn-ghost\s*\{/);
    expect(src, "应定义 .btn-danger").toMatch(/\.btn-danger\s*\{/);
  });

  it("统一卡片样式 .card 与输入框样式 .input 已定义", () => {
    expect(src, "应定义 .card").toMatch(/\.card\s*\{/);
    expect(src, "应定义 .input").toMatch(/\.input\s*\{/);
  });

  it("组件类使用设计令牌（var(--space-*)/var(--radius-*)/var(--shadow-*)）", () => {
    // .btn-primary 应引用 --radius-md 与 --space-2/--space-4
    const btnPrimaryMatch = src.match(/\.btn-primary\{[^}]*\}/);
    expect(btnPrimaryMatch, ".btn-primary 块应存在").toBeTruthy();
    const btnPrimary = btnPrimaryMatch[0];
    expect(btnPrimary).toContain("var(--radius-md)");
    expect(btnPrimary).toContain("var(--space-2)");
    expect(btnPrimary).toContain("var(--space-4)");
    expect(btnPrimary).toContain("var(--accent)");
    // .input 应引用 --radius-sm 与 --space-2
    const inputMatch = src.match(/\.input\{[^}]*\}/);
    expect(inputMatch, ".input 块应存在").toBeTruthy();
    const inputRule = inputMatch[0];
    expect(inputRule).toContain("var(--radius-sm)");
    expect(inputRule).toContain("var(--space-2)");
  });
});