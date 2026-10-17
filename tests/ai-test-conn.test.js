/**
 * ai-test-conn.test.js —— 「测试连接」的分层判定口径（v3.7.132）
 * ----------------------------------------------------------------------------
 * 为什么把它固定下来：`docs/user-manual.md` 的 5.1 判定表是**给用户看的契约** ——
 * 手册承诺"绿色=能用 / 黄色=只差模型名 / 红色=连接本身没通"。手册写了而实现漂了，
 * 比没有手册更糟：用户会按错误的前提去改配置（例如明明 Key 有问题却去改模型名）。
 *
 * 判定的三层（实现顺序，见 src/ui-global-events.js 的 #cfgTestConn）：
 *   0. 先查必填项，缺哪个报哪个（不发请求）
 *   1. `GET {base}/v1/models`  —— 只验到 base + Key
 *   2. 核对模型名在列表里
 *      2'. 不在 → 再 POST /chat/completions max_tokens:1（真落到模型）；通过即算成功
 *      2''. 仍失败 → 黄色「Base + Key 通过，但模型 X 不在列表」
 *   3. 第 1 步就失败 → 直接改用 chat 探测（服务端常无 /v1/models）
 *      3'. 2xx 但**没有列表** → 只能说 base+Key 通过，**模型名未校验**（v3.7.132 修的口径）
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
/** jsdom 的 .click() 同步派发、onclick 是 async —— await click() 不等内部 fetch/toast */
const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));

/** 与设置页同款：先落一份 active profile（key 走明文存储，测试环境无设备密钥） */
function withProfile(over) {
  const p = Object.assign({ id: "p1", name: "probe", base: "https://api.example.com/v1", key: "sk-test", model: "gpt-4o-mini" }, over || {});
  return loadApp({
    storage: {
      [PREFIX + "cfg"]: JSON.stringify({
        enabled: true, base: p.base, key: p.key, model: p.model,
        profiles: [p], activeId: "p1",
      }),
    },
  });
}

const modelsOk = (ids) => ({ ok: true, status: 200, json: async () => ({ data: ids.map((id) => ({ id })) }) });
const modelsNoList = () => ({ ok: true, status: 200, json: async () => ({}) });
const chatOk = (model) => ({ ok: true, status: 200, json: async () => ({ model, choices: [{ message: { content: "hi" } }] }) });
const bad = (status) => ({ ok: false, status, json: async () => ({}) });

/** 点一次「测试连接」，返回 {toasts:[{m,kind}], calls:[url]} */
async function runTestConn(win, fetchStub) {
  const calls = [];
  win.fetch = async (url) => { calls.push(String(url)); return fetchStub(String(url)); };
  const toasts = [];
  win.toast = (m, kind) => toasts.push({ m: String(m), kind });
  win.document.getElementById("cfgTestConn").click();
  await tick();
  return { toasts, calls };
}

const text = (r) => r.toasts.map((t) => t.m).join(" | ");

describe("测试连接 · 分层判定口径（手册 5.1 的判定表即本文件的断言）", () => {
  it("① 缺必填项：缺哪个报哪个，且**不发任何请求**", async () => {
    const win = withProfile({ base: "" });
    const r = await runTestConn(win, () => modelsOk(["gpt-4o-mini"]));
    expect(text(r)).toMatch(/未配置 Base URL/);
    expect(r.calls.length, "缺 Base 时不该盲发请求").toBe(0);
  });

  it("② models 列表里**有**该模型 → 绿色：三层都验过", async () => {
    const win = withProfile();
    const r = await runTestConn(win, () => modelsOk(["gpt-4o-mini", "gpt-4o"]));
    expect(r.calls[0]).toContain("/v1/models");
    expect(text(r)).toMatch(/模型 gpt-4o-mini 可访问/);
    expect(r.toasts[0].kind).toBe("ok");
  });

  it("③ 列表里没有该模型、但 chat 探测通过 → 绿色（不把能用的配置判死）", async () => {
    const win = withProfile();
    const r = await runTestConn(win, (u) => (u.includes("/v1/models") ? modelsOk(["other-model"]) : chatOk("gpt-4o-mini")));
    expect(r.calls.some((u) => u.includes("/chat/completions")), "必须降级真的打到模型").toBe(true);
    expect(text(r)).toMatch(/连接成功（模型响应/);
    expect(r.toasts[0].kind).toBe("ok");
  });

  it("④ 列表里没有该模型、chat 也失败 → 黄色：base+Key 通过，问题在模型名", async () => {
    const win = withProfile();
    const r = await runTestConn(win, (u) => (u.includes("/v1/models") ? modelsOk(["other-model"]) : bad(404)));
    expect(text(r)).toMatch(/不在 \/v1\/models 列表中/);
    expect(text(r)).toMatch(/404/);
    expect(r.toasts[0].kind, "这是黄色而非红色 —— 判决级别本身是契约的一部分").toBe("warn");
  });

  it("⑤ 服务端没有 /v1/models（404）→ 直接用 chat 探测，通过即算成功", async () => {
    const win = withProfile();
    const r = await runTestConn(win, (u) => (u.includes("/v1/models") ? bad(404) : chatOk("gpt-4o-mini")));
    expect(r.calls[0]).toContain("/v1/models");
    expect(r.calls[1]).toContain("/chat/completions");
    expect(text(r)).toMatch(/连接成功（模型响应/);
    expect(r.toasts[0].kind).toBe("ok");
  });

  it("⑥ 2xx 但**没给模型列表** → 只能说 base+Key 通过，明确标注「模型名未校验」", async () => {
    /* 这正是一处「口号比事实大」：原实现复用"模型 X 可访问"的文案，
       而模型名从未被核对过。口径改了，用例钉住它。 */
    const win = withProfile();
    const r = await runTestConn(win, () => modelsNoList());
    expect(text(r)).toMatch(/模型名未校验/);
    expect(text(r), "不能宣称模型可访问（从没核对过）").not.toMatch(/可访问/);
    expect(r.toasts[0].kind).toBe("ok");
  });

  it("⑦ 两条路都失败 → 红色：连接本身没通，且带 HTTP 状态码", async () => {
    const win = withProfile();
    const r = await runTestConn(win, () => bad(500));
    expect(text(r)).toMatch(/连接失败/);
    expect(text(r)).toMatch(/500/);
    expect(r.toasts[0].kind).toBe("error");
  });
});
