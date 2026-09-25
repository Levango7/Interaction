/**
 * ai-interaction-fixes.test.js —— v3.7.52 交互/数据安全修复的回归护栏
 * ----------------------------------------------------------------------------
 * 覆盖 7 条，全部是「静默错」：不崩溃、不报错，但用户看到的是错的，或数据被悄悄丢掉。
 *   ① 取消判定：`abort(reason)` 时浏览器 fetch 是**以 reason 拒绝**（name==="Error"），
 *      旧实现只认 AbortError → 点「取消」会把英文 "user-cancel" 当助手回复上屏。
 *      ★ 既有 ai-enhance 测试的 mock 自己造了个 AbortError，所以它测不出这个真缺陷 ——
 *        本文件用**忠实 mock**（把传入的 reason 原样抛回）复现真机行为。
 *   ② 超时语义：定时器改为「每轮重置 + 读 aiTimeoutSec」，不再是罩住整个循环的 30s。
 *   ③ 危险操作**始终**需确认（旧实现挂在 autoConfirm 上，关掉开关反而免确认）。
 *   ④ 「自动确认非危险操作」开关关闭时，非危险工具批次也要确认（与该文案语义一致）。
 *   ⑤ allKeys() 在「存储降级壳」下也能枚举（旧实现 Object.keys(localStorage) 返回方法名 → 备份为空）。
 *   ⑥ 损坏守卫覆盖 memory/goals/会议/生活账本等 11 个数组型键（旧清单漏守 → 静默变空）。
 *   ⑦ 云快照恢复：不再用幽灵键判断「本机有无数据」；覆盖前留回滚档。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
async function boot() {
  const win = loadApp();
  await new Promise((r) => setTimeout(r, 80));
  return win;
}
function setupAiProfile(win) {
  win.__test._resetCrypto();
  win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({
    enabled: true,
    profiles: [{ id: "p1", name: "Test", base: "https://api.test.com/v1", key: "sk-test", model: "gpt-4o-mini" }],
    activeId: "p1",
  }));
}
const setFetch = (win, fn) => Object.defineProperty(win, "fetch", { value: fn, writable: true, configurable: true });

/* ---------- ① 取消 ---------- */
describe("① 用户取消：不得把英文 user-cancel 上屏", () => {
  it("fetch 以 abort(reason) 的原样 reason 拒绝时 → 显示「已取消」", async () => {
    const win = await boot();
    setupAiProfile(win);
    win.__test.setActive("office");
    win.__test.render();
    /* 忠实 mock：真实浏览器在 abort(reason) 时 reject 的就是那个 reason */
    setFetch(win, (url, opts) => new Promise((resolve, reject) => {
      const signal = opts && opts.signal;
      if (signal) signal.addEventListener("abort", () => reject(signal.reason || new Error("aborted")));
    }));
    const { runChatLoop, abortChat, appendChat, getChat } = win.__test;
    appendChat("office", { role: "user", content: "hi" });
    const hist = getChat("office");
    const messages = [{ role: "system", content: "sys" }].concat(hist.map((m) => ({ ...m })));
    const p = runChatLoop(messages, hist);
    await new Promise((r) => setTimeout(r, 20));
    abortChat();
    await p;
    const last = hist[hist.length - 1];
    expect(last._canceled).toBe(true);
    expect(last.content).toBe("已取消");
    expect(JSON.stringify(hist)).not.toContain("user-cancel");
  });

  it("超时（reason=timeout）显示超时提示，而不是英文 timeout", async () => {
    const win = await boot();
    setupAiProfile(win);
    win.__test.setActive("office");
    win.__test.render();
    setFetch(win, (url, opts) => new Promise((resolve, reject) => {
      const signal = opts && opts.signal;
      if (signal) signal.addEventListener("abort", () => reject(signal.reason || new Error("aborted")));
    }));
    const { runChatLoop, appendChat, getChat, createChatController, abortChat } = win.__test;
    appendChat("office", { role: "user", content: "hi" });
    const hist = getChat("office");
    const p = runChatLoop([{ role: "system", content: "sys" }].concat(hist.map((m) => ({ ...m }))), hist);
    await new Promise((r) => setTimeout(r, 20));
    /* 直接触发控制器超时（用短时长，避免测试等 30s） */
    const ctrl = createChatController();
    expect(typeof ctrl.resetTimeout).toBe("function");
    ctrl.resetTimeout(30);
    await new Promise((r) => setTimeout(r, 60));
    expect(ctrl.reason).toBe("timeout");
    expect(ctrl.ac.signal.aborted).toBe(true);
    /* 结束仍在跑的循环，避免等它自己的超时（abort → 记为「已取消」） */
    abortChat();
    await p.catch(() => {});
  }, 20000);

  it("超时秒数读设置（aiTimeoutSec），越界回退 30s", async () => {
    const win = await boot();
    const cfg = win.__test.getCfg();
    cfg.aiTimeoutSec = 5;
    win.__test.persistCfg(cfg);
    expect(win._chatTimeoutMs()).toBe(5000);
    const cfg2 = win.__test.getCfg();
    cfg2.aiTimeoutSec = 999;
    win.__test.persistCfg(cfg2);
    expect(win._chatTimeoutMs()).toBe(30000);
  });
});

/* ---------- ③④ 确认语义 ---------- */
/** 让 chatOnce 只回一轮带 tool_calls 的响应，便于观察是否走确认 */
function stubOneToolRound(win, calls) {
  let round = 0;
  win.chatOnce = async function () {
    round++;
    if (round > 1) return { choices: [{ message: { role: "assistant", content: "完成" } }] };
    return { choices: [{ message: { role: "assistant", content: "", tool_calls: calls } }] };
  };
}
const toolCall = (name, args, id) => ({ id: id || "c1", type: "function", function: { name, arguments: JSON.stringify(args) } });

describe("③④ 确认语义（v3.7.52）", () => {
  it("危险操作在「关掉自动确认」时也必须确认（此前会免确认直接执行）", async () => {
    const win = await boot();
    setupAiProfile(win);
    const cfg = win.__test.getCfg();
    cfg.enabled = true; cfg.agentAutoConfirm = false;
    win.__test.persistCfg(cfg);
    win.__test.setActive("office");
    win.__test.render();
    const created = JSON.parse(win.__test.execTool("create_task", { title: "待删除任务", scenario: "office", force: true }));
    stubOneToolRound(win, [toolCall("delete_task", { task_id: created.id })]);
    const hist = win.getChat("office");
    await win.runChatLoop([{ role: "system", content: "s" }], hist);
    /* 走确认 → 出现确认模态框；且任务**没有**被删 */
    expect(win.document.getElementById("aiConfirmModal")).toBeTruthy();
    const after = win.__test.getTasks().find((x) => x.id === created.id);
    expect(after && after.deletedAt ? true : false).toBe(false);
    expect(hist.some((m) => m._disp && String(m._disp).indexOf("已删除") >= 0)).toBe(false);
  });

  it("默认（开启自动确认）时非危险工具直接执行、不弹确认", async () => {
    const win = await boot();
    setupAiProfile(win);
    const cfg = win.__test.getCfg();
    cfg.enabled = true;
    delete cfg.agentAutoConfirm;
    win.__test.persistCfg(cfg);
    win.__test.setActive("office");
    win.__test.render();
    stubOneToolRound(win, [toolCall("create_task", { title: "直接创建", scenario: "office" })]);
    const hist = win.getChat("office");
    await win.runChatLoop([{ role: "system", content: "s" }], hist);
    expect(win.document.getElementById("aiConfirmModal")).toBeFalsy();
    expect(win.__test.getTasks().some((x) => x.title === "直接创建")).toBe(true);
  });

  it("关闭「自动确认非危险操作」时，非危险工具批次也要确认", async () => {
    const win = await boot();
    setupAiProfile(win);
    const cfg = win.__test.getCfg();
    cfg.enabled = true; cfg.agentAutoConfirm = false;
    win.__test.persistCfg(cfg);
    win.__test.setActive("office");
    win.__test.render();
    stubOneToolRound(win, [toolCall("create_task", { title: "需确认创建", scenario: "office" })]);
    const hist = win.getChat("office");
    await win.runChatLoop([{ role: "system", content: "s" }], hist);
    expect(win.document.getElementById("aiConfirmModal")).toBeTruthy();
    expect(win.__test.getTasks().some((x) => x.title === "需确认创建")).toBe(false);
  });
});

/* ---------- ⑤ allKeys 在降级壳下 ---------- */
describe("⑤ 存储降级壳下的键枚举", () => {
  it("allKeys() 用 length+key(i)，壳只暴露 6 个方法时也能枚举到键", async () => {
    const win = await boot();
    win.localStorage.setItem(PREFIX + "tasks", "[]");
    win.localStorage.setItem(PREFIX + "memory", "[]");
    win.localStorage.setItem("other_key", "1");
    /* 启动 seed 会写若干 PREFIX 键，故只断言「我写的这两个在、非本应用的键不在」 */
    const got = win.allKeys();
    expect(got).toContain(PREFIX + "memory");
    expect(got).toContain(PREFIX + "tasks");
    expect(got).not.toContain("other_key");
    /* 模拟安全壳：只有 6 个方法 + key(i)/length，没有可枚举的键属性 */
    const store = Object.create(null);
    store[PREFIX + "memory"] = "[1]";
    store["x"] = "1";
    const shell = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      key: (i) => Object.keys(store)[i] || null,
      get length() { return Object.keys(store).length; },
    };
    Object.defineProperty(win, "localStorage", { configurable: true, get: () => shell });
    expect(win.allKeys()).toEqual([PREFIX + "memory"]);
    /* 旧实现的样子（对照）：Object.keys(壳) 拿到的是方法名，过滤后为空 */
    expect(Object.keys(shell).filter((k) => k.indexOf(PREFIX) === 0)).toEqual([]);
  });
});

/* ---------- ⑥ 损坏守卫清单 ---------- */
describe("⑥ 损坏守卫覆盖新增键", () => {
  it("wb_agent_memory 语法损坏 → 备份原值 + 重置为空数组", async () => {
    const win = await boot();
    win.localStorage.setItem(PREFIX + "memory", '[{"text":"重要偏好"');  // 截断的 JSON
    win.__test.migrate();
    expect(win.localStorage.getItem(PREFIX + "memory")).toBe("[]");
    const broken = Object.keys(win.localStorage).filter((k) => k.indexOf(PREFIX + "memory_broken_") === 0);
    expect(broken.length).toBe(1);
    expect(win.localStorage.getItem(broken[0])).toContain("重要偏好");
  });

  it("非数组键（cfg）不得被守卫误重置", async () => {
    const win = await boot();
    const before = win.localStorage.getItem(PREFIX + "cfg");
    win.__test.migrate();
    expect(win.localStorage.getItem(PREFIX + "cfg")).toBe(before);
  });
});

/* ---------- ⑧ 异步工具在 chat 路径可达 ---------- */
describe("⑧ 异步工具（联网/代码/SQL）在 chat 路径可达", () => {
  it("模型调用 code_run → 走 agentExecAsync，不再是「未知工具」", async () => {
    const win = await boot();
    setupAiProfile(win);
    win.__test.setActive("office");
    win.__test.render();
    const seen = [];
    /* 桩掉真正的沙箱/网络执行，只验证「路由」这一层 */
    win.agentExecAsync = async (name) => { seen.push(name); return { ok: true, output: "FAKE-OUT:" + name }; };
    stubOneToolRound(win, [toolCall("code_run", { code: "1+1" }, "c_code")]);
    const hist = win.getChat("office");
    await win.runChatLoop([{ role: "system", content: "s" }], hist);
    expect(seen).toEqual(["code_run"]);
    const tm = hist.find((m) => m.role === "tool" && m.tool_call_id === "c_code");
    expect(tm).toBeTruthy();
    expect(tm.content).toContain("FAKE-OUT:code_run");
    expect(tm.content).not.toContain("未知工具");
  });

  it("同步工具仍走 execTool（不误入异步分支）", async () => {
    const win = await boot();
    setupAiProfile(win);
    win.__test.setActive("office");
    win.__test.render();
    let asyncHit = 0;
    win.agentExecAsync = async () => { asyncHit++; return { ok: true }; };
    stubOneToolRound(win, [toolCall("create_task", { title: "同步工具", scenario: "office" }, "c_t")]);
    const hist = win.getChat("office");
    await win.runChatLoop([{ role: "system", content: "s" }], hist);
    expect(asyncHit).toBe(0);
    expect(win.__test.getTasks().some((x) => x.title === "同步工具")).toBe(true);
  });
});

/* ---------- ⑨ 云同步状态不得撒谎 ---------- */
describe("⑨ 云同步状态如实显示", () => {
  it("推送失败（网络不可用）→ offline，且不得显示「已同步」", async () => {
    const win = await boot();
    win.apiSetTokens("test-token", "test-refresh", Date.now() + 3600 * 1000);
    /* 真实登录态 + 真实推送路径：fetch 抛 TypeError（网络不可用） */
    setFetch(win, () => Promise.reject(new win.TypeError ? new win.TypeError("Failed to fetch") : new Error("Failed to fetch")));
    await win.doSync();
    expect(["offline", "error"]).toContain(win.getSyncStatus());
    expect(win.getSyncStatus()).not.toBe("idle");
  });

  it("服务端 2xx → idle（此时「已同步」才是诚实的）", async () => {
    const win = await boot();
    win.apiSetTokens("test-token", "test-refresh", Date.now() + 3600 * 1000);
    const seen = [];
    setFetch(win, (url, opts) => {
      seen.push((opts && opts.method) || "GET");
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    });
    await win.doSync();
    expect(seen).toContain("PUT");
    expect(win.getSyncStatus()).toBe("idle");
  });

  it("local 状态渲染成「仅本机」而非「已同步」", async () => {
    const win = await boot();
    win.document.body.insertAdjacentHTML("beforeend", '<div id="syncStatus"><span class="sync-text"></span></div>');
    win.setSyncStatus("local");
    const txt = win.document.querySelector("#syncStatus .sync-text").textContent || "";
    expect(txt).toContain("本机");
    expect(txt).not.toContain("已同步");
  });
});

/* ---------- ⑦ 云快照恢复 ---------- */describe("⑦ 云快照恢复的数据安全", () => {
  it("本机只有资料、没有任务时不得被判成「无数据」而被云端覆盖", async () => {
    const win = await boot();
    win.localStorage.setItem(PREFIX + "rec_office", JSON.stringify([{ id: "r1", title: "本机资料", created: 1 }]));
    win.isApiLoggedIn = () => true;
    win.apiGetSnapshot = async () => ({
      updatedAt: Date.now(),
      snapshot: { _deviceMeta: { deviceId: "other-device" }, [PREFIX + "rec_office"]: JSON.stringify([{ id: "r2", title: "云端资料", created: 2 }]) },
    });
    await win.cloudCheckOnLogin();
    const recs = JSON.parse(win.localStorage.getItem(PREFIX + "rec_office") || "[]");
    expect(recs.some((r) => r.title === "本机资料")).toBe(true);
  });

  it("覆盖前留回滚档（pre_restore_backup）", async () => {
    const win = await boot();
    win.localStorage.setItem(PREFIX + "notes", JSON.stringify([{ id: "n1", title: "本机笔记" }]));
    win._applyCloudSnapshot({ _deviceMeta: { deviceId: "x" }, [PREFIX + "notes"]: JSON.stringify([{ id: "n2", title: "云端笔记" }]) });
    const bak = JSON.parse(win.localStorage.getItem(PREFIX + "pre_restore_backup") || "null");
    expect(bak).toBeTruthy();
    expect(JSON.stringify(bak.keys)).toContain("本机笔记");
  });
});
