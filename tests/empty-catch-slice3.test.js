/**
 * empty-catch-slice3.test.js —— R-2 第三片（API 面 · 危险操作删除类）的**可观测行为**用例
 * ----------------------------------------------------------------------------
 * 背景（docs/audit-2026-10-06.md R-2）：`lint-empty-catch` 只防新增，存量 P0 空 catch 无消解计划。
 * 切片按**风险**不按数量：第一片 crypto+data-migrate（密钥/迁移），第二片 ui-backup-stats
 * （备份面，等批次②提交后再动），**第三片 ui-ge-api（19 处，数量最大）**。
 *
 * 本文件只钉第三片里**真正改变行为**的两处（其余 17 处是「加载失败静默」，属合理降级）：
 *   `apiDeleteDevice`（登出设备）与 `apiDeleteSchedule`（删除提醒）—— 二者此前是 `catch(e){}`。
 *
 * 为什么这两处**不是**合理降级（与本片另 17 处的分界线）：
 *   · 同文件成功路径本就有 toast（api.loginSuccess / api.scheduleAdded …），**失败侧却完全静默**，
 *     属反馈不对称；
 *   · 失败后紧跟 `_loadDeviceList()` / `_loadSchedules()` 刷新列表 → 条目还在 → 用户看到「点了没反应」；
 *   · 更重的是**安全语义**：用户以为设备已登出、实际该设备仍能访问数据；
 *     以为提醒已删、实际它还会继续触发。这是「谎报成功」，不是「体验瑕疵」。
 *
 * 🔴 本文件不许只是断言「catch 里填了日志」—— 每条都断言一个**外部可观测的结果**：
 *   ① 失败 → 用户真的看见 toast（且是 warn 级）+ 诊断真的收到 error；
 *   ② 成功 → 不弹 toast、行为与修复前一致（防把修复做成另一种错误的"永不刷新"）；
 *   ③ 失败后**仍然刷新列表**（本片不动控制流，只补反馈 —— 变了就是修复过头）。
 *
 * ⚠️ 两个环境坑（各踩一次，写在这里防回头）：
 *   ① 登录态必须经 `loadApp({storage})` 在**脚本执行前**注入 —— token 水合发生在启动时，
 *      事后再 setItem 已经晚了，且 `_loadApiPanels()` 开头 `if(!isApiLoggedIn()) return;` 会直接短路。
 *   ② 必须 mock **`fetch`** 而非 `window.apiGetDevices` —— 渲染函数调的是 **IIFE 闭包内的局部
 *      函数**，改 window 上的引用完全无效（表现为按钮渲染不出来，用例退化成空转的绿）。
 *      所有 API 最终都走 `apiFetch → fetch`，这是唯一能进到闭包的口子。
 *
 * 运行：npx vitest run tests/empty-catch-slice3.test.js
 *   ⚠️ 需拼回态（loadApp 要求 HTML ≥1.2MB）。若报「源码态」先 npm run src:inject。
 *   本文件刻意用直跑 vitest 而非 npm test —— 避免 posttest 把工作区抽回源码态，
 *   干扰并行会话（它们可能正依赖拼回态）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";

let win, toastCalls, diagCalls;

/** 装探针：捕获 toast / pushDiag 入参，同时保留原行为（不改变可见性） */
function installProbes() {
  toastCalls = [];
  diagCalls = [];
  const origToast = win.toast;
  const origDiag = win.pushDiag;
  win.toast = function (msg, type) { toastCalls.push({ msg, type }); return origToast && origToast.apply(win, arguments); };
  win.pushDiag = function (level, msg, ctx) { diagCalls.push({ level, msg, ctx }); return origDiag && origDiag.apply(win, arguments); };
}

/**
 * mock 网络层（见文件头坑②：必须 mock fetch）。
 *
 * ⚠️ 第三个坑：`apiFetch` 的返回是 `{ ok: resp.ok, data: await resp.json(), ... }` ——
 * 它**已经帮你包装好了 ok/data**，所以 mock 的 `json()` 应直接返回业务体（如 `{devices:[…]}`），
 * 不要再套一层 `{ok,data}`，否则调用方读的 `r.data.devices` 是 undefined，
 * 表现为「fetch 明明被调用了、但一行都渲染不出来」。
 * 同理 URL 要按真实路径写：`/api/auth/devices` 与 `/api/notifications/schedules`（不是 `/api/schedules`）。
 */
function mockFetch({ failDelete = false } = {}) {
  win.fetch = async function (url, opts) {
    const u = String(url);
    const method = (opts && opts.method) || "GET";
    if (method === "DELETE" && /\/api\/auth\/devices\/[^/]+$/.test(u)) {
      if (failDelete) throw new Error("network down");
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (method === "DELETE" && /\/api\/notifications\/schedules\/[^/]+$/.test(u)) {
      if (failDelete) throw new Error("500 server");
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (/\/api\/auth\/devices$/.test(u)) {
      return { ok: true, status: 200, json: async () => ({ devices: [{ id: "dev-1", deviceName: "测试设备", lastSeen: "2026-10-07" }] }) };
    }
    if (/\/api\/notifications\/schedules$/.test(u)) {
      return { ok: true, status: 200, json: async () => ({ schedules: [{ id: "sch-1", type: "提醒", cron: "0 9 * * *" }] }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };   // profile / prefs / integrations 一律空
  };
}

/** 登录态（见文件头坑①：必须在脚本执行前注入，且用明文避开异步解密时序） */
function loginStorage() {
  return {
    wb_access_token: "test-access-token",
    wb_token_expiry: String(Date.now() + 3600 * 1000),
  };
}

/** 渲染面板并**等它真的渲染完**：`_loadApiPanels()` 内部对 _loadDeviceList/_loadSchedules
 *  是 **fire-and-forget（不 await）**，所以 await 它返回时行可能还没进 DOM —— 不补这一等，
 *  用例会拿到 null 而退化成空转。 */
async function loadPanels() {
  await win._loadApiPanels();
  await new Promise((r) => setTimeout(r, 200));
}

beforeEach(async () => {
  win = loadApp({ storage: loginStorage() });
  await new Promise((r) => setTimeout(r, 60));   // 等启动异步链，同 tests/crypto.test.js 的 boot() 口径
  installProbes();
});

afterEach(() => {
  try { win && win.close && win.close(); } catch (_) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① 登出设备失败 → 用户必须看得见（此前完全静默）", () => {
  it("删除 reject → 弹出 toast 且为 warn 级", async () => {
    mockFetch({ failDelete: true });
    await loadPanels();
    const btn = win.document.querySelector(".api-device-row .api-btn.danger");
    expect(btn, "设备行应渲染出登出按钮（否则本用例是空转）").toBeTruthy();

    await btn.onclick();

    expect(toastCalls.length, "删除失败必须让用户看见 —— 此前 catch(e){} 是零反馈").toBeGreaterThan(0);
    expect(toastCalls[0].type).toBe("warn");
    expect(toastCalls[0].msg).toContain("删除失败");
  });

  it("删除 reject → 诊断收到 error 且能归因到具体调用点", async () => {
    mockFetch({ failDelete: true });
    await loadPanels();
    const btn = win.document.querySelector(".api-device-row .api-btn.danger");
    await btn.onclick();

    expect(diagCalls.length, "失败必须进诊断日志，否则线上无从排查").toBeGreaterThan(0);
    const d = diagCalls[0];
    expect(d.level).toBe("error");
    expect(String(d.msg)).toMatch(/network error/);          // 带上原始错误信息
    expect(d.ctx && d.ctx.where).toBe("apiDeleteDevice");   // 能归因
  });

  it("失败后**仍然**刷新列表（本片只补反馈、不改控制流 —— 防修复过头）", async () => {
    mockFetch({ failDelete: true });
    await loadPanels();
    const btn = win.document.querySelector(".api-device-row .api-btn.danger");
    let reloads = 0;
    const origFetch = win.fetch;
    win.fetch = async function (u, o) {
      if (/\/api\/auth\/devices$/.test(String(u))) reloads++;
      return origFetch(u, o);
    };
    await btn.onclick();
    expect(reloads, "修复只补反馈，不改变「失败也刷新」的原控制流").toBeGreaterThan(0);
  });
});

describe("② 登出设备成功 → 行为与修复前一致（防把修复做成另一种错误）", () => {
  it("删除 resolve → 不弹失败 toast、不上报 error 诊断", async () => {
    mockFetch({ failDelete: false });
    await loadPanels();
    const btn = win.document.querySelector(".api-device-row .api-btn.danger");
    await btn.onclick();

    const failToasts = toastCalls.filter((c) => String(c.msg).includes("删除失败"));
    expect(failToasts.length, "成功时不该弹「删除失败」").toBe(0);
    expect(diagCalls.length, "成功时不该上报 error 诊断").toBe(0);
  });
});

describe("③ 删除提醒（apiDeleteSchedule）同为标准", () => {
  it("删除 reject → 同样弹 toast + 归因到 apiDeleteSchedule", async () => {
    mockFetch({ failDelete: true });
    await loadPanels();
    const btn = win.document.querySelector(".api-schedule-row .api-btn.danger");
    expect(btn, "提醒行应渲染出删除按钮").toBeTruthy();
    await btn.onclick();

    expect(toastCalls.length).toBeGreaterThan(0);
    expect(toastCalls[0].msg).toContain("删除失败");
    expect(diagCalls.some((d) => d.ctx && d.ctx.where === "apiDeleteSchedule")).toBe(true);
  });
});

describe("④ 契约守卫：危险删除类的空 catch 不得复辟（静态扫描 + 变异自证）", () => {
  const SRC = path.resolve(process.cwd(), "src", "ui-ge-api.js");

  it("ui-ge-api.js 里 apiDelete* 的 catch 必须带 toast 或 pushDiag（不是裸 catch）", () => {
    const raw = fs.readFileSync(SRC, "utf8");
    /* 抓 `await apiDeleteXxx(...)` 之后紧跟的 catch 块（括号计数，不假设单行形态） */
    const re = /await\s+(apiDelete\w+)\s*\([^)]*\)\s*;?\s*\}\s*catch\s*\(\s*\w*\s*\)\s*\{/g;
    let m, checked = 0;
    while ((m = re.exec(raw)) !== null) {
      const open = m.index + m[0].length - 1;
      let depth = 0, end = -1;
      for (let i = open; i < raw.length; i++) {
        if (raw[i] === "{") depth++;
        else if (raw[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) continue;
      const body = raw.slice(open + 1, end);
      checked++;
      expect(/toast\s*\(|pushDiag\s*\(/.test(body),
        `${m[1]} 的 catch 必须有反馈（toast/pushDiag）—— 裸 catch 会让用户以为删成功了`).toBe(true);
    }
    expect(checked, "至少应检到 apiDeleteDevice / apiDeleteSchedule 两处（否则守卫是空转）").toBeGreaterThanOrEqual(2);
  });

  it("变异自证：把 catch 体改成裸的，守卫必须检不出反馈（证明断言非装饰）", () => {
    const raw = fs.readFileSync(SRC, "utf8");
    const mutated = raw.replace(/try\{ await apiDeleteDevice\(d\.id\); \}\s*catch\(e\)\{[\s\S]*?\n\s*\}/,
      "try{ await apiDeleteDevice(d.id); }catch(e){}");
    expect(mutated, "变异应真的改到东西（否则自证是空转）").not.toBe(raw);
    const m = /await\s+(apiDelete\w+)\s*\([^)]*\)\s*;?\s*\}\s*catch\s*\(\s*\w*\s*\)\s*\{/g.exec(mutated);
    expect(m, "变异后仍能定位到 catch").toBeTruthy();
    const open = m.index + m[0].length - 1;
    let depth = 0, end = -1;
    for (let i = open; i < mutated.length; i++) {
      if (mutated[i] === "{") depth++;
      else if (mutated[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = mutated.slice(open + 1, end);
    expect(/toast\s*\(|pushDiag\s*\(/.test(body), "变异后应检不出反馈 → 说明守卫真的会拦").toBe(false);
  });
});
