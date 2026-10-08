/**
 * empty-catch-slice8.test.js —— R-2 第八片（ui-drawer：Electron 同步失败 + 零信息注释）
 * ----------------------------------------------------------------------------
 * 本片 2 类共 4 处，都在 ui-drawer.js（第五片之后同文件继续，零交集）：
 *   ① `saveCfg` 里的 `electronAPI.setAiConfig` 失败静默 —— Electron 下主进程与渲染进程的
 *      AI 配置会不一致（可能沿用旧 Key/base），而用户看到的是「已保存」；
 *   ② 三处 `localStorage.removeItem(__pendingAiAsk)` 的 `/* noop *​/` —— 第七片发现的
 *      「零信息标注」模式：门禁的 bare 判据只看「有没有注释」，这种等于没评估的注释也算数。
 *      （行为本就是预期降级，故只升级注释、不登记诊断。）
 *
 * 结果：ui-drawer.js P0 6 → 5，全局 P0 90 → 89。
 *
 * 🔴 本片踩到的正是**铁律 0f 的活教材**：改 613/628 的注释时，它们在 631 那个外层 try 的
 *   tryBody **范围内**（sig 基于 tryBody 全文）→ 外层条目的 sig 跟着变 → 门禁判「新增 P0」，
 *   而代码行为一点没变。所以「修一片」后必须**按文件精确重冻**（本次 ui-drawer 34 → 34，
 *   数量守恒：一条 sig 变 + 一条因 catch 不再为空而消失 + 一条新增的二次保护）。
 *
 * ⚠️ 环境要点：
 *   ① `isElectron()` 的实现就是 `typeof window.electronAPI !== "undefined"` —— 所以造出
 *      一个 electronAPI 就等于把自己变成 Electron 端，行为用例才进得去那段 if。
 *   ② 入口是 `$("#cfgSave").onclick = saveCfg`（绑在 ui-global-events），saveCfg 是 async。
 *   ③ 反向守护同样重要：**浏览器端（无 electronAPI）不该报** —— 否则每次保存配置都刷一条噪声。
 *
 * 运行：npx vitest run tests/empty-catch-slice8.test.js   （需拼回态）
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";
import { scanSource, keyOf } from "../scripts/lib/empty-catch.mjs";

const SRC = path.resolve(process.cwd(), "src", "ui-drawer.js");

let win, diagCalls;

function installDiagProbe() {
  diagCalls = [];
  Object.defineProperty(win, "pushDiag", { configurable: true, value: (level, msg, ctx) => diagCalls.push({ level, msg, ctx }) });
}

/** 造出 electronAPI（isElectron() 即看它存不存在）；setAiConfig 可设为抛错 */
function fakeElectron({ failSetAiConfig = false } = {}) {
  Object.defineProperty(win, "electronAPI", {
    configurable: true,
    value: {
      setAutoLaunch: () => {},
      setAiConfig: async () => { if (failSetAiConfig) throw new Error("ipc-renderer-unavailable"); },
    },
  });
}

const diagOf = (where) => diagCalls.filter((d) => d.ctx && d.ctx.where === where);

/* 本文件用 beforeAll 只装一次 jsdom：agent-workbench.html 有 3.6MB，
   按 beforeEach 每次装会让整文件拖到 77s+（实测）。改为共享实例 + 每条用例重置状态，
   行为等价（下面 beforeEach 会把 electronAPI 与诊断记录清干净）。 */
beforeAll(async () => {
  win = loadApp({ storage: { wb_agent_onboarded: "true" } });
  /* saveCfg 会顺带触发云端/集成侧检查；不挡掉真实网络会让每个用例拖到几十秒
     （实测未 mock 时整文件 112s）。这里只关心 Electron 同步那一段，网络一律快速失败。 */
  win.fetch = async function () { throw new Error("no-net-in-test"); };
  await new Promise((r) => setTimeout(r, 250));
  installDiagProbe();
});

beforeEach(() => {
  diagCalls.length = 0;
  try { delete win.electronAPI; } catch (_) { /* 不存在也无妨 */ }   // 每条用例从「浏览器端」干净起步
});

afterAll(() => {
  try { win && win.close && win.close(); } catch (_) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① Electron 端 AI 配置同步失败 → 留痕（否则主进程沿用旧 Key/base）", () => {
  it("setAiConfig 抛错 → pushDiag 收到 warn，归因 cfgSave 并带原始原因", async () => {
    fakeElectron({ failSetAiConfig: true });
    expect(typeof win.saveCfg).toBe("function");

    await win.saveCfg();

    const hits = diagOf("cfgSave");
    expect(hits).toHaveLength(1);
    expect(hits[0].level).toBe("warn");
    expect(String(hits[0].msg)).toMatch(/setAiConfig to main failed/);
    expect(String(hits[0].msg)).toMatch(/ipc-renderer-unavailable/);
  });

  it("同步成功 → 零 diag（反向守护）", async () => {
    fakeElectron({ failSetAiConfig: false });
    await win.saveCfg();
    expect(diagCalls).toHaveLength(0);
  });

  it("🔴 浏览器端（无 electronAPI）不报 —— 否则每次保存配置都刷噪声", async () => {
    /* isElectron() 为 false → 根本进不去那段 if；这里断言结果：零 diag。
       这条守的是「别为了可观测性把预期路径也报成异常」。 */
    expect(win.electronAPI).toBeUndefined();
    await win.saveCfg();
    expect(diagOf("cfgSave")).toHaveLength(0);
  });
});

describe("② 静态契约：零信息注释已升级 + 门禁判据自证", () => {
  const raw = () => fs.readFileSync(SRC, "utf8");

  it("三处 __pendingAiAsk 清理不再是 `/* noop *​/`（说明为什么可以静默）", () => {
    const s = raw();
    const noopPending = s.match(/removeItem\(PREFIX \+ "__pendingAiAsk"\)[^;]*catch\(e\)\{ \/\* noop \*\/ \}/g) || [];
    expect(noopPending, "不该再有零信息标注的离线意图清理").toHaveLength(0);

    const explained = s.match(/清不掉只会让过期意图多留一轮/g) || [];
    expect(explained).toHaveLength(3);
  });

  it("electronAPI 的留痕带「存在性」前置判断（双保险，避免误报）", () => {
    expect(raw()).toMatch(/if\(window\.electronAPI && typeof pushDiag === "function"\)/);
  });

  it("🔴 直接复用门禁逻辑：本文件不得被判出任何新增 P0", () => {
    /* 第八片的教训就在这条：改内层注释会连坐外层条目的 sig。把门禁判据在这里跑一遍，
       以后谁再动这里、位置放错，这条会直接红。 */
    const basePath = path.resolve(process.cwd(), "scripts", "lint-empty-catch.baseline.json");
    const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
    const baseKeys = new Set(base.items.map(keyOf));
    const cur = scanSource(raw(), "ui-drawer.js", {});
    const newP0 = cur.filter((i) => i.level === "P0" && !baseKeys.has(keyOf(i)));
    expect(newP0.map((i) => i.line), "不该有新增 P0（内层改动会连坐外层 sig）").toEqual([]);
  });
});
