import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
let intervals;
afterEach(() => {
  if (win) win.close();
  win = undefined;
  vi.restoreAllMocks();
});

async function startPage(page) {
  win = loadApp();
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  win.__test.setActive(page);
  win.__test.render();
  intervals = new Map();
  let id = 10000;
  vi.spyOn(win, "setInterval").mockImplementation(fn => {
    intervals.set(++id, fn);
    return id;
  });
  vi.spyOn(win, "clearInterval").mockImplementation(timer => intervals.delete(timer));
  return win.document;
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

// 捕获真实点击触发的异步返回值，测试自身消费拒绝，避免旧代码产生未处理拒绝干扰测试运行器。
function observeSend() {
  const send = win._sendEmailCode;
  let settled;
  vi.spyOn(win, "_sendEmailCode").mockImplementation(() => {
    const result = send();
    settled = Promise.resolve(result).then(() => true, () => false);
    return result;
  });
  win.document.getElementById("authPageSendCode").click();
  return settled;
}

describe("账号 UI 请求失败与关闭生命周期", () => {
  it("验证码请求断网后恢复按钮、显示错误且可再次发送", async () => {
    const doc = await startPage("authregister");
    doc.getElementById("authPageRegEmail").value = "test@example.com";
    const offline = Object.assign(new Error("offline"), { offline: true });
    win.apiSendEmailCode = vi.fn().mockRejectedValueOnce(offline).mockResolvedValueOnce({ ok: true });
    const button = doc.getElementById("authPageSendCode");
    const settled = observeSend();
    expect(button.disabled).toBe(true);
    expect(await settled).toBe(true);
    expect(button.disabled).toBe(false);
    expect(doc.getElementById("authPageRegisterError").textContent).not.toBe("");
    expect(intervals.size).toBe(0);

    expect(await observeSend()).toBe(true);
    expect(win.apiSendEmailCode).toHaveBeenCalledTimes(2);
    expect(button.disabled).toBe(true);
    expect(intervals.size).toBe(1);
    expect(doc.getElementById("authPageRegisterError").textContent).toBe("");
    // 倒计时到期可以重发。
    const tick = [...intervals.values()][0];
    for (let i = 0; i < 60; i++) tick();
    expect(button.disabled).toBe(false);
    expect(intervals.size).toBe(0);
  });

  it("验证码 HTTP 失败保留服务端提示、不启动倒计时", async () => {
    const doc = await startPage("authregister");
    doc.getElementById("authPageRegEmail").value = "test@example.com";
    win.apiSendEmailCode = vi.fn().mockResolvedValue({ ok: false, data: { error: "请求过于频繁" } });
    expect(await observeSend()).toBe(true);
    expect(doc.getElementById("authPageSendCode").disabled).toBe(false);
    expect(doc.getElementById("authPageRegisterError").textContent).toBe("请求过于频繁");
    expect(intervals.size).toBe(0);
  });

  it("二维码请求尚未返回时关闭弹窗，迟到响应不得启动轮询", async () => {
    const doc = await startPage("authwelcome");
    const qr = deferred();
    win.apiWechatQrcode = vi.fn(() => qr.promise);
    win.apiWechatStatus = vi.fn();
    doc.getElementById("authSsoWechat").click();
    doc.querySelector("#authSsoOverlay [data-close]").click();
    qr.resolve({ ok: true, data: { qr: "https://example.com/qr.png", scene: "scene-1" } });
    await qr.promise;
    await Promise.resolve();
    expect(doc.getElementById("authSsoOverlay")).toBeNull();
    expect(intervals.size).toBe(0);
    expect(win.apiWechatStatus).not.toHaveBeenCalled();
  });

  it("关闭已开始轮询的弹窗后，清理定时器并忽略迟到的登录确认", async () => {
    const doc = await startPage("authwelcome");
    const status = deferred();
    win.apiWechatQrcode = vi.fn().mockResolvedValue({ ok: true, data: { qr: "https://example.com/qr.png", scene: "scene-2" } });
    win.apiWechatStatus = vi.fn(() => status.promise);
    win.apiSetTokens = vi.fn();
    doc.getElementById("authSsoWechat").click();
    await vi.waitFor(() => expect(intervals.size).toBe(1));
    [...intervals.values()][0]();
    doc.getElementById("authSsoOverlay").click(); // 遮罩关闭也必须取消轮询
    status.resolve({ ok: true, data: { status: "confirmed", accessToken: "test-token" } });
    await status.promise;
    await Promise.resolve();
    expect(intervals.size).toBe(0);
    expect(win.apiSetTokens).not.toHaveBeenCalled();
    expect(win.__test.getActive()).toBe("authwelcome");
  });

  it("有效弹窗收到确认后保存 token、停止轮询并刷新账号面板", async () => {
    const doc = await startPage("authwelcome");
    win.apiWechatQrcode = vi.fn().mockResolvedValue({ ok: true, data: { qr: "https://example.com/qr.png", scene: "valid" } });
    win.apiWechatStatus = vi.fn().mockResolvedValue({ ok: true, data: { status: "confirmed", accessToken: "test-token", refreshToken: "test-refresh" } });
    win.apiSetTokens = vi.fn();
    win._loadApiPanels = vi.fn();
    doc.getElementById("authSsoWechat").click();
    await vi.waitFor(() => expect(intervals.size).toBe(1));
    [...intervals.values()][0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(intervals.size).toBe(0);
    expect(win.apiSetTokens).toHaveBeenCalledTimes(1);
    expect(win._loadApiPanels).toHaveBeenCalledTimes(1);
    expect(doc.getElementById("authSsoOverlay")).toBeNull();
    expect(win.__test.getActive()).toBe("overview");
  });

  it("二维码过期时停止轮询并展示重试提示", async () => {
    const doc = await startPage("authwelcome");
    win.apiWechatQrcode = vi.fn().mockResolvedValue({ ok: true, data: { qr: "https://example.com/qr.png", scene: "scene-3" } });
    win.apiWechatStatus = vi.fn().mockResolvedValue({ ok: true, data: { status: "expired" } });
    doc.getElementById("authSsoWechat").click();
    await vi.waitFor(() => expect(intervals.size).toBe(1));
    [...intervals.values()][0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(intervals.size).toBe(0);
    expect(doc.getElementById("authSsoWechatBody").textContent).toContain("过期");
  });
});
