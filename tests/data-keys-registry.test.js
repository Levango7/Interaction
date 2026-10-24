/**
 * data-keys-registry.test.js —— 存储键注册表（ARCHITECTURE §4 数据契约，v3.7.148）
 * ----------------------------------------------------------------------------
 * 守的是**漏登记**：本仓的键是各块现拼 `PREFIX + "xxx"`，而云同步用的是负名单
 * （SYNC_EXCLUDED_KEYS），备份靠字符串匹配排除 —— 新加一个键却忘了登记，症状是
 * 「这个功能的数据不上云 / 不进备份」且**没有任何报错**。所以：
 *   ① 源码里出现的每个 `PREFIX + "字面量"` 都必须在注册表里（字面量键或命中动态族 pattern）；
 *   ② 每个历史裸键 `wb_*` 也必须在注册表里；
 *   ③ 反向：注册表里每条字面量键都得真被用到（防僵尸条目，会让人误以为"已覆盖"）；
 *   ④ 自检：扫描器必须真扫到足够多的键（否则"0 条未登记"只是扫描器坏了 —— 台账 R-28）。
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/** 扫描 src/*.js：PREFIX 后缀字面量 + 裸 wb_* 字面量 */
function scanKeys() {
  const suffixes = new Map();   // suffix -> Set(file)
  const bares = new Map();
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith(".js"))) {
    const s = fs.readFileSync(path.join(SRC, f), "utf8");
    for (const m of s.matchAll(/PREFIX\s*\+\s*"([A-Za-z0-9_.]+)"/g)) {
      if (!suffixes.has(m[1])) suffixes.set(m[1], new Set());
      suffixes.get(m[1]).add(f);
    }
    for (const m of s.matchAll(/"((?:wb_)[A-Za-z0-9_]+)"/g)) {
      if (!bares.has(m[1])) bares.set(m[1], new Set());
      bares.get(m[1]).add(f);
    }
  }
  return { suffixes, bares };
}

const { suffixes, bares } = scanKeys();
const win = loadApp({ storage: { "wb_agent_onboarded": "true" } });
const T = win.__test;

/* 这两个是**命名空间前缀**本身（PREFIX 就是 wb_agent_；wb_hybrid_ 是混合检索的键前缀），
   它们不是"某一个键"，不该要求逐条登记；但要求它们确实只被当前缀用（下面 ④ 有断言）。 */
const NAMESPACE_PREFIXES = new Set(["wb_agent_", "wb_hybrid_"]);

describe("存储键注册表", () => {
  it("① src 里每个 PREFIX+\"字面量\"都已在注册表（字面量键或动态族）", () => {
    const missing = [];
    for (const [k, files] of suffixes) {
      if (!T.dataKeyRegistered(k)) missing.push(k + "  <- " + Array.from(files).join(","));
    }
    expect(missing, "以下键没登记（漏登记 = 备份/同步会悄悄漏掉它）：\n" + missing.join("\n")).toEqual([]);
  });

  it("② 每个历史裸键 wb_* 都已登记（命名空间前缀本身除外）", () => {
    const missing = [];
    for (const [k, files] of bares) {
      if (NAMESPACE_PREFIXES.has(k)) continue;
      /* 完整键 wb_agent_xxx 与 PREFIX 命名空间同源：去掉前缀查后缀即可，不必重复登记 */
      /* 完整键 wb_agent_xxx 有两种合法登记方式：按裸键登记，或与 PREFIX 同源（去前缀查后缀） */
      const ok = T.bareKeyRegistered(k)
        || (k.startsWith("wb_agent_") && T.dataKeyRegistered(k.slice("wb_agent_".length)));
      if (!ok) missing.push(k + "  <- " + Array.from(files).join(","));
    }
    expect(missing, "以下裸键没登记：\n" + missing.join("\n")).toEqual([]);
  });

  it("③ 注册表里每条字面量键都真的被用到（防僵尸条目）", () => {
    const zombie = [];
    for (const e of T.DataKeyRegistry) {
      if (e.bare || e.pattern) continue;
      if (!suffixes.has(e.key)) zombie.push(e.key);
    }
    expect(zombie, "这些条目在 src 里找不到用法（注册表在说谎）：\n" + zombie.join("\n")).toEqual([]);
  });

  it("④ 扫描器自检：必须真扫到足够多的键（否则「0 条未登记」没有意义）", () => {
    /* 台账 R-28 的教训：度量器坏掉时，"0 命中"与"确实干净"完全同形 */
    expect(suffixes.size, "扫到的 PREFIX 后缀太少 = 扫描器可能失效").toBeGreaterThanOrEqual(60);
    expect(bares.size, "扫到的裸键太少 = 扫描器可能失效").toBeGreaterThanOrEqual(15);
    expect(suffixes.has("tasks"), "阳性样本：tasks 必须被扫到").toBe(true);
    expect(bares.has("wb_access_token"), "阳性样本：wb_access_token 必须被扫到").toBe(true);
    expect(T.DataKeyRegistry.length, "注册表本身不能是空的").toBeGreaterThanOrEqual(80);
  });

  it("⑤ 凭据类一律不上云（sync 只能是 false）；其余键两类取值都要有（防一刀切）", () => {
    /* 只对**凭据**做强约束：控制/元数据键（theme/lang/active…）本来就靠云同步跨设备生效。 */
    const bad = T.DataKeyRegistry.filter((e) => e.kind === "s" && e.sync !== false);
    expect(bad.map((e) => e.key || String(e.pattern)), "凭据类不许标 sync:true").toEqual([]);
    /* 反向自检：必须存在两种 sync 值，否则这条断言可能只是"全是 false" */
    expect(T.DataKeyRegistry.some((e) => e.sync === true)).toBe(true);
    expect(T.DataKeyRegistry.some((e) => e.sync === false)).toBe(true);
  });
});
