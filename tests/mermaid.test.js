/**
 * mermaid.test.js —— Mermaid 懒加载渲染（2026-10-23）
 * ----------------------------------------------------------------------------
 * 单测用假的 window.mermaid 钉住：代码块识别、SVG 消毒（script/事件/外链）、
 * 失败回退源码；vendor 文件与 node_modules 逐字节一致。
 * 真渲染在 e2e（file:// + 真 vendor）里跑。
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

function mount(win, code) {
  const box = win.document.createElement("div");
  box.innerHTML = '<div class="md-body">' + win.mdToHtml("```mermaid\n" + code + "\n```") + "</div>";
  win.document.body.appendChild(box);
  return box;
}

describe("Mermaid 渲染", () => {
  it("识别 mermaid 代码块并替换为 SVG；script/事件/外链被剥离", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    win.mermaid = {
      initialize() {},
      async render() {
        return { svg: '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.test/x.css); .a{fill:red}</style><text>ok</text><script>alert(1)</script><a href="javascript:alert(1)"><text>x</text></a></svg>' };
      },
    };
    const box = mount(win, "graph TD\nA-->B");
    expect(box.querySelector("code.lang-mermaid"), "mdToHtml 应产出 lang-mermaid 代码块").toBeTruthy();
    await win.renderMermaidBlocks(box);
    const fig = box.querySelector(".mermaid-figure");
    expect(fig).toBeTruthy();
    expect(fig.querySelector("svg")).toBeTruthy();
    expect(fig.querySelector("script")).toBeNull();
    expect(fig.innerHTML).not.toContain("javascript:");
    expect(fig.innerHTML).not.toContain("@import");
    expect(box.querySelector("pre"), "成功后源码块应被替换").toBeNull();
  });

  it("渲染失败 → 保留源码 + 提示，不静默吞图", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    win.mermaid = { initialize() {}, async render() { throw new Error("boom"); } };
    const box = mount(win, "graph TD\nA-->B");
    await win.renderMermaidBlocks(box);
    expect(box.querySelector("pre code.lang-mermaid"), "源码必须保留").toBeTruthy();
    expect(box.querySelector(".mermaid-fail")).toBeTruthy();
  });

  it("库还没加载时同步出现加载态（线上首图 13.6s，不能只给源码块）", () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    expect(win.mermaid, "本用例要求库未加载").toBeFalsy();
    const box = mount(win, "graph TD;A-->B;");
    /* 故意不 await：jsdom 不取外部资源，加载永远不完成 —— 要断言的是"同步那一瞬" */
    win.renderMermaidBlocks(box);
    const hint = box.querySelector(".mermaid-loading");
    expect(hint, "调用返回前就要挂上加载态").toBeTruthy();
    expect(String(hint.textContent)).toContain("加载");
  });

  it("流式消息里的 mermaid 不渲染（避免半截代码反复渲染）", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    let calls = 0;
    win.mermaid = { initialize() {}, async render() { calls++; return { svg: "<svg></svg>" }; } };
    const box = win.document.createElement("div");
    box.innerHTML = '<div class="md-body streaming">' + win.mdToHtml("```mermaid\ngraph TD\n```") + "</div>";
    win.document.body.appendChild(box);
    await win.renderMermaidBlocks(box);
    expect(calls).toBe(0);
    expect(box.querySelector(".mermaid-figure")).toBeNull();
  });
});

describe("vendor/mermaid", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  it("与 node_modules 逐字节一致，版本钉在 10.x", () => {
    const pkg = JSON.parse(readFileSync(join(root, "node_modules/mermaid/package.json"), "utf8"));
    expect(pkg.version.split(".")[0]).toBe("10");
    for (const [dest, src] of [["mermaid.min.js", "dist/mermaid.min.js"], ["LICENSE", "LICENSE"]]) {
      const d = join(root, "vendor/mermaid", dest);
      expect(existsSync(d), d).toBe(true);
      expect(readFileSync(d).equals(readFileSync(join(root, "node_modules/mermaid", src))), dest + " 不同步").toBe(true);
    }
  });
});
