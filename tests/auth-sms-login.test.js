/* tests/auth-sms-login.test.js
 * 手机号验证码登录（2026-10-23 · OD-001 选型 C）。
 *
 * 全部走**真实入口**：点「用短信验证码登录」切换、点「发送验证码」、提交表单 ——
 * 不直接调 toggle/do 函数。理由与 confirm 迁移批次一致：只断言"函数存在"的话，
 * 按钮没接线的缺陷永远测不出来（本仓 v1.6-B 批量操作就是这样躺了很久的）。
 *
 * 服务端语义有三条是设计决定而非实现细节，这里逐条钉住：
 *   ① /sms-code 不校验号码是否已注册（否则接口本身成了"这个号注册过没有"的枚举器）；
 *   ② 验证码即凭据，一次性消费；
 *   ③ 未配置通道是 fail-closed（503），不是"顺手放行"。
 * 客户端对应地必须把这三种失败**分开呈现**，不能都写成「发送失败」。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
afterEach(() => {
  if (win) win.close();
  win = undefined;
  vi.restoreAllMocks();
});

async function startLogin() {
  win = loadApp();
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  win.__test.setActive("authlogin");
  win.__test.render();
  return win.document;
}

/** 切到短信方式：点真实链接，而不是给模块变量赋值 */
function switchToSms(doc) {
  const link = doc.getElementById("authPageSwitchSms");
  expect(link, "登录页必须有「用短信验证码登录」的入口").toBeTruthy();
  link.click();
  return doc.getElementById("authPageLoginPhone");
}

describe("手机号验证码登录（2026-10-23 · OD-001 选型 C）", () => {
  it("默认仍是邮箱密码——加短信不动既有路径", async () => {
    const doc = await startLogin();
    expect(doc.getElementById("authPageLoginEmail")).toBeTruthy();
    expect(doc.getElementById("authPageLoginPassword")).toBeTruthy();
    expect(doc.getElementById("authPageLoginPhone")).toBeNull();
    expect(doc.getElementById("authPageLoginSubmit").textContent).toContain("登录");
  });

  it("点「用短信验证码登录」→ 手机号与验证码字段出现，邮箱字段消失", async () => {
    const doc = await startLogin();
    const phone = switchToSms(doc);
    expect(phone).toBeTruthy();
    expect(doc.getElementById("authPageLoginSmsCode")).toBeTruthy();
    expect(doc.getElementById("authPageSendSmsCode")).toBeTruthy();
    expect(doc.getElementById("authPageLoginEmail")).toBeNull();
    /* 按钮写「登录 / 注册」：服务端是 find-or-create，只写「登录」会让新用户以为得先注册 */
    expect(doc.getElementById("authPageLoginSubmit").textContent).toContain("注册");
  });

  it("号码非法 → 一个请求都不发，提示格式不正确", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSendSmsCode = vi.fn().mockResolvedValue({ ok: true });
    for (const bad of ["", "123", "23800138000", "138001380000"]) {
      doc.getElementById("authPageLoginPhone").value = bad;
      doc.getElementById("authPageSendSmsCode").click();
      expect(win.apiSendSmsCode, "非法号码 " + JSON.stringify(bad) + " 不该发请求").not.toHaveBeenCalled();
      expect(doc.getElementById("authPageLoginError").textContent).toContain("手机号");
    }
  });

  it("带 +86/空格的写法被接受，且原样送到后端（归一在服务端做）", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSendSmsCode = vi.fn().mockResolvedValue({ ok: true, data: { expireIn: 600 } });
    doc.getElementById("authPageLoginPhone").value = "+86 138 0013 8000";
    doc.getElementById("authPageSendSmsCode").click();
    expect(win.apiSendSmsCode).toHaveBeenCalledWith("+86 138 0013 8000");
  });

  it("后端未配置短信通道 → 文案指向「未配置」而不是笼统的「发送失败」", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSendSmsCode = vi.fn().mockResolvedValue({ ok: false, data: { error: "sms_not_configured" } });
    doc.getElementById("authPageLoginPhone").value = "13800138000";
    doc.getElementById("authPageSendSmsCode").click();
    await vi.waitFor(() => expect(doc.getElementById("authPageLoginError").textContent).not.toBe(""));
    const txt = doc.getElementById("authPageLoginError").textContent;
    expect(txt).toContain("短信");
    expect(txt).not.toContain("发送失败");
  });

  it("冷却中 → 文案带还要等多久（不然用户只会反复点）", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSendSmsCode = vi.fn().mockResolvedValue({ ok: false, data: { error: "sms_code_cooldown", retryAfter: 42 } });
    doc.getElementById("authPageLoginPhone").value = "13800138000";
    doc.getElementById("authPageSendSmsCode").click();
    await vi.waitFor(() => expect(doc.getElementById("authPageLoginError").textContent).not.toBe(""));
    expect(doc.getElementById("authPageLoginError").textContent).toContain("42");
  });

  it("发送成功 → 按钮进倒计时（不是点了没反应）", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSendSmsCode = vi.fn().mockResolvedValue({ ok: true, data: { expireIn: 600 } });
    doc.getElementById("authPageLoginPhone").value = "13800138000";
    const btn = doc.getElementById("authPageSendSmsCode");
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe("已发送"));
    expect(btn.disabled).toBe(true);
  });

  /* 发送失败必须把按钮恢复成可再点。这条同时钉住一个具体缺陷：
     _authCodeCountdownStop() 原先只认注册页那个按钮 id，短信按钮失败后会**永久停在
     disabled + 「发送中…」**——用户看到一个点了没反应、再也点不动的按钮。 */
  it("发送失败 → 短信按钮恢复可重试（不是永久 disabled）", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSendSmsCode = vi.fn().mockResolvedValue({ ok: false, data: { error: "rate_limited" } });
    doc.getElementById("authPageLoginPhone").value = "13800138000";
    const btn = doc.getElementById("authPageSendSmsCode");
    btn.click();
    await vi.waitFor(() => expect(doc.getElementById("authPageLoginError").textContent).not.toBe(""));
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("发送验证码");
  });

  it("断网（异步拒绝）→ 按钮恢复可重试，而不是永久禁用", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSendSmsCode = vi.fn().mockRejectedValue(Object.assign(new Error("offline"), { offline: true }));
    doc.getElementById("authPageLoginPhone").value = "13800138000";
    const btn = doc.getElementById("authPageSendSmsCode");
    btn.click();
    expect(btn.disabled).toBe(true);
    await vi.waitFor(() => expect(btn.disabled).toBe(false));
    expect(doc.getElementById("authPageLoginError").textContent).toContain("发送失败");
  });

  it("提交：码格式不对 → 一个请求都不发", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSmsLogin = vi.fn().mockResolvedValue({ ok: true, data: {} });
    doc.getElementById("authPageLoginPhone").value = "13800138000";
    doc.getElementById("authPageLoginSmsCode").value = "12345";
    doc.getElementById("authPageLoginForm").dispatchEvent(new win.Event("submit"));
    expect(win.apiSmsLogin).not.toHaveBeenCalled();
    expect(doc.getElementById("authPageLoginError").textContent).toContain("6 位");
  });

  it("提交：正确码 → 调 apiSmsLogin(phone, code) 并离开登录页", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSmsLogin = vi.fn().mockResolvedValue({ ok: true, data: { accessToken: "a", refreshToken: "r", user: { id: "u1", provider: "phone" } } });
    doc.getElementById("authPageLoginPhone").value = "13800138000";
    doc.getElementById("authPageLoginSmsCode").value = "123456";
    doc.getElementById("authPageLoginForm").dispatchEvent(new win.Event("submit"));
    await vi.waitFor(() => expect(win.apiSmsLogin).toHaveBeenCalled());
    expect(win.apiSmsLogin).toHaveBeenCalledWith("13800138000", "123456");
    await vi.waitFor(() => expect(doc.getElementById("authPageLoginForm")).toBeNull());
  });

  it("提交：服务端拒收 → 显示错误码且按钮复位（不能卡在 loading）", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    win.apiSmsLogin = vi.fn().mockResolvedValue({ ok: false, data: { error: "code_invalid" } });
    doc.getElementById("authPageLoginPhone").value = "13800138000";
    doc.getElementById("authPageLoginSmsCode").value = "123456";
    const btn = doc.getElementById("authPageLoginSubmit");
    doc.getElementById("authPageLoginForm").dispatchEvent(new win.Event("submit"));
    await vi.waitFor(() => expect(doc.getElementById("authPageLoginError").textContent).toBe("code_invalid"));
    expect(btn.disabled).toBe(false);
  });

  it("切回邮箱 → 短信字段消失、按钮文案回到「登录」", async () => {
    const doc = await startLogin();
    switchToSms(doc);
    doc.getElementById("authPageSwitchEmail").click();
    expect(doc.getElementById("authPageLoginPhone")).toBeNull();
    expect(doc.getElementById("authPageLoginEmail")).toBeTruthy();
    expect(doc.getElementById("authPageLoginSubmit").textContent).toContain("登录");
    expect(doc.getElementById("authPageLoginSubmit").textContent).not.toContain("注册");
  });
});
