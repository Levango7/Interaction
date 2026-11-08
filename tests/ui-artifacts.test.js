/**
 * ui-artifacts.test.js —— 三模式产物域观感（2026-11-07）
 * ----------------------------------------------------------------------------
 * 甲案：对话为主 + 产物卡。本文件钉住三件事：
 *   ① 聊天里的围栏代码块渲染成「代码卡」（语言标签 + 复制按钮）；mermaid 块保持原样
 *      （renderMermaidBlocks 依赖 pre > code.lang-mermaid 并整块替换 pre）。
 *   ② 复制按钮真写剪贴板，成功/失败都有回执（writeText 是 Promise，同步 try/catch 抓不到 rejection）。
 *   ③ 空对话的快捷指令随模式切换（code / design 各有自己的默认产物域）。
 */
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const win = loadApp({ storage: { [PREFIX + "onboarded"]: "true" } });
  win.__test.setActive("office");
  win.__test.render();
  win.renderChat();
  return win;
}

describe("① mdToHtml 代码卡", () => {
  it("围栏块带语言标签与复制按钮；无语言时标 text", () => {
    const win = loadApp();
    const { mdToHtml } = win.__test;
    const withLang = mdToHtml("```js\nconst x = 1;\n```");
    expect(withLang).toContain('class="md-code"');
    expect(withLang).toContain('class="md-code-lang">js<');
    expect(withLang).toContain("data-code-copy");
    /* 2026-11-08 语法高亮后 HTML 被 token span 切开，改为断言可见文本逐字保真（复制语义不变） */
    const doc = new win.DOMParser().parseFromString(withLang, "text/html");
    expect(doc.querySelector(".md-code pre code").textContent).toBe("const x = 1;");
    const noLang = mdToHtml("```\nplain\n```");
    expect(noLang).toContain('class="md-code-lang">text<');
  });

  it("mermaid 块不套代码卡头（mermaid 渲染依赖 pre > code 选择器）", () => {
    const win = loadApp();
    const { mdToHtml } = win.__test;
    const out = mdToHtml("```mermaid\ngraph TD;A-->B;\n```");
    expect(out).toContain('class="block lang-mermaid"');
    expect(out).not.toContain("md-code");
  });
});

describe("② 代码卡复制", () => {
  it("点击复制写入剪贴板文本，按钮回执后复位", async () => {
    const win = boot();
    win.__test.appendChat("office", { role: "assistant", content: "看这段：\n\n```js\nconst a = 1;\n```" });
    win.renderChat();
    win.bindChatPanel();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(win.navigator, "clipboard", { value: { writeText }, configurable: true });
    const btn = win.document.querySelector("#chat [data-code-copy]");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe("复制");
    btn.click();
    await wait(20);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe("const a = 1;");
    expect(btn.textContent).toBe("已复制");
    await wait(1300);
    expect(btn.textContent).toBe("复制");
    win.close();
  });

  it("剪贴板拒绝时显示「复制失败」而不是假称成功", async () => {
    const win = boot();
    win.__test.appendChat("office", { role: "assistant", content: "```js\nx\n```" });
    win.renderChat();
    win.bindChatPanel();
    Object.defineProperty(win.navigator, "clipboard", {
      value: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
      configurable: true,
    });
    const btn = win.document.querySelector("#chat [data-code-copy]");
    btn.click();
    await wait(20);
    expect(btn.textContent).toBe("复制失败");
    win.close();
  });
});

describe("③ 快捷指令按模式切换", () => {
  it("work 默认四条；code / design 各有自己的默认产物域", () => {
    const win = boot();
    const chips = () => Array.prototype.slice.call(win.document.querySelectorAll("#chat .chat-suggest .chip"))
      .map((b) => b.textContent);
    expect(chips().length).toBe(4);
    expect(chips().join("|")).toContain("建个任务");

    win.localStorage.setItem(PREFIX + "uimode", JSON.stringify("code"));
    win.renderChat();
    const codeChips = chips();
    expect(codeChips.length).toBe(3);
    expect(codeChips.join("|")).toContain("代码");

    win.localStorage.setItem(PREFIX + "uimode", JSON.stringify("design"));
    win.renderChat();
    const designChips = chips();
    expect(designChips.length).toBe(3);
    expect(designChips.join("|")).toContain("画");
    win.close();
  });
});
