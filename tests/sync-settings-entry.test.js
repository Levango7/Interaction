/* tests/sync-settings-entry.test.js — 云同步/自建后端设置入口守卫（2026-10-31）
 *
 * 背景：后端（server/src/sync.js 四端点 + Bearer + 冲突策略）与 CORS 早已齐备，
 * 但 cfg.apiBase / cfg.syncIncremental 只有读取方，没有写入入口 —— 用户无处配置，
 * 后端跑起来也连不上。本文件守住"入口真的存在且双向可用"。
 *
 * 守四件事：
 *   ① DOM：设置抽屉里确实有 #cfgApiBase 与 #cfgSyncIncremental；
 *   ② 写路径：ui-drawer 源码里两个 id 各出现 ≥2 次（回填 + 保存），只出现一次说明半边没接；
 *   ③ 读路径未变：地址留空时 apiBase 默认仍是 http://localhost:3001（旧档行为不变）；
 *   ④ 双语：cloud.* 键在 zh 与 en 词典中都存在（否则英文界面回落中文）。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("① DOM：设置抽屉必须有这两个入口", () => {
  it("cfgApiBase / cfgSyncIncremental 均存在于注入后的应用里", () => {
    const win = loadApp();
    expect(win.document.getElementById("cfgApiBase"), "缺少后端地址输入框").toBeTruthy();
    expect(win.document.getElementById("cfgSyncIncremental"), "缺少增量同步开关").toBeTruthy();
  });
  it("增量同步开关是 checkbox（绑定门禁覆盖的类型）", () => {
    const win = loadApp();
    const el = win.document.getElementById("cfgSyncIncremental");
    expect(el.tagName).toBe("INPUT");
    expect(el.getAttribute("type")).toBe("checkbox");
  });
});

describe("② 写路径：回填与保存都接了（缺一即半边）", () => {
  const src = read("src/ui-drawer.js");
  it("cfgApiBase 出现 ≥2 次（回填 + 保存）", () => {
    expect((src.match(/#cfgApiBase/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it("cfgSyncIncremental 出现 ≥2 次（回填 + 保存）", () => {
    expect((src.match(/#cfgSyncIncremental/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("③ 反向对照：未配置时行为不变", () => {
  it("地址留空分支是 delete 而不是写入空串（防止污染 cfg 与同步判定）", () => {
    const src = read("src/ui-drawer.js");
    expect(/if\(v\) cfg\.apiBase=v; else delete cfg\.apiBase;/.test(src), "留空必须删除字段，不能写空串").toBe(true);
  });
  it("默认后端仍是 localhost:3001（ui-ge-api 的回落值未被改动）", () => {
    const api = read("src/ui-ge-api.js");
    expect(api.includes("http://localhost:3001"), "默认 apiBase 回落值被改了").toBe(true);
  });
});

describe("④ 双语键齐备", () => {
  it("cloud.* 在中文与英文词典都存在", () => {
    const i18n = read("src/core-i18n.js");
    for (const k of ["cloud.title", "cloud.desc", "cloud.apiBase", "cloud.incrementalLabel", "cloud.incrementalSub", "a11y.cloudSync"]) {
      expect((i18n.match(new RegExp('"' + k.replace(/\./g, "\\.") + '"', "g")) || []).length, k + " 必须在 zh 与 en 各出现一次").toBe(2);
    }
  });
});
