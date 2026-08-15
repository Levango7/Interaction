/**
 * 生物识别 WebAuthn 实现 · 回归验证（v1.11.2 认证补码）
 * ----------------------------------------------------------------------------
 * 此前 biometricSetAuthImpl 无人注入，biometricAuthenticate 恒 not_available（状态机空转）。
 * v1.11.2 注入 _webauthnBioImpl：支持 WebAuthn 的浏览器真正可用；不支持语义不变。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** 向 jsdom 注入 WebAuthn 能力模拟 */
function installWebAuthn(win, { platformAuthenticator = true, getBehavior = null } = {}) {
  Object.defineProperty(win.navigator, "credentials", {
    configurable: true,
    value: {
      create: async () => ({ id: "cred-1", type: "public-key" }),
      get: getBehavior || (async () => ({ id: "cred-1", type: "public-key" })),
    },
  });
  win.PublicKeyCredential = {
    isUserVerifyingPlatformAuthenticatorAvailable: async () => platformAuthenticator,
  };
}

describe("生物识别 WebAuthn 实现（v1.11.2）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("无 WebAuthn 环境：check → not_supported，authenticate → not_available（语义不变）", async () => {
    await expect(win.__test.biometricCheckAvailability()).resolves.toBe("not_supported");
    const r = await win.__test.biometricAuthenticate({ reason: "测试" });
    expect(r.result).toBe("not_available");
  });

  it("注入平台认证器：check → available，authenticate → success", async () => {
    installWebAuthn(win, { platformAuthenticator: true });
    await expect(win.__test.biometricRecheckAvailability()).resolves.toBe("available");
    const r = await win.__test.biometricAuthenticate({ reason: "测试" });
    expect(r.result).toBe("success");
    expect(r.type).toBe("fingerprint");
  });

  it("用户取消（NotAllowedError）：authenticate → cancelled", async () => {
    const cancelled = async () => { const e = new Error("denied"); e.name = "NotAllowedError"; throw e; };
    installWebAuthn(win, { getBehavior: cancelled });
    const r = await win.__test.biometricAuthenticate({ reason: "测试" });
    expect(r.result).toBe("cancelled");
  });

  it("无平台认证器（isUserVerifying... false）：check → hardware_missing", async () => {
    installWebAuthn(win, { platformAuthenticator: false });
    await expect(win.__test.biometricRecheckAvailability()).resolves.toBe("hardware_missing");
  });

  it("注册成功后设置持久化 enabled + primaryType", async () => {
    installWebAuthn(win, { platformAuthenticator: true });
    const r = await win.__test.biometricRegister("注册测试");
    expect(r.result).toBe("success");
    const s = JSON.parse(win.localStorage.getItem("biometric_settings") || "{}");
    expect(s.enabled).toBe(true);
  });
});
