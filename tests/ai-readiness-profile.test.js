/**
 * ai-readiness-profile.test.js —— AI 就绪判定必须走 profiles（台账 R-32，2026-10-22 修）
 * ----------------------------------------------------------------------------
 * 缺陷：配置迁到 `cfg.profiles[] + activeId` 后，三处闸门仍在读顶层 `cfg.base/cfg.key`
 * ⇒ 永远判"未配置"：「问 AI 助手」在**桌面也**打不开（只跳设置页）、AI Hub 卡片同上、
 * 设置里保存后的「5 分钟内续上待办意图」也永不触发。
 * 本文件钉判定本身 + 闸门副作用（不再写 pending、面板真的展开）；几何判据在 e2e。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const PROFILES_CFG = JSON.stringify({
  enabled: true,
  profiles: [{ id: "p1", name: "默认", base: "https://example.invalid/v1", key: "k1", model: "m" }],
  activeId: "p1",
  theme: "light",
});
const LEGACY_CFG = JSON.stringify({ enabled: true, base: "https://legacy.invalid/v1", key: "k0" });

async function boot(cfg) {
  const win = loadApp({ storage: { wb_agent_cfg: cfg } });
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

describe("AI 就绪判定（profiles 形态）", () => {
  it("profiles 形态：启用 + 激活 profile 有 base/key ⇒ 就绪", async () => {
    const win = await boot(PROFILES_CFG);
    expect(typeof win.aiReadyProfile, "应暴露统一判定").toBe("function");
    const r = win.aiReadyProfile();
    expect(r).toBeTruthy();
    expect(r.profile.id).toBe("p1");
  });

  it("旧顶层形态仍兼容（迁移前/损坏存储）", async () => {
    const win = await boot(LEGACY_CFG);
    expect(win.aiReadyProfile()).toBeTruthy();
  });

  it("未启用 / 缺 key 都不算就绪", async () => {
    const off = await boot(JSON.stringify({ enabled: false, profiles: [{ id: "p", base: "https://x", key: "k" }], activeId: "p" }));
    expect(off.aiReadyProfile(), "enabled=false").toBeNull();
    const noKey = await boot(JSON.stringify({ enabled: true, profiles: [{ id: "p", base: "https://x", key: "" }], activeId: "p" }));
    expect(noKey.aiReadyProfile(), "缺 key").toBeNull();
  });

  it("闸门副作用：已就绪时点「问 AI 助手」不写 pending，且面板真的展开", async () => {
    const win = await boot(PROFILES_CFG);
    win.innerWidth = 1280;
    win.__test.setActive("office");
    win.__test.render();
    const panel = win.document.getElementById("chatPanel");
    panel.classList.add("collapsed"); /* 模拟用户收起了历史 */
    win.document.getElementById("phAiAskBtn").click();
    await vi.waitFor(() => expect(panel.classList.contains("collapsed")).toBe(false));
    expect(win.localStorage.getItem("wb_agent___pendingAiAsk"), "已配置时不该写待续意图").toBeNull();
    const ta = win.document.getElementById("chatTextInput");
    expect(ta.value, "应预填场景提示").toContain("办公");
  });
});
