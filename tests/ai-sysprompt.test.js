/**
 * v1.15：场景 sysprompt 可编辑 + 上下文 token 预算管理
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("v1.15 sysprompt 可编辑", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("未设置时回退 SCENARIOS 默认", () => {
    const p = win.__test.effectiveSysprompt("office");
    expect(p).toContain("办公");
  });

  it("设置自定义后覆盖默认", () => {
    win.__test.setCustomSysprompt("office", "你是我的专属小助手");
    expect(win.__test.effectiveSysprompt("office")).toBe("你是我的专属小助手");
  });

  it("清空后回退默认", () => {
    win.__test.setCustomSysprompt("office", "测试");
    win.__test.setCustomSysprompt("office", "");
    expect(win.__test.effectiveSysprompt("office")).toContain("办公");
  });

  it("chatSysPrompt 使用自定义 sysprompt", () => {
    win.__test.setCustomSysprompt("office", "自定义办公助手");
    const p = win.__test.chatSysPrompt("你好");
    expect(p.startsWith("自定义办公助手")).toBe(true);
  });
});

describe("v1.15 上下文 token 预算管理", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("trimChatHist 保留最近的、裁剪超预算部分", () => {
    // 10 条长消息（每条 ~1000 字 ≈ 1000 token）
    const hist = [];
    for (let i = 0; i < 10; i++) {
      hist.push({ role: "user", content: "字".repeat(1000) + i });
    }
    win.__test.trimChatHist(hist, 2000);
    // 预算 2000，10 条 × ~1000 = 10000，应裁剪到 ~2-3 条
    expect(hist.length).toBeGreaterThanOrEqual(2);
    expect(hist.length).toBeLessThanOrEqual(4);
  });

  it("未超预算时不裁剪", () => {
    const hist = [{ role: "user", content: "你好" }, { role: "assistant", content: "你好" }];
    win.__test.trimChatHist(hist, 6000);
    expect(hist.length).toBe(2);
  });
});
