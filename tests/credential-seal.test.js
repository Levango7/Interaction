/**
 * credential-seal.test.js —— 凭据密封收口（批次③）
 * ----------------------------------------------------------------------------
 * 审计发现的三层缺陷链：`encryptKey`（crypto.js）在 Web Crypto / 设备密钥不可得时
 * **静默返回明文** → 调用方（GitHub token / WebDAV 密码 / 集成敏感字段）把明文当
 * "加密成功"写盘，UI 还 toast「已加密存储」；`_encryptSecretOrRefuse` 的旧守卫
 * （`typeof encryptKey !== "function"`）因函数声明块加载即挂全局而**恒为假**，
 * 从未拦下任何东西。
 *
 * 本文件锁 fail-closed 的四组语义：
 *   ① 无 WebCrypto：凭据链每一条出口都必须拒绝保存，磁盘上零字节明文；
 *   ② 无 WebCrypto：历史明文旧值读回不受影响（不丢数据）；
 *   ③ crypto 自称就绪但设备密钥不可得（generateKey 恒拒）：同样拒绝，persistCfg 丢 Key
 *      并留「key dropped」诊断 —— 这是旧代码最隐蔽的泄漏路径（_cryptoReady=true，
 *      不走 D4 降级分支，明文会直接写进 profiles[].key）；
 *   ④ 集成 provider 密封：敏感字段加密失败 → 字段被丢弃，API Key 明文不落盘。
 *
 * 手法：noCrypto 用 loadApp 的降级开关；「设备密钥不可得」用一个每窗口独立的
 * crypto 替身（generateKey 恒拒）—— 不 spy 共享的 Node webcrypto 单例，避免跨用例污染。
 */
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const DK_KEY = PREFIX + "__dk";
const GH_TOKEN_KEY = PREFIX + "github_device_token";
const WD_PASS_KEY = PREFIX + "webdav_pass";
const PROVIDERS_KEY = "wb_integration_providers"; // 常量自带前缀，读写在用点上不再拼 PREFIX

const flush = (ms = 60) => new Promise((r) => setTimeout(r, ms));
/* 密封写盘是异步队列（_intPersistChain）不是同步 setItem；固定墙钟等不住全量并行下的排队，
   判据改为「轮询到状态成立为止」（与 notify-webhook.test.js 同款）。 */
async function waitFor(fn, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    if (fn()) return true;
    if (Date.now() - t0 > ms) return false;
    await flush(20);
  }
}
/** 全盘扫描：任何键的原始值里都不得出现给定标记 */
function disk(win) {
  const out = [];
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    out.push(k + "=" + String(win.localStorage.getItem(k)));
  }
  return out.join("\n");
}
/** 无 WebCrypto 环境（noCrypto：不注入 webcrypto polyfill，jsdom 原生无 subtle） */
function noCryptoApp(storage) {
  return loadApp({ storage: storage || {}, noCrypto: true });
}
/**
 * 制造「crypto 自称就绪但设备密钥不可得」的环境：_cryptoReady=true 而 ensureDeviceKey() 恒 null。
 * 用每窗口独立的 crypto 替身而非 spy 共享单例 —— loadApp 默认把 Node webcrypto 注入多个窗口。
 */
async function noDeviceKeyApp() {
  const win = loadApp();
  await flush(60);
  win.__test._resetCrypto();          // 清内存里的设备密钥
  win.localStorage.removeItem(DK_KEY); // 清磁盘（jsdom 无 IDB，密钥走 localStorage 旧路径）
  const real = win.crypto;
  Object.defineProperty(win, "crypto", {
    value: {
      getRandomValues: (u) => real.getRandomValues(u),
      subtle: { generateKey: async () => { throw new Error("test: generateKey refused"); } },
    },
    writable: true, configurable: true,
  });
  await win.__test.initCrypto();      // _cryptoReady=true；设备密钥 null
  return win;
}

describe("① 无 WebCrypto：凭据链全部拒绝保存（fail-closed）", () => {
  it("encryptKey 抛 crypto-unavailable；_encryptSecretOrRefuse 返回 null；token 拒绝且磁盘零字节", async () => {
    const win = noCryptoApp();
    await flush(60);
    let err = null;
    try { await win.__test.encryptKey("x"); } catch (e) { err = e; }
    expect(err && err.code, "写路径必须以抛错拒绝（旧行为是静默返回明文）").toBe("crypto-unavailable");
    expect(await win._encryptSecretOrRefuse("secret_a")).toBeNull();
    expect(await win.githubTokenSet("gho_leak_a")).toBe(false);
    expect(win.localStorage.getItem(GH_TOKEN_KEY)).toBe(null);
    expect(disk(win)).not.toContain("gho_leak_a");
    expect(disk(win)).not.toContain("secret_a");
  });

  it("形状守卫：即便 encryptKey 退化到静默返回明文，凭据链仍拒绝（第二道防线）", async () => {
    const win = noCryptoApp();
    await flush(60);
    const diagSpy = vi.spyOn(win, "pushDiag");
    const orig = win.encryptKey;
    win.encryptKey = async (p) => p;   // 模拟未来退化：不抛、静默返回明文
    try {
      expect(await win._encryptSecretOrRefuse("secret_shape")).toBeNull();
      const hit = diagSpy.mock.calls.find((c) => /shape guard/.test(String(c[1])));
      expect(hit, "形状守卫拒绝必须留诊断").toBeTruthy();
      expect(disk(win)).not.toContain("secret_shape");
    } finally { win.encryptKey = orig; }
  });

  it("webdavSaveCfg：密码拒绝落盘（wd_pass 键不存在，磁盘无明文）", async () => {
    const win = noCryptoApp();
    await flush(60);
    const ok = await win.webdavSaveCfg({ url: "https://dav.example.com/dav", user: "me@x.com", pass: "wd_leak" });
    expect(ok, "存不下就要如实返回失败（调用点据此 toast「保存失败」）").toBe(false);
    expect(win.localStorage.getItem(WD_PASS_KEY)).toBe(null);
    expect(disk(win)).not.toContain("wd_leak");
  });

  it("githubDevicePoll：设备码换来 token 但存不下 → 如实失败，不谎报成功", async () => {
    const win = noCryptoApp();
    await flush(60);
    win.fetch = async () => ({ ok: true, status: 200, json: async () => ({ access_token: "gho_poll_leak" }) });
    const r = await win.githubDevicePoll("Iv1.x", "dc_x");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("token_store_failed");
    expect(win.githubHasToken()).toBe(false);
    expect(disk(win)).not.toContain("gho_poll_leak");
  });

  it("集成 provider 密封（降级分支）：敏感字段直接丢弃，明文零落盘", async () => {
    const win = noCryptoApp();
    await flush(60);
    win.integrationRegisterProvider("slack_main", "slack", { apiKey: "slack_leak_9", channel: "#c" });
    const wrote = await waitFor(() => win.localStorage.getItem(PROVIDERS_KEY) !== null);
    expect(wrote, "密封写盘应发生（丢弃字段 ≠ 不写盘）").toBe(true);
    const raw = win.localStorage.getItem(PROVIDERS_KEY);
    expect(raw).not.toContain("slack_leak_9");
    const parsed = JSON.parse(raw);
    expect(parsed.slack_main.config.apiKey, "敏感字段必须被丢弃").toBeUndefined();
    expect(parsed.slack_main.config.channel).toBe("#c");
  });
});

describe("② 无 WebCrypto：历史明文旧值读回不受影响（不丢数据）", () => {
  it("旧明文 github token 原样读回、不被改写", async () => {
    /* 历史明文是经 save() JSON 序列化落盘的（带引号的 JSON 串），裸串 load() 解析不了 —— 夹具必须用真实形态 */
    const legacyStored = JSON.stringify("gho_legacy_plain");
    const win = noCryptoApp({ [GH_TOKEN_KEY]: legacyStored });
    await flush(60);
    expect(await win.githubToken()).toBe("gho_legacy_plain");
    expect(win.localStorage.getItem(GH_TOKEN_KEY)).toBe(legacyStored);
  });
});

describe("③ crypto 就绪但设备密钥不可得：旧代码最隐蔽的泄漏路径", () => {
  it("encryptKey 抛 device-key-unavailable；persistCfg 丢 Key + 诊断；凭据链拒绝", async () => {
    const win = await noDeviceKeyApp();
    await expect(win.__test.encryptKey("sk_x")).rejects.toThrow(/设备密钥/);

    const diagSpy = vi.spyOn(win, "pushDiag");
    const ok = await win.__test.persistCfg({
      enabled: true,
      profiles: [{ id: "p1", name: "T", base: "https://x", key: "sk-should-drop", model: "m" }],
      activeId: "p1",
    });
    expect(ok).toBe(true);
    const storedRaw = win.localStorage.getItem(PREFIX + "cfg");
    expect(storedRaw).not.toContain("sk-should-drop");
    expect(JSON.parse(storedRaw).profiles[0].key, "加不了密就丢，绝不留明文").toBe("");
    const dropped = diagSpy.mock.calls.find((c) => c[0] === "error" && /key dropped/.test(String(c[1])));
    expect(dropped, "丢 Key 必须留诊断（旧代码这条路径静默存明文）").toBeTruthy();

    expect(await win.githubTokenSet("gho_nodevkey")).toBe(false);
    expect(win.localStorage.getItem(GH_TOKEN_KEY)).toBe(null);
    const refused = diagSpy.mock.calls.find((c) => /credential seal refused/.test(String(c[1])));
    expect(refused, "凭据拒绝必须留诊断").toBeTruthy();
    expect(disk(win)).not.toContain("gho_nodevkey");
    expect(disk(win)).not.toContain("sk-should-drop");
  });
});

describe("④ 集成 provider 密封（就绪分支）：加密失败即丢字段", () => {
  it("API Key 明文不落盘；非敏感字段照常保留", async () => {
    const win = await noDeviceKeyApp();
    win.integrationRegisterProvider("notion_main", "notion", { apiKey: "secret_leak_123", workspace: "ws-1" });
    const wrote = await waitFor(() => win.localStorage.getItem(PROVIDERS_KEY) !== null);
    expect(wrote).toBe(true);
    const raw = win.localStorage.getItem(PROVIDERS_KEY);
    expect(raw).not.toContain("secret_leak_123");
    const parsed = JSON.parse(raw);
    expect(parsed.notion_main.config.apiKey, "敏感字段必须被丢弃（fail-closed）").toBeUndefined();
    expect(parsed.notion_main.config.workspace).toBe("ws-1");
  });
});
