/* tests/password-reset.test.js
 * 密码重置 / 忘记密码（2026-10-24）。
 *
 * 这套测试存在的理由：登录面此前有 5 种入口，但**没有一条找回路径** —— 邮箱密码用户
 * 忘密码即账号永久锁死（注册与发码都以 email_exists 拒掉已存在的邮箱）。这类缺口不会
 * 让任何测试变红，只会让真实用户在第三天放弃。
 *
 * 全部走**真实入口**：点登录页的「忘记密码？」、点「发送验证码」、提交表单 ——
 * 不直接调 _doAuthPasswordReset。只断言"函数存在"的话，按钮没接线的缺陷永远测不出来。
 *
 * 另有一条纪律贯穿全文件：界面上**不许出现**「该邮箱未注册」这类判断。服务端刻意让
 * 存在与不存在的响应逐字节相同，前端一旦去猜就等于把那个口径漏回浏览器。
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

/** 从登录页点真链接进入重置页 */
function gotoReset(doc) {
  const link = doc.getElementById("authPageToReset");
  expect(link, "登录页必须有「忘记密码？」入口").toBeTruthy();
  link.click();
  return doc.getElementById("authPageResetEmail");
}

function fill(doc, email, code, pw, pw2) {
  doc.getElementById("authPageResetEmail").value = email;
  doc.getElementById("authPageResetCode").value = code;
  doc.getElementById("authPageResetPassword").value = pw;
  doc.getElementById("authPageResetPassword2").value = pw2;
}

describe("密码重置 / 忘记密码（2026-10-24）", () => {
  it("邮箱登录页有「忘记密码？」入口，且它指向重置页", async () => {
    const doc = await startLogin();
    const email = gotoReset(doc);
    expect(email).toBeTruthy();
    expect(doc.getElementById("authPageResetCode")).toBeTruthy();
    expect(doc.getElementById("authPageSendResetCode")).toBeTruthy();
    expect(doc.getElementById("authPageResetPassword")).toBeTruthy();
    expect(doc.getElementById("authPageResetSubmit")).toBeTruthy();
  });

  it("短信登录方式下不出现「忘记密码」——那种账号没有密码可重置", async () => {
    const doc = await startLogin();
    doc.getElementById("authPageSwitchSms").click();
    expect(doc.getElementById("authPageToReset")).toBeNull();
  });

  it("重置页不放 SSO 按钮：忘记密码是密码体系内的事", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    expect(doc.querySelector(".auth-sso-sep")).toBeNull();
    expect(doc.getElementById("authPageGithub") || doc.getElementById("authPageWechat")).toBeNull();
  });

  it("返回按钮回登录页（不是回欢迎页）", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    doc.getElementById("authPageBack").click();
    await vi.waitFor(() => expect(doc.getElementById("authPageLoginForm")).toBeTruthy());
  });

  it("邮箱非法 → 一个请求都不发，提示格式", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiSendPasswordResetCode = vi.fn().mockResolvedValue({ ok: true });
    for (const bad of ["", "abc", "a@b"]) {
      doc.getElementById("authPageResetEmail").value = bad;
      doc.getElementById("authPageSendResetCode").click();
      expect(win.apiSendPasswordResetCode, "非法邮箱 " + JSON.stringify(bad) + " 不该发请求").not.toHaveBeenCalled();
      expect(doc.getElementById("authPageResetError").textContent).toContain("邮箱");
    }
  });

  it("发码成功 → 按钮进倒计时（不是点了没反应）", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiSendPasswordResetCode = vi.fn().mockResolvedValue({ ok: true, data: { expireIn: 600 } });
    doc.getElementById("authPageResetEmail").value = "someone@example.com";
    const btn = doc.getElementById("authPageSendResetCode");
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe("已发送"));
    expect(btn.disabled).toBe(true);
    expect(win.apiSendPasswordResetCode).toHaveBeenCalledWith("someone@example.com");
  });

  /* 服务端对「该邮箱是否注册过」一个字都不漏，所以界面也不能漏。
     这一条同时钉住"别把服务端刻意的模糊在 UI 上又说清楚"这类好心办坏事。 */
  it("发码成功的文案不透露邮箱是否注册过", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiSendPasswordResetCode = vi.fn().mockResolvedValue({ ok: true, data: { expireIn: 600 } });
    doc.getElementById("authPageResetEmail").value = "unknown@example.com";
    doc.getElementById("authPageSendResetCode").click();
    await vi.waitFor(() => expect(doc.getElementById("authPageSendResetCode").textContent).toBe("已发送"));
    const all = doc.getElementById("main").textContent;
    expect(all).not.toContain("未注册");
    expect(all).not.toContain("不存在");
  });

  it("服务端未配置邮件通道 → 文案指向「邮件通道」，不是笼统的「发送失败」", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiSendPasswordResetCode = vi.fn().mockResolvedValue({ ok: false, data: { error: "email_not_configured" } });
    doc.getElementById("authPageResetEmail").value = "someone@example.com";
    doc.getElementById("authPageSendResetCode").click();
    await vi.waitFor(() => expect(doc.getElementById("authPageResetError").textContent).not.toBe(""));
    const txt = doc.getElementById("authPageResetError").textContent;
    expect(txt).toContain("邮件");
    expect(txt).not.toContain("发送失败");
  });

  it("限流 → 文案说明太频繁（不是让用户空白重试）", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiSendPasswordResetCode = vi.fn().mockResolvedValue({ ok: false, data: { error: "rate_limited" } });
    doc.getElementById("authPageResetEmail").value = "someone@example.com";
    doc.getElementById("authPageSendResetCode").click();
    await vi.waitFor(() => expect(doc.getElementById("authPageResetError").textContent).not.toBe(""));
    expect(doc.getElementById("authPageResetError").textContent).toContain("频繁");
  });

  /* 这条钉住一个具体缺陷形态：_authCodeCountdownStop() 的复位列表是按 id 写死的，
     漏掉重置页这个按钮 → 发码失败后它**永久停在 disabled +「发送中…」**。 */
  it("发码失败 → 重置按钮恢复可重试（不是永久 disabled）", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiSendPasswordResetCode = vi.fn().mockResolvedValue({ ok: false, data: { error: "rate_limited" } });
    doc.getElementById("authPageResetEmail").value = "someone@example.com";
    const btn = doc.getElementById("authPageSendResetCode");
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).not.toBe("发送中…"));
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain("发送");
  });

  it("断网（异步拒绝）→ 按钮恢复可重试", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiSendPasswordResetCode = vi.fn().mockRejectedValue(new Error("network"));
    doc.getElementById("authPageResetEmail").value = "someone@example.com";
    const btn = doc.getElementById("authPageSendResetCode");
    btn.click();
    await vi.waitFor(() => expect(btn.disabled).toBe(false));
    expect(btn.textContent).toContain("发送");
  });

  it("本地校验与服务端同口径：码非 6 位 / 密码不足 8 位 / 两次不一致 → 都不发请求", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiPasswordReset = vi.fn().mockResolvedValue({ ok: true, data: { changed: true } });
    const form = doc.getElementById("authPageResetForm");
    const cases = [
      ["someone@example.com", "12", "newpassword123", "newpassword123", "验证码"],
      ["someone@example.com", "123456", "short", "short", "8 位"],
      ["someone@example.com", "123456", "newpassword123", "otherpassword123", "不一致"],
    ];
    for (const c of cases) {
      fill(doc, c[0], c[1], c[2], c[3]);
      form.dispatchEvent(new win.Event("submit", { cancelable: true }));
      expect(win.apiPasswordReset, "本地校验失败不该发请求：" + c[4]).not.toHaveBeenCalled();
      expect(doc.getElementById("authPageResetError").textContent).toContain(c[4]);
    }
  });

  it("提交成功 → 调 apiPasswordReset(email, code, 新密码)，回登录页且邮箱已回填", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiPasswordReset = vi.fn().mockResolvedValue({ ok: true, data: { changed: true, sessionsRevoked: 3 } });
    win.toast = vi.fn();
    fill(doc, "someone@example.com", "123456", "newpassword123", "newpassword123");
    doc.getElementById("authPageResetForm").dispatchEvent(new win.Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(doc.getElementById("authPageLoginForm")).toBeTruthy());
    expect(win.apiPasswordReset).toHaveBeenCalledWith("someone@example.com", "123456", "newpassword123");
    /* 回到登录页要带上邮箱 —— 让人把刚填过的邮箱再打一遍是没必要的摩擦 */
    expect(doc.getElementById("authPageLoginEmail").value).toBe("someone@example.com");
    /* 服务端**不**在重置时签发 token（少一处「重置即接管」窗口），客户端也不该自行登录 */
    expect(doc.getElementById("authPageLoginPassword").value).toBe("");
  });

  it("提交成功 → 提示里带「退出几台设备」（这是改密生效的证据）", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiPasswordReset = vi.fn().mockResolvedValue({ ok: true, data: { changed: true, sessionsRevoked: 3 } });
    const said = [];
    win.toast = vi.fn((msg) => said.push(String(msg)));
    fill(doc, "someone@example.com", "123456", "newpassword123", "newpassword123");
    doc.getElementById("authPageResetForm").dispatchEvent(new win.Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(said.length).toBeGreaterThan(0));
    expect(said.join(" ")).toContain("3");
  });

  it("服务端拒收（码过期）→ 文案指向「验证码错误或已过期」，按钮复位", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiPasswordReset = vi.fn().mockResolvedValue({ ok: false, data: { error: "code_expired_or_invalid" } });
    fill(doc, "someone@example.com", "123456", "newpassword123", "newpassword123");
    const btn = doc.getElementById("authPageResetSubmit");
    doc.getElementById("authPageResetForm").dispatchEvent(new win.Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(doc.getElementById("authPageResetError").textContent).not.toBe(""));
    expect(doc.getElementById("authPageResetError").textContent).toContain("验证码");
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains("loading")).toBe(false);
  });

  it("提交断网 → 按钮复位，提示可理解", async () => {
    const doc = await startLogin();
    gotoReset(doc);
    win.apiPasswordReset = vi.fn().mockRejectedValue(Object.assign(new Error("offline"), { offline: true }));
    fill(doc, "someone@example.com", "123456", "newpassword123", "newpassword123");
    const btn = doc.getElementById("authPageResetSubmit");
    doc.getElementById("authPageResetForm").dispatchEvent(new win.Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(doc.getElementById("authPageResetError").textContent).not.toBe(""));
    expect(btn.disabled).toBe(false);
  });
});
