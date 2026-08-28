// 集成中心接线回归（v3.1.1）：
// 修复前四处断线——① 状态查询用不存在的 window.getProvider（恒显示「未连接」）；
// ② enableProvider/disableProvider 不存在（静默 no-op）；③ 连接按钮传空 config，
// connect 函数返回 null 却弹「已连接」假成功；④ 无凭据配置入口。
// 本文件覆盖修复后的真实行为：面板渲染 / 状态如实反映注册 / 空凭据不谎报成功。
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "../helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "..", "agent-workbench.html");

describe("集成中心：面板渲染与状态接线", () => {
  let win;

  beforeAll(() => {
    win = loadApp();
  });

  it("renderIntegrationPanel 渲染 7 个 provider 行，各带连接按钮", () => {
    win.renderIntegrationPanel();
    const panel = win.document.getElementById("integrationPanel");
    expect(panel).toBeTruthy();
    const rows = panel.querySelectorAll(".int-row");
    expect(rows.length).toBe(7);
    expect(panel.querySelector('[data-int-conn="notion"]')).toBeTruthy();
    expect(panel.querySelector('[data-int-conn="calendar"]')).toBeTruthy();
  });

  it("状态如实反映 provider 注册（integrationGetProvider 接线修复）", () => {
    // 注册 notion provider（type 值 "notion" 与 INTEGRATION_TYPES.NOTION 相同）
    const prov = win.integrationRegisterProvider("notion", "notion", { token: "t" });
    expect(prov).toBeTruthy();
    win.renderIntegrationPanel();
    const panel = win.document.getElementById("integrationPanel");
    const status = panel.querySelector(".int-row .int-status");
    expect(status.textContent).toContain("已连接");
    // 断开后应回到「未连接」
    win.integrationRemoveProvider("notion");
    win.renderIntegrationPanel();
    expect(panel.querySelector(".int-row .int-status").textContent).toContain("未连接");
  });

  it("空凭据连接不再谎报成功：配置弹窗必填校验拦住空 config", async () => {
    win.openIntegrationConfig("notion");
    const goBtn = win.document.getElementById("btnIntCfgGo");
    expect(goBtn).toBeTruthy();
    // 不填任何凭据直接点连接 → 必填校验返回，不应注册 provider
    await goBtn.onclick();
    expect(win.integrationGetProvider("notion")).toBeNull();
    // 弹窗仍在（未进入成功分支）
    expect(win.document.getElementById("intCfgOverlay")).toBeTruthy();
  });

  it("凭据齐备时调用真实 connect 函数（返回 null 不弹假成功）", async () => {
    // notionConnect 需要 token；_intDoRequest 在 jsdom 下请求 Notion API 必然失败/无网络，
    // 但注册发生在网络验证之前——此处验证「有 token 才会注册」这一接线事实。
    win.openIntegrationConfig("notion");
    const tokenInput = win.document.getElementById("intcfg_token");
    expect(tokenInput).toBeTruthy();
    tokenInput.value = "secret_test_token";
    await win.document.getElementById("btnIntCfgGo").onclick();
    const prov = win.integrationGetProvider("notion");
    expect(prov).toBeTruthy();
    expect(prov.config.token).toBe("secret_test_token");
    // 清理：移除 provider，避免污染其他用例
    win.integrationRemoveProvider("notion");
  });
});

describe("集成中心：源码契约（防回归）", () => {
  let src;

  beforeAll(() => {
    src = fs.readFileSync(HTML, "utf8");
  });

  it("状态查询不再使用不存在的 window.getProvider", () => {
    expect(src).not.toContain("window.getProvider");
  });

  it("连接按钮不再以空 config 直调 connectFn 并谎报成功", () => {
    expect(src).not.toContain("Promise.resolve(fn({}))");
    expect(src).toContain("openIntegrationConfig(name)");
  });

  it("同步 UI 不再承诺跨设备局域网访问（服务仅绑定回环，见 electron/main.js）", () => {
    expect(src).not.toContain("在另一台设备上访问");
    expect(src).not.toContain("不影响其他设备经局域网访问");
  });
});
