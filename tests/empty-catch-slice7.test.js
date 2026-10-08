/**
 * empty-catch-slice7.test.js —— R-2 第七片（设置面板的「cfg 落盘」谎报簇）
 * ----------------------------------------------------------------------------
 * 本片 4 处，都在 ui-global-events.js（第五片之后同文件继续，零交集）：
 *   · `#aiSkillsSave`（工具白名单）—— **安全语义最重**：写失败却 toast「白名单已同步到
 *     允许调用的工具」，用户以为限制住了可调用的工具，实际全放开；
 *   · `#aiMemSave`（记忆配置）—— 主配置 ai_config_memory 确实已存，但 cfg.rag 镜像字段
 *     没同步 → 刷新后 RAG 开关回退，而用户刚看到「已保存」（部分不一致）；
 *   · `_saveSyncQueue`（离线操作队列）—— 写失败 = 断网期间的操作刷新后丢失；
 *   · `subscribePush`（推送订阅状态）—— 写失败 → 下次启动显示「未订阅」，其实订阅还在。
 * 结果：ui-global-events.js P0 10 → 6，全局 P0 94 → 90。
 *
 * 🔴 与第五片同一个坑的延续：那 10 处 P0 的注释大多是 `/* noop *​/`、`/* 静默 *​/` 这种
 *   **零信息标注** —— 门禁的 bare 判据「有没有注释」放过了它们，但作者其实没评估过。
 *   本片把其中 4 处改成有信息量的说明 + 诊断；剩下 6 处（列表遍历空态、PWA 安装记录、
 *   removeItem、SW 通知降级到普通通知等）复查后确认确实该静默，不动。
 *
 * ⚠️ 环境坑：
 *   ① mock 必须打到 **`save` 本身**并按 key 过滤 —— `saveAiConfig("skills", …)` 也在同一个
 *      onclick 里，若让 save 一律抛错，会先在 saveAiConfig 那一步抛出去（它没有 try 包裹），
 *      根本走不到被测的 cfg catch。实测第一版探针就栽在这里。
 *   ② `subscribePush` 在 jsdom 里**无法触发**（`navigator.serviceWorker` 不存在）→
 *      该处只做静态契约断言，不假装测过。
 *
 * 运行：npx vitest run tests/empty-catch-slice7.test.js   （需拼回态）
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";
import { scanSource, keyOf } from "../scripts/lib/empty-catch.mjs";

const SRC = path.resolve(process.cwd(), "src", "ui-global-events.js");

let win, diagCalls, restoreSave;

function installDiagProbe() {
  diagCalls = [];
  Object.defineProperty(win, "pushDiag", { configurable: true, value: (level, msg, ctx) => diagCalls.push({ level, msg, ctx }) });
}

/** 只让「cfg / 离线队列」这两类 key 落盘失败，其余（如 saveAiConfig）放行 —— 见文件头坑① */
function breakCfgAndQueueSave() {
  const orig = win.save;
  restoreSave = () => Object.defineProperty(win, "save", { configurable: true, value: orig });
  Object.defineProperty(win, "save", {
    configurable: true,
    value: function (k, v) {
      if (/_cfg$/.test(String(k)) || /sync/i.test(String(k))) throw new Error("QuotaExceededError");
      return orig(k, v);
    },
  });
}

const diagOf = (where) => diagCalls.filter((d) => d.ctx && d.ctx.where === where);

beforeEach(async () => {
  win = loadApp({ storage: { wb_agent_onboarded: "true" } });
  await new Promise((r) => setTimeout(r, 250));
  installDiagProbe();
});

afterEach(() => {
  try { restoreSave && restoreSave(); } catch (_) { /* 每个用例都重新 loadApp */ }
  try { win && win.close && win.close(); } catch (_) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① 工具白名单写失败 → 必须留痕（安全语义：以为限制住了、实际全放开）", () => {
  it("cfg 落盘失败 → pushDiag 收到 error，归因 aiSkillsSave、带原始原因", () => {
    breakCfgAndQueueSave();
    const btn = win.document.getElementById("aiSkillsSave");
    expect(btn && btn.onclick, "保存按钮应被绑定（否则本用例是空转）").toBeTruthy();

    btn.onclick();

    const hits = diagOf("aiSkillsSave");
    expect(hits).toHaveLength(1);
    expect(hits[0].level).toBe("error");            // 安全语义用 error 级
    expect(String(hits[0].msg)).toMatch(/tool whitelist persist failed/);
    expect(String(hits[0].msg)).toMatch(/QuotaExceededError/);
  });

  it("写成功 → 零 diag（反向守护）", () => {
    const btn = win.document.getElementById("aiSkillsSave");
    btn.onclick();
    expect(diagCalls).toHaveLength(0);
  });
});

describe("② 记忆配置的 cfg.rag 镜像同步失败 → 留痕（部分不一致）", () => {
  it("cfg 落盘失败 → warn 且归因 aiMemSave", () => {
    breakCfgAndQueueSave();
    const btn = win.document.getElementById("aiMemSave");
    expect(btn && btn.onclick).toBeTruthy();

    btn.onclick();

    const hits = diagOf("aiMemSave");
    expect(hits).toHaveLength(1);
    expect(hits[0].level).toBe("warn");             // 主配置已存，故 warn 而非 error
    expect(String(hits[0].msg)).toMatch(/cfg\.rag sync failed/);
  });
});

describe("③ 离线队列落盘失败 → 留痕，且高频路径只报一次", () => {
  it("两次入队 → 只登记 1 条（断网时每次都入队，不能刷屏）", () => {
    breakCfgAndQueueSave();
    expect(typeof win._saveSyncQueue).toBe("function");

    win._saveSyncQueue([{ op: "task.create" }]);
    win._saveSyncQueue([{ op: "task.create" }, { op: "task.complete" }]);

    const hits = diagOf("_saveSyncQueue");
    expect(hits).toHaveLength(1);
    expect(String(hits[0].msg)).toMatch(/sync queue persist failed/);
  });

  it("落盘成功 → 零 diag（反向守护）", () => {
    win._saveSyncQueue([{ op: "task.create" }]);
    expect(diagCalls).toHaveLength(0);
  });
});

describe("④ 静态契约：无法行为触发的那一处 + 通用规矩", () => {
  const raw = () => fs.readFileSync(SRC, "utf8");

  it("subscribePush 的落盘失败留痕在位（jsdom 无 serviceWorker，只能静态断言）", () => {
    const s = raw();
    expect(s).toMatch(/where:"subscribePush"/);
    expect(s).toMatch(/push subscription persist failed/);
  });

  it("四处留痕都带二次保护（登记诊断自身失败不能连累业务）", () => {
    const s = raw();
    const guards = s.match(/typeof pushDiag === "function"/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(4);
  });

  it("一次性标记变量 _syncQueueWarned 在位（漏了就退化成刷屏）", () => {
    const s = raw();
    expect(s).toMatch(/let _syncQueueWarned = false;/);
    expect(s).toMatch(/if\(!_syncQueueWarned && typeof pushDiag === "function"\)/);
  });

  it("说明注释落在 try **之前**（白名单那处），不落在 tryBody 里", () => {
    /* 第五片踩过的坑：注释写在 `}catch` 之前会被算进 tryBody（= 左花括号到 catch 之间），
       sig 随之改变 → 门禁判「新增 P0」。这里正面钉住正确形态：注释以 星号斜杠 收尾，
       紧接着才是 try。 */
    expect(raw()).toMatch(/\*\/\s*\n\s*try\{ save\(PREFIX\+"cfg", cfg\); \}catch\(_e\)\{/);
  });

  it("🔴 直接复用门禁逻辑：本片改动不得在 ui-global-events.js 判出任何新增 P0", () => {
    /* 这是上面那条的**本质判据** —— 注释位置写错的最直接后果就是 sig 改变、被当成新增 P0。
       与其描述形态，不如把门禁的判据在这里跑一遍（同一套 scanSource + keyOf）。 */
    const basePath = path.resolve(process.cwd(), "scripts", "lint-empty-catch.baseline.json");
    const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
    const baseKeys = new Set(base.items.map(keyOf));
    const cur = scanSource(raw(), "ui-global-events.js", {});
    const newP0 = cur.filter((i) => i.level === "P0" && !baseKeys.has(keyOf(i)));
    expect(newP0.map((i) => i.line), "不该有新增 P0（注释若落进 tryBody，sig 变化即被判新增）").toEqual([]);
  });
});
