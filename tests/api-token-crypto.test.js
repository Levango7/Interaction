/**
 * token 落盘加密（v3.7.62 · 任务 #3）
 * ----------------------------------------------------------------------------
 * 背景：access/refresh 此前**明文**落 localStorage（wb_access_token 等）；本批改为设备密钥
 * AES-GCM 密文，且要求「降级不丢登录 + 透明迁移」。本文件把 6 条语义钉住：
 *   ① 旧明文 → 读时立即可用，随后透明升级为密文（不破坏登录）
 *   ② 密文启动 → 水合（解密）前不谎报登录，水合后恢复；存储保持密文原样
 *   ③ 密文解不开（设备密钥更换）→ 不抛错、不谎报、**不销毁**（换回可用环境仍可恢复）
 *   ④ 无 WebCrypto 降级 → 明文照常可用、密文原样保留、写入回落明文（与改造前行为一致）
 *   ⑤ 登出清除 + 写序串行（在途旧写不得把 token 复活）
 *   ⑥ 水合在途时登录 → 旧密文解密结果不得回写内存
 *
 * 手法：jsdom 无 indexedDB → 设备密钥走 localStorage 旧路径（wb_agent___dk）；预置一把**固定**
 * 设备密钥，就能在 A 环境加密、B 环境启动，复现真实「重启」路径。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const DK_KEY = "wb_agent___dk";            // crypto.js: DK_KEY = PREFIX + "__dk"
const TOK = "wb_access_token", REF = "wb_refresh_token", EXP = "wb_token_expiry";
const FIXED_DK = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const OTHER_DK = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
const future = () => String(Date.now() + 3600e3);

const boot = async (win) => { await new Promise((r) => setTimeout(r, 60)); return win; };
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const isSealed = (raw) => { try { const o = JSON.parse(raw); return o && o.__enc === true; } catch (e) { return false; } };

/** 用固定设备密钥造一对密文（在一个临时环境里加密后取回字符串） */
async function sealWithFixedKey(access, refresh) {
  const tmp = await boot(loadApp({ storage: { [DK_KEY]: FIXED_DK } }));
  const { encryptKey } = tmp.__test;
  return {
    access: JSON.stringify(await encryptKey(access)),
    refresh: JSON.stringify(await encryptKey(refresh)),
  };
}

describe("token 落盘加密（设备密钥 AES-GCM）", () => {
  it("① 旧明文读时立即可用，随后透明升级为密文", async () => {
    const win = await boot(loadApp({ storage: { [TOK]: "legacy-a", [REF]: "legacy-r", [EXP]: future() } }));
    expect(win.isApiLoggedIn(), "明文必须立即可用（迁移不改语义）").toBe(true);
    expect(win.apiGetHeaders().Authorization).toBe("Bearer legacy-a");
    await win.__test._whenTokensPersisted();
    await wait();
    expect(isSealed(win.localStorage.getItem(TOK)), "启动后应已升级为密文").toBe(true);
    expect(await win.__test.decryptKey(JSON.parse(win.localStorage.getItem(TOK)))).toBe("legacy-a");
    expect(win.isApiLoggedIn()).toBe(true);
  });

  it("② 密文启动：水合前不谎报登录，水合后恢复；存储保持密文", async () => {
    const sealed = await sealWithFixedKey("s-a", "s-r");
    const win = loadApp({ storage: { [DK_KEY]: FIXED_DK, [TOK]: sealed.access, [REF]: sealed.refresh, [EXP]: future() } });
    expect(win.isApiLoggedIn(), "解密完成前不得谎报已登录").toBe(false);
    await win.__test._whenTokensHydrated();
    await wait();
    expect(win.isApiLoggedIn()).toBe(true);
    expect(win.apiGetHeaders().Authorization).toBe("Bearer s-a");
    expect(win.localStorage.getItem(TOK)).toBe(sealed.access);
  });

  it("③ 密文解不开（设备密钥换了）：不抛错、不谎报、存储不销毁", async () => {
    const sealed = await sealWithFixedKey("old-a", "old-r");
    const win = await boot(loadApp({ storage: { [DK_KEY]: OTHER_DK, [TOK]: sealed.access, [REF]: sealed.refresh, [EXP]: future() } }));
    await win.__test._whenTokensHydrated();
    await wait();
    expect(win.isApiLoggedIn()).toBe(false);
    expect(win.localStorage.getItem(TOK), "解不开也绝不能销毁密文").toBe(sealed.access);
    expect(win.localStorage.getItem(REF)).toBe(sealed.refresh);
    win.apiClearTokens(); // 显式登出才允许改写
    await win.__test._whenTokensPersisted();
    expect(win.localStorage.getItem(TOK)).toBe(null);
  });

  it("④ 无 WebCrypto 降级：明文照常登录、写入回落明文", async () => {
    const win = await boot(loadApp({
      storage: { [TOK]: "plain-a", [REF]: "plain-r", [EXP]: future() },
      noCrypto: true,
    }));
    expect(win.isApiLoggedIn(), "降级环境不得丢登录").toBe(true);
    await win.__test._whenTokensPersisted();
    await wait();
    expect(win.localStorage.getItem(TOK), "无法加密时明文原样（与改造前一致）").toBe("plain-a");
    win.apiSetTokens("new-a", "new-r", Date.now() + 3600e3);
    await win.__test._whenTokensPersisted();
    expect(win.localStorage.getItem(TOK)).toBe("new-a");
  });

  it("④b 无 WebCrypto + 密文：原样保留，不误删", async () => {
    const sealed = await sealWithFixedKey("x-a", "x-r");
    const win = await boot(loadApp({
      storage: { [DK_KEY]: FIXED_DK, [TOK]: sealed.access, [REF]: sealed.refresh, [EXP]: future() },
      noCrypto: true,
    }));
    await win.__test._whenTokensHydrated();
    await wait();
    expect(win.isApiLoggedIn()).toBe(false);
    expect(win.localStorage.getItem(TOK), "降级环境绝不销毁密文（换回可用环境登录仍在）").toBe(sealed.access);
  });

  it("⑤ 登出：三键清除；先入队的旧写入不得把 token 写回", async () => {
    const win = await boot(loadApp());
    win.apiSetTokens("t1", "r1", Date.now() + 3600e3);
    win.apiClearTokens(); // 立刻登出（写序必须串行）
    await win.__test._whenTokensPersisted();
    await wait();
    expect(win.localStorage.getItem(TOK)).toBe(null);
    expect(win.localStorage.getItem(REF)).toBe(null);
    expect(win.isApiLoggedIn()).toBe(false);
  });

  it("⑥ 水合在途时登录：旧密文解密结果不得回写内存", async () => {
    const sealed = await sealWithFixedKey("stale-a", "stale-r");
    const win = loadApp({ storage: { [DK_KEY]: FIXED_DK, [TOK]: sealed.access, [REF]: sealed.refresh, [EXP]: future() } });
    win.apiSetTokens("fresh-a", "fresh-r", Date.now() + 3600e3); // 水合未完成就登录
    await win.__test._whenTokensHydrated();
    await wait();
    expect(win.apiGetHeaders().Authorization, "代际守卫：旧密文不得覆盖新登录").toBe("Bearer fresh-a");
    await win.__test._whenTokensPersisted();
    await wait();
    expect(isSealed(win.localStorage.getItem(TOK))).toBe(true);
    expect(await win.__test.decryptKey(JSON.parse(win.localStorage.getItem(TOK)))).toBe("fresh-a");
  });
});
