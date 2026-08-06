import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

// 等待 HTML 内启动 async startup（initCrypto + render）跑完，避免与测试手动调 initCrypto 并发竞争
async function boot(win) {
  await new Promise((r) => setTimeout(r, 60));
  return win;
}

describe("AI Key 加密存储", () => {
  it("base64Encode/base64Decode 往返正确性", () => {
    const win = loadApp();
    const { base64Encode, base64Decode } = win.__test;
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array([255, 254, 253]),
      new Uint8Array(Array.from({ length: 32 }, (_, i) => i * 7 + 3)),
    ];
    for (const bytes of cases) {
      const enc = base64Encode(bytes);
      const dec = base64Decode(enc);
      expect(Array.from(dec)).toEqual(Array.from(bytes));
    }
  });

  it("encryptKey/decryptKey 往返正确性", async () => {
    const win = await boot(loadApp());
    const { encryptKey, decryptKey, initCrypto } = win.__test;
    await initCrypto();
    const plain = "sk-abcdef123456";
    const enc = await encryptKey(plain);
    expect(enc.__enc).toBe(true);
    expect(typeof enc.iv).toBe("string");
    expect(typeof enc.data).toBe("string");
    const dec = await decryptKey(enc);
    expect(dec).toBe(plain);
  });

  it("不同明文加密结果不同（IV 随机性）", async () => {
    const win = await boot(loadApp());
    const { encryptKey, initCrypto } = win.__test;
    await initCrypto();
    const a = await encryptKey("same-value");
    const b = await encryptKey("same-value");
    // 相同明文两次加密，IV 随机 → iv/data 均不同
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("空字符串加密/解密", async () => {
    const win = await boot(loadApp());
    const { encryptKey, decryptKey, initCrypto } = win.__test;
    await initCrypto();
    const enc = await encryptKey("");
    expect(enc.__enc).toBe(true);
    const dec = await decryptKey(enc);
    expect(dec).toBe("");
  });

  it("旧明文 cfg 迁移：localStorage 明文 key → initCrypto 后变加密对象 → getCfg 返回明文", async () => {
    const win = await boot(loadApp());
    const { initCrypto, getCfg, PREFIX } = win.__test;
    win.__test._resetCrypto();
    // 写旧明文 cfg
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({ enabled: true, base: "https://x", key: "sk-legacy-plain", model: "gpt-4o-mini" })
    );
    // 清掉可能存在的旧设备密钥，强制重建
    win.localStorage.removeItem(PREFIX + "__dk");
    await initCrypto();
    // localStorage 里 key 应变为加密对象
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "cfg"));
    expect(stored.key.__enc).toBe(true);
    expect(typeof stored.key.iv).toBe("string");
    expect(typeof stored.key.data).toBe("string");
    // getCfg 返回明文
    const cfg = getCfg();
    expect(cfg.key).toBe("sk-legacy-plain");
    expect(cfg.enabled).toBe(true);
    expect(cfg.base).toBe("https://x");
  });

  it("已加密 cfg 读取：initCrypto 解密 → getCfg 返回明文，localStorage 仍为加密对象", async () => {
    const win = await boot(loadApp());
    const { initCrypto, getCfg, PREFIX, encryptKey, _resetCrypto } = win.__test;
    _resetCrypto();
    win.localStorage.removeItem(PREFIX + "__dk");
    await initCrypto();
    // 构造已加密 cfg
    const enc = await encryptKey("sk-already-enc");
    win.localStorage.setItem(
      PREFIX + "cfg",
      JSON.stringify({ enabled: false, base: "", key: enc, model: "" })
    );
    _resetCrypto(); // 清内存但保留 localStorage 的 __dk 与加密 cfg
    await initCrypto();
    const cfg = getCfg();
    expect(cfg.key).toBe("sk-already-enc");
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "cfg"));
    expect(stored.key.__enc).toBe(true);
  });

  it("无设备密钥时 initCrypto 自动创建", async () => {
    const win = await boot(loadApp());
    const { initCrypto, getDeviceKey, PREFIX } = win.__test;
    win.__test._resetCrypto();
    win.localStorage.removeItem(PREFIX + "__dk");
    win.localStorage.removeItem(PREFIX + "cfg");
    expect(win.localStorage.getItem(PREFIX + "__dk")).toBe(null);
    await initCrypto();
    expect(win.localStorage.getItem(PREFIX + "__dk")).not.toBe(null);
    expect(getDeviceKey()).not.toBe(null);
  });

  it("已有设备密钥时 initCrypto 复用（不覆盖 localStorage 的 __dk）", async () => {
    const win = await boot(loadApp());
    const { initCrypto, getDeviceKey, PREFIX, encryptKey, decryptKey } = win.__test;
    win.__test._resetCrypto();
    win.localStorage.removeItem(PREFIX + "__dk");
    // 首次创建
    await initCrypto();
    const storedDk = win.localStorage.getItem(PREFIX + "__dk");
    expect(storedDk).not.toBe(null);
    // 重置内存但保留 localStorage 的 __dk，模拟"下次启动"
    win.__test._resetCrypto();
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ key: "sk-test" }));
    await initCrypto();
    expect(getDeviceKey()).not.toBe(null);
    // __dk 不应被覆盖（仍是同一字符串）
    expect(win.localStorage.getItem(PREFIX + "__dk")).toBe(storedDk);
    // 复用密钥能正确加解密
    const enc = await encryptKey("hello");
    const dec = await decryptKey(enc);
    expect(dec).toBe("hello");
  });

  it("saveCfg 加密保存：调用后 localStorage 的 key 为加密对象，getCfg 返回明文", async () => {
    const win = await boot(loadApp());
    const { saveCfg, getCfg, PREFIX, initCrypto, getActiveProfile } = win.__test;
    await initCrypto();
    // 模拟设置抽屉填值（多 Profile 结构：填 active profile 的字段）
    win.document.getElementById("cfgEnabled").checked = true;
    win.document.getElementById("cfgName").value = "OpenAI";
    win.document.getElementById("cfgBase").value = "https://api.example.com";
    win.document.getElementById("cfgKey").value = "sk-from-savecfg";
    win.document.getElementById("cfgModel").value = "gpt-4o-mini";
    // 屏蔽 alert（jsdom 里 alert 会抛）
    win.alert = () => {};
    await saveCfg();
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "cfg"));
    // 多 Profile 结构：key 加密后存在 profiles[0].key
    expect(Array.isArray(stored.profiles)).toBe(true);
    expect(stored.profiles.length).toBeGreaterThanOrEqual(1);
    expect(stored.profiles[0].key.__enc).toBe(true);
    const cfg = getCfg();
    // getActiveProfile() 返回明文 key
    const ap = getActiveProfile();
    expect(ap.key).toBe("sk-from-savecfg");
    expect(cfg.enabled).toBe(true);
  });

  it("Web Crypto 不可用时降级明文不崩", async () => {
    const win = await boot(loadApp());
    const { initCrypto, getCfg, PREFIX, encryptKey, decryptKey } = win.__test;
    win.__test._resetCrypto();
    // 破坏 crypto.subtle，模拟不可用
    const subtleBak = win.crypto.subtle;
    try {
      Object.defineProperty(win.crypto, "subtle", { value: undefined, configurable: true });
    } catch (e) {
      // 若不可写则跳过该断言路径
    }
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ key: "sk-plain-fallback" }));
    await initCrypto();
    const cfg = getCfg();
    expect(cfg.key).toBe("sk-plain-fallback");
    // encryptKey 降级返回明文
    const enc = await encryptKey("x");
    expect(enc).toBe("x");
    const dec = await decryptKey("x");
    expect(dec).toBe("x");
    // 还原
    Object.defineProperty(win.crypto, "subtle", { value: subtleBak, configurable: true });
  });
});