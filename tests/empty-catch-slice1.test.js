/**
 * empty-catch-slice1.test.js —— R-2 第一片（密钥面 + 迁移面）的**可观测行为**用例
 * ----------------------------------------------------------------------------
 * 背景（docs/audit-2026-10-06.md R-2）：`lint-empty-catch` 只防"新增"，存量 P0 空 catch 118 处
 * （静默吞真实错误）无人消解。第一片按**风险**取而非按数量：crypto.js(5) + data-migrate.js(4)。
 * 本文件不许只是"把 catch 填上日志就算修完" —— 每条都断言一个**外部可见的结果**。
 *
 * 锁的六件事：
 *   ① 迁移重置是**销毁性**动作：备份写不进去时**绝不重置**（旧代码备份失败照样 `save([])`，
 *      用户数据既坏又无处找回、且零痕迹）。
 *   ② 备份成功时**行为不变**（防我把修复改成过头的"永不重置"，那是另一种坏）。
 *   ③ 设备密钥换新 = 旧密文永久解不开；明文再持久化失败 = Key 继续躺在存储里。
 *      这类 consequential 事件必须进诊断日志。
 *   ④ 扫描阶段跳过坏键要留下**是哪个键**（否则"0 条旧记录"与"根本没读到"长得一样）。
 *   ⑤ 写失败在本项目里常常**不是异常而是 `save()` 的返回值**：只加 try/catch 就是装饰
 *      （我第一版就踩了这点）—— 所以 `persistCfg` 改为回传结果，false 分支单独有用例守。
 *   ⑥ 保留损坏原值会把风险**移到读路径**：`cleanupRecycle` 曾因此在启动的异步链里抛未捕获拒绝
 *      （不经错误边界，用户只看到功能安静地少了）—— 现在读者带形状守卫，并被这条钉住。
 *
 * 运行：npx vitest run tests/empty-catch-slice1.test.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

let win, origSetItem;

beforeEach(async () => {
  win = loadApp();
  // 等启动异步链跑完再动手：startup 自己会生成/落盘设备密钥，抢在后面写就会造成用例间竞态
  // （与 tests/crypto.test.js 的 boot() 同口径）
  await new Promise((r) => setTimeout(r, 60));
  win.localStorage.clear();
  origSetItem = win.Storage.prototype.setItem;
});
afterEach(() => {
  win.Storage.prototype.setItem = origSetItem;
  vi.restoreAllMocks();
});

/** 让"备份键"的写入失败（模拟配额满 / 隐私模式），其余写入照常 */
function failBackupsOnly() {
  win.Storage.prototype.setItem = function (k, v) {
    if (String(k).includes("_broken_")) throw new win.DOMException("QuotaExceededError", "QuotaExceededError");
    return origSetItem.call(this, k, v);
  };
}

const brokenKeys = () => Object.keys(win.localStorage).filter((k) => k.startsWith(PREFIX + "tasks_broken_"));

describe("① 备份失败 → 不销毁原值（迁移面 P0 的真修复）", () => {
  it("tasks 非数组且备份写入失败：原值保留、不重置、诊断有 error", () => {
    const BAD = JSON.stringify({ broken: true });
    win.localStorage.setItem(PREFIX + "tasks", BAD);
    failBackupsOnly();
    const diagSpy = vi.spyOn(win, "pushDiag");
    const toastSpy = vi.spyOn(win, "toast");

    win.migrate();

    expect(win.localStorage.getItem(PREFIX + "tasks"), "备份失败时必须保留原值，不许重置").toBe(BAD);
    expect(brokenKeys().length, "备份本应失败，不该留下备份键").toBe(0);
    const err = diagSpy.mock.calls.find((c) => c[0] === "error" && /backup FAILED/i.test(String(c[1])));
    expect(err, "备份失败必须进诊断日志（error）").toBeTruthy();
    expect(err[1], "日志要点明'跳过重置'这一处置").toMatch(/reset is skipped/i);
    const kept = toastSpy.mock.calls.find((c) => /保留原值不重置/.test(String(c[0])));
    expect(kept, "提示必须与真实行为一致：不能说'已备份并重置'").toBeTruthy();
  });

  it("cfg 与 links 走同一条约束（三处销毁性重置都不许绕过备份检查）", () => {
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify([1, 2]));
    win.localStorage.setItem(PREFIX + "links", JSON.stringify({ not: "array" }));
    failBackupsOnly();
    const cfgBefore = win.localStorage.getItem(PREFIX + "cfg");
    const linksBefore = win.localStorage.getItem(PREFIX + "links");

    win.migrate();

    expect(win.localStorage.getItem(PREFIX + "cfg"), "cfg 备份失败时不重置").toBe(cfgBefore);
    expect(win.localStorage.getItem(PREFIX + "links"), "links 备份失败时不重置").toBe(linksBefore);
  });
});

describe("② 备份成功 → 行为不变（防修复过头）", () => {
  it("tasks 非数组且备份可用：仍然备份原值并重置为空数组", () => {
    const BAD = JSON.stringify({ broken: true });
    win.localStorage.setItem(PREFIX + "tasks", BAD);

    win.migrate();

    expect(win.localStorage.getItem(PREFIX + "tasks"), "备份成功时照常重置").toBe("[]");
    expect(brokenKeys().length, "备份键必须存在").toBe(1);
    expect(win.localStorage.getItem(brokenKeys()[0])).toBe(BAD);
  });
});

describe("③ 设备密钥换新 / 明文留存失败必须留痕（密钥面 P0）", () => {
  it("旧路径设备密钥损坏 → 重建新密钥，且诊断里写明'旧密文将解不开'", async () => {
    const T = win.__test;
    T._resetCrypto();
    win.localStorage.clear();
    // 合法 base64 但长度不是 32 字节 → crypto.subtle.importKey 必抛
    win.localStorage.setItem(PREFIX + "__dk", "dG9vc2hvcnQ=");
    const diagSpy = vi.spyOn(win, "pushDiag");

    await T.initCrypto();

    const warn = diagSpy.mock.calls.find((c) => /device key/i.test(String(c[1])));
    expect(warn, "密钥换新必须上报（此前是静默换键）").toBeTruthy();
    expect(warn[1], "必须点明后果：以前加密的数据再也解不开").toMatch(/undecryptable/i);
    expect(T.getDeviceKey(), "坏键应自愈（生成新密钥）").toBeTruthy();
  });

  it("AI Key 明文再持久化失败 → 报 error 且点明'仍是明文'（隐私外泄面不许静默）", async () => {
    const T = win.__test;
    T._resetCrypto();
    win.localStorage.clear();
    win.localStorage.setItem(PREFIX + "cfg",
      JSON.stringify({ enabled: true, base: "https://x", model: "m", key: "sk-legacy-plain" }));
    // 只拦 cfg 的写入：模拟"迁移写不下去"，其它写入照常
    win.Storage.prototype.setItem = function (k, v) {
      if (String(k) === PREFIX + "cfg") throw new win.DOMException("QuotaExceededError", "QuotaExceededError");
      return origSetItem.call(this, k, v);
    };
    const diagSpy = vi.spyOn(win, "pushDiag");

    await T.initCrypto();
    const cfg = await T.getCfg();

    expect(cfg.key, "内存态仍应拿到明文（行为不变）").toBe("sk-legacy-plain");
    const hit = diagSpy.mock.calls.find((c) => c[0] === "error" && /plaintext|unencrypted/i.test(String(c[1])));
    expect(hit, "再持久化失败必须进诊断日志：此时 Key 仍以明文躺在 storage 里").toBeTruthy();
  });
});

describe("⑤ 写失败是 save() 的返回值而不是异常 —— 两条 false 分支也不能静默", () => {
  it("persistCfg 直接写失败：返回 false 且诊断点名（此前返回值被丢弃）", async () => {
    const T = win.__test;
    T._resetCrypto();
    win.localStorage.clear();
    await T.initCrypto();                       // 先把设备密钥准备好，排除"加密不可用"干扰分支
    win.Storage.prototype.setItem = function (k, v) {
      if (String(k) === PREFIX + "cfg") throw new win.DOMException("QuotaExceededError", "QuotaExceededError");
      return origSetItem.call(this, k, v);
    };
    const diagSpy = vi.spyOn(win, "pushDiag");

    const ok = await T.persistCfg({ enabled: true, base: "https://x", model: "m", profiles: [{ id: "p1", key: "sk-abc" }] });

    expect(ok, "写不进去必须回 false（旧代码把这个返回值丢了）").toBe(false);
    const hit = diagSpy.mock.calls.find((c) => c[0] === "error" && /cfg write to localStorage FAILED/i.test(String(c[1])));
    expect(hit, "写失败必须进诊断日志").toBeTruthy();
    expect(hit[1], "日志要带分支标记，否则三处写点混成一条").toMatch(/where=/);
  });

  it("迁移日志写不进去：迁移照常完成，但留一条 warn", () => {
    // 种一条"缺新字段"的旧任务 —— 这是唯一会写迁移日志的形态（有旧数据才记）
    win.localStorage.setItem(PREFIX + "tasks",
      JSON.stringify([{ id: "t1", sc: "office", title: "旧任务", status: "todo", created: 1 }]));
    win.Storage.prototype.setItem = function (k, v) {
      if (String(k) === PREFIX + "migrationLog") throw new win.DOMException("QuotaExceededError", "QuotaExceededError");
      return origSetItem.call(this, k, v);
    };
    const diagSpy = vi.spyOn(win, "pushDiag");

    let threw = false;
    try { win.migrate(); } catch (e) { threw = true; }

    expect(threw, "日志写失败不许中断迁移").toBe(false);
    const hit = diagSpy.mock.calls.find((c) => /migration log write failed/i.test(String(c[1])));
    expect(hit, "但必须留痕：这次迁移动过什么从此没有本地凭据").toBeTruthy();
  });
});

describe("⑥ 保留损坏原值之后，读路径必须扛住（不崩才算真修复）", () => {
  it("tasks 是非数组且备份失败：原值保留 + cleanupRecycle 不抛未捕获拒绝", () => {
    const BAD = JSON.stringify({ broken: true });
    win.localStorage.setItem(PREFIX + "tasks", BAD);
    failBackupsOnly();
    win.migrate();                                   // ① 的行为：不重置
    expect(win.localStorage.getItem(PREFIX + "tasks"), "先确认原值确实被保留了").toBe(BAD);

    let threw = false;
    try { win.cleanupRecycle(); } catch (e) { threw = true; }
    /* 修前这里必炸（TypeError: all.filter is not a function），且它跑在 startup 的异步链里
       —— 不经过错误边界，用户侧表现为"应用安静地少了一半功能"。 */
    expect(threw, "启动清理链不许因为损坏的 tasks 键抛错").toBe(false);
    expect(win.localStorage.getItem(PREFIX + "tasks"), "清理也不得顺手覆盖掉原值").toBe(BAD);
  });
});

describe("④ 扫描阶段跳过坏键要留下是哪个键", () => {
  it("rec_ 键 JSON 损坏 → detectLegacyData 不抛，但诊断点名该键", () => {
    win.localStorage.setItem(PREFIX + "rec_office", "{oops");
    const diagSpy = vi.spyOn(win, "pushDiag");

    let threw = false;
    let res;
    try { res = win.detectLegacyData(); } catch (e) { threw = true; }

    expect(threw, "扫描遇到坏键不应抛").toBe(false);
    expect(res, "仍返回统计对象").toBeTruthy();
    const hit = diagSpy.mock.calls.find((c) => /rec_office/.test(String(c[1])));
    expect(hit, "必须点名是哪个键坏了（否则'0 条旧记录'与'没读到'长得一样）").toBeTruthy();
  });
});
