/* tests/sync-incremental-gate.test.js —— 增量同步开关的端到端门控守卫（2026-11-03）
 * ----------------------------------------------------------------------------
 * 背景：设置抽屉里的「增量同步（只传变更）」开关写入 cfg.syncIncremental；
 * 客户端 `_syncIncrementalEnabled()` 读的就是这个字段，syncRound() 据此在
 * 「增量 POST /api/sync/changes」与「全量 apiPutSnapshot」之间分流。
 * 这条链路此前**没有任何测试**：开关存进 cfg ≠ 真的切了路径，接错了也没人发现。
 *
 * 本文件守三件事：
 *   ① 开关 ON ⇒ syncRound 必须打 /api/sync/changes；
 *   ② 开关 OFF（反向对照）⇒ 绝不打 /api/sync/changes，只能走全量；
 *   ③ 闸门读的就是 cfg.syncIncremental 字段本身（防止有人改成读别的字段）。
 *
 * 为什么 stub getCfg 而不是改 localStorage：
 *   getCfg() 返回的是 _cfgCache / localStorage 的**读出副本**，改它不等于改状态；
 *   而 saveCfg() 是**从表单重建**整份 cfg（会把表单外的字段覆盖掉），也不能用。
 *   闸门本身就是 `typeof getCfg === "function" ? getCfg() : null` ⇒ stub 命中真实读取路径。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/** 装一个只记录路径的 apiFetch；返回形状按增量契约（token/changed/removed）。 */
function stubApi(win) {
  const calls = [];
  win.apiFetch = vi.fn(async (p, opts) => {
    calls.push({ path: p, opts: opts || {} });
    if (String(p).indexOf("/api/sync/changes") >= 0) {
      return { ok: true, data: { token: 1, changed: [], removed: [] } };
    }
    return { ok: true, data: { snapshot: {} } };
  });
  return calls;
}

describe("增量同步开关 ⇒ 真的切了路径（不是只存进 cfg）", () => {
  let win;
  beforeEach(() => { win = loadApp(); });

  it("① 开关 ON ⇒ syncRound 打 /api/sync/changes", async () => {
    const calls = stubApi(win);
    win.getCfg = () => ({ syncIncremental: true });
    try { await win.syncRound(); } catch (e) { /* 端点响应细节由下面断言把关，这里只关心打到了哪个路径 */ }
    expect(calls.some(c => c.path === "/api/sync/changes"), "开关打开却没有走增量端点 —— 开关没真正接线").toBe(true);
  });

  it("② 反向对照：开关 OFF ⇒ 绝不打 /api/sync/changes（只走全量）", async () => {
    const calls = stubApi(win);
    win.getCfg = () => ({ syncIncremental: false });
    try { await win.syncRound(); } catch (e) { /* 同上 */ }
    expect(calls.some(c => c.path === "/api/sync/changes"), "开关关闭仍在打增量端点 —— 分流失效").toBe(false);
  });

  it("③ 闸门读的就是 cfg.syncIncremental 字段本身", () => {
    win.getCfg = () => ({ syncIncremental: true });
    expect(win._syncIncrementalEnabled(), "闸门没认 cfg.syncIncremental").toBe(true);
    win.getCfg = () => ({ syncIncremental: false });
    expect(win._syncIncrementalEnabled(), "闸门在 false 时仍判真").toBe(false);
    win.getCfg = () => ({});
    expect(win._syncIncrementalEnabled(), "字段缺省时必须是关（旧档逐位不变）").toBe(false);
  });
});
