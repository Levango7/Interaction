/**
 * save-receipt.test.js —— save() 回执丢弃判据的判别力单测（R-37 同族反向，2026-11-09 新增）
 * ----------------------------------------------------------------------------
 * false-receipt.test.js 守「异步回执被丢弃却报成功」；本测守它的**反向同族**：
 * 持久化包装器（_save*）里裸调 save(...) 把写入是否成功的 false 返回值丢掉
 * （配额耗尽 / 隐私模式时调用方以为落盘了，实际没落）。
 *
 * 每条都对应一个判据边界，钉死防复发：
 *   ① 包装器内裸 save(...) ⇒ P0 命中
 *   ② return / 赋值 / 参数位置 / 条件位置 ⇒ 必须 0 命中（消费形态不是丢弃）
 *   ③ 包装器之外的裸 save 不命中（判据只盯 _save* 包装器，收宽了就变 168 处基线冻结）
 *   ④ 本仓四个已知包装器形态全识别（data-links×2 / ai-subagent 双层 / ui-global-events）
 *   ⑤ 现有 src/ 全量 ⇒ 0 命中（修完这 4 处之后的回归基线；零容忍，无基线文件）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findDroppedSaveReceipts } from "../scripts/lib/save-receipt.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

const scan = (code, file = "fixture.js") => findDroppedSaveReceipts(code, file);

describe("save() 回执 · 判别力（每条对应一个判据边界）", () => {
  it("① 包装器内裸 save(...) ⇒ P0 命中且点名包装器", () => {
    const code = "function _saveSessions(){ try{ save(SESSIONS_KEY, _sessions); }catch(_){} }";
    const items = scan(code);
    expect(items.length, "必须抓到").toBe(1);
    expect(items[0].level).toBe("P0");
    expect(items[0].kind).toBe("dropped-save-receipt");
    expect(items[0].wrapper).toBe("_saveSessions");
  });

  it("② 消费形态 ⇒ 0 命中（return / 赋值 / 参数位置 / 条件位置都不是丢弃）", () => {
    const good = [
      'function _saveX(){ try{ return save(K, v); }catch(_){} }',
      'function _saveX(){ const ok = save(K, v); return ok; }',
      'function _saveX(){ other(save(K, v)); }',
      'function _saveX(){ if (save(K, v)) { toast("ok"); } }',
      'function _saveX(){ const r = save(K, v) && warn(); }',
    ];
    for (const g of good) {
      expect(scan(g).length, "这行是规范写法，不该被判：" + g).toBe(0);
    }
  });

  it("③ 包装器之外的裸 save 不命中（判据射程钉死在 _save* 包装器）", () => {
    expect(scan("function persistX(){ save(K, v); }").length).toBe(0);
    expect(scan("function f(){ save(K, v); return save(K2, v2); }").length).toBe(0);
  });

  it("④ 本仓四个已知包装器形态全识别（含 ai-subagent 双层透传）", () => {
    const code = [
      "function _saveSessions(){ try{ save(SESSIONS_KEY, _sessions); }catch(_){} }",
      'function _saveActiveSid(){ try{ save(ACTIVE_SESS_KEY, _activeSid || ""); }catch(_){} }',
      "function _saveSubAgents(){ try{ _saveSubAgentsTick(); }catch(e){} }",
      "function _saveSubAgentsTick(){ save(SUBAGENTS_KEY, _subagents); }",
      "function _saveSyncQueue(q){ try { save(SYNC_QUEUE_KEY, q); } catch(e){} }",
    ].join("\n");
    /* 修复前实扫即 4 处：_saveSubAgents 当时丢的是 Tick 的返回值，
       其体内并无裸 save；修后 Tick 层透传 return、本层 return Tick 调用。 */
    expect(scan(code).length).toBe(4);
    expect(scan(code).map((i) => i.wrapper).sort()).toEqual(
      ["_saveActiveSid", "_saveSessions", "_saveSubAgentsTick", "_saveSyncQueue"]
    );
  });

  it("⑤ 现有 src/ 全量 ⇒ 0 命中（修完 4 处之后的回归基线）", () => {
    const files = readdirSync(SRC).filter((f) => f.endsWith(".js"));
    expect(files.length).toBeGreaterThan(20);
    let hits = 0;
    for (const f of files) hits += scan(readFileSync(join(SRC, f), "utf8"), f).length;
    expect(hits, "src/ 里不该再有持久化包装器丢弃 save() 返回值").toBe(0);
  });
});

describe("save-receipt 判据自身", () => {
  it("判据是零容忍：库里不带基线读取逻辑（与 false-receipt 的棘轮口径区分）", () => {
    expect(existsSync(join(ROOT, "scripts", "lint-save-receipt.baseline.json"))).toBe(false);
  });
});
