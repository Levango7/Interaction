import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * device-key-idb-persistence.test.js —— 设备密钥「写不进 IndexedDB」必须**说出来**（v3.7.124 / 台账 R-19）
 *
 * 触发场景是装机探针里的 ⑧：打包态读到 `getDeviceKey()` 有值、但 `__dk_v2` 不在 IndexedDB 里，
 * 而且**诊断里一条相关的都没有**。查下来不是探针的锅，是产品代码的两条静默分支：
 *   · 新生成密钥：`await _dkIdbPut(...)` 之后**既不验证也不报错** —— 没落住就等于下次启动再生成一把新的，
 *     此前用旧键加密的一切（AI Key 等）当场解不开，用户只会看到「配置莫名其妙没了」。
 *   · 旧键迁移：`if(ok && 回读一致) 删旧键` 的 **else 分支什么都不做** —— H3 的安全意图
 *     （密钥优先进 IDB，缩小 XSS 泄露面）静默落空，密钥一直躺在 localStorage。
 * 两处都刻意**不**加自动兜底：回退 localStorage 会把 H3 特意换来的安全姿态又输回去，那是产品决策不是兜底。
 *
 * jsdom 没有 indexedDB，`useIdb` 判据是 `typeof indexedDB !== "undefined"` —— 所以测试里挂一个空壳
 * 把它翻成"有 IDB"，再用 `registerDkIdbHelpers` 这对**生产就在用的接缝**注入成功/失败的读写。
 */
const DK_LEGACY = "wb_agent___dk";   // 旧路径键（PREFIX + "__dk"）
const DK_IDB = "__dk_v2";

function freshCryptoWin() {
  const win = loadApp();
  win.localStorage.clear();
  win.__test._resetCrypto();
  return win;
}

/** 注入 IDB 接缝：get 返回什么、put 是否落住都由参数决定；返回可断言的记录 */
function seams(win, { putOk = true, getValue = null }) {
  const log = { get: 0, put: [] };
  let stored = getValue;
  win.indexedDB = win.indexedDB || {};        // 只为把 useIdb 翻真（本函数只用 typeof 判据）
  win.registerDkIdbHelpers(
    async () => { log.get++; return stored; },
    async (_k, v) => { log.put.push(_k + "=" + String(v).slice(0, 6)); if (putOk) stored = v; return putOk ? _k : undefined; }
  );
  return { log, readStored: () => stored };
}

/**
 * 正确的装配顺序（第一版我按「先 initCrypto 再装接缝」写，四条全红）：
 *   reset → 装接缝/挂 indexedDB → initCrypto。
 * 因为 initCrypto() 自己就会调 ensureDeviceKey()（crypto.js:252），而 _deviceKey 一旦被启动链缓存，
 * ensureDeviceKey() 首行就 return —— 接缝根本没被调用，诊断自然一条没有（假绿的最短路径）。
 */
async function boot(win, opts) {
  win.__test._resetCrypto();
  const s = seams(win, opts);
  await win.initCrypto();
  return s;
}

/** 诊断条目形状 = pushDiag(level, msg, ctx) → {t, level, msg, ctx:{where}}（where **不在顶层**，
 *  第一版我按 d.where 过滤，结果永远为空、四条用例假绿 —— 判据要打在真实字段上） */
const diagOf = (win) => win.getDiag().filter((d) => /getDeviceKey:(persistNew|migrate)/.test(String((d.ctx || {}).where || "")));
const b64e = (win, bytes) => (win.__test && win.__test.base64Encode ? win.__test.base64Encode(bytes) : win.base64Encode(bytes));

describe("设备密钥落不住 IndexedDB：两处都不得静默", () => {
  let win;
  beforeEach(() => { win = freshCryptoWin(); });

  it("全新生成 + IDB 写入失败 → 报 error（下次启动会换键，旧密文再也解不开）", async () => {
    await boot(win, { putOk: false, getValue: null });
    const key = await win.ensureDeviceKey();
    expect(key, "内存里仍应有可用密钥（不阻塞本次会话）").toBeTruthy();
    const d = diagOf(win);
    expect(d.length, "写失败必须留下一条诊断").toBe(1);
    expect(d[0].level).toBe("error");
    expect(String(d[0].msg)).toMatch(/FAILED to persist in IndexedDB/);
    expect(win.localStorage.getItem(DK_IDB), "不许把新键偷偷写回 localStorage").toBeNull();
  });

  it("全新生成 + 写入并回读一致 → 不说话（成功路径不许刷诊断）", async () => {
    const s = await boot(win, { putOk: true, getValue: null });
    expect(s.readStored(), "__dk_v2 应已落到接缝的存储里").toBeTruthy();
    expect(diagOf(win), "成功路径不得有诊断").toEqual([]);
  });

  it("旧键迁移 + IDB 写入失败 → 报 warn，且旧键**保留**（原值不许被销毁）", async () => {
    win.__test._resetCrypto();
    const legacy = await win.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = new Uint8Array(await win.crypto.subtle.exportKey("raw", legacy));
    win.localStorage.setItem(DK_LEGACY, (win.__test.base64Encode || win.base64Encode)(raw));
    await boot(win, { putOk: false, getValue: null });

    const key = await win.ensureDeviceKey();
    expect(key, "迁移失败也要能用旧键继续工作").toBeTruthy();
    const d = diagOf(win);
    expect(d.length, "迁移没落住必须说话").toBe(1);
    expect(d[0].level).toBe("warn");
    expect(String(d[0].msg)).toMatch(/did not persist - key stays in legacy localStorage/);
    expect(win.localStorage.getItem(DK_LEGACY), "新家没验证成功前，旧键绝不能删").toBeTruthy();
  });

  it("旧键迁移 + 写入并回读一致 → 删旧键、不说话", async () => {
    win.__test._resetCrypto();
    const legacy = await win.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = new Uint8Array(await win.crypto.subtle.exportKey("raw", legacy));
    const b64 = (win.__test.base64Encode || win.base64Encode)(raw);
    win.localStorage.setItem(DK_LEGACY, b64);
    const s = await boot(win, { putOk: true, getValue: null });
    expect(s.readStored(), "新家写入的应与旧键同一个值").toBe(b64);
    expect(win.localStorage.getItem(DK_LEGACY), "回读一致后旧键应被清掉").toBeNull();
    expect(diagOf(win)).toEqual([]);
  });
});
