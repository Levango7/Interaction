/**
 * P0 回归冒烟验证 · 发货前门禁
 * ----------------------------------------------------------------------------
 * 验证对象：P0-2 软删除（AI 误删可恢复）、P0-1 多轮工具对话崩溃修复（B1 tool_call_id
 * 不变量）、P0-3 Key 不外泄（Electron 主进程代理 + AES-256-GCM）。
 *
 * 设计原则（遵循 test-discipline / anti-gaming）：
 *  - 黑盒优先：断言「可观测行为」而不是私有实现。
 *  - 不修改任何应用代码（agent-workbench.html / electron/*.js）。
 *  - 通过 jsdom 全局访问顶层函数；需要 mock 的 chatOnce 直接覆盖 window.chatOnce。
 *
 * 说明：agent-workbench.html 顶层 function 声明在 classic <script> 下挂到 window，
 * 可直接访问；但 `pendingConfirm` 是 `let`（词法绑定），不暴露为 window 属性，
 * 因此「危险操作被拦截 / 确认闭环」改以「聊天历史副作用 + 任务状态」佐证，不依赖读取该变量。
 *
 * 运行：npx vitest run tests/p0-regression.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, ".."); // tests/ -> 仓库根(workspace)
const HTML_PATH = path.join(REPO, "agent-workbench.html");
const MAIN_PATH = path.join(REPO, "electron", "main.js");
const PRELOAD_PATH = path.join(REPO, "electron", "preload.js");

/** 取全新 window 并清空 storage，获得干净状态（active 仍为默认 "office"） */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** 播种一条任务，补全 execTool 期望的完整字段 */
function seedTask(win, id, title, sc = "office") {
  win.__test.setTasks([
    {
      id,
      sc,
      title,
      due: "",
      priority: "",
      status: "todo",
      doneAt: null,
      note: "",
      tags: [],
      created: Date.now(),
    },
  ]);
}

/* =========================================================================
 * P0-2 软删除（AI 误删不可逆 → 可恢复）
 * 用例 A：软删除不丢数据
 * ========================================================================= */
describe("P0-2 软删除 · 用例 A：软删除不丢数据", () => {
  it("force 删除后：deletedAt 已置、列表长度不变、findTask 过滤已删、未删仍可命中", () => {
    const win = freshWin();
    win.__test.setTasks([
      { id: "a1", sc: "office", title: "任务A", due: "", priority: "", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
      { id: "b1", sc: "office", title: "买菜", due: "", priority: "", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
    ]);

    const before = win.__test.getTasks().length;
    expect(before).toBe(2);

    // 执行 force 软删除
    const res = JSON.parse(win.__test.execTool("delete_task", { task_id: "a1" }, true));
    expect(res.ok).toBe(true);
    expect(res.msg).toContain("回收站");

    // ① 列表长度不变（非硬删 splice）
    const after = win.__test.getTasks();
    expect(after.length).toBe(2);

    // ② 被删任务 deletedAt 已设置
    const deleted = after.find((t) => t.id === "a1");
    expect(deleted).toBeDefined();
    expect(deleted.deletedAt).toBeTruthy();

    // ③ findTask 对已删 id 返回 null（被 !deletedAt 过滤）
    expect(win.findTask("a1")).toBeNull();

    // ④ findTask 对未删任务仍可命中（按 id 与按标题）
    expect(win.findTask("b1")).not.toBeNull();
    expect(win.findTask("买菜")).not.toBeNull();
    expect(win.findTask("不存在")).toBeNull();
  });

  it("非 force 删除仅进入待确认，不修改任何任务（不变量：未确认不落地）", () => {
    const win = freshWin();
    seedTask(win, "x1", "仅确认一次");
    const res = JSON.parse(win.__test.execTool("delete_task", { task_id: "x1" }, false));
    expect(res.ok).toBe(false);
    expect(res.confirm).toBeTruthy();
    // 任务完全未被改动
    const t = win.__test.getTasks().find((x) => x.id === "x1");
    expect(t.deletedAt).toBeFalsy();
    expect(t.status).toBe("todo");
    expect(win.findTask("x1")).not.toBeNull();
  });
});

/* =========================================================================
 * P0-1 多轮工具对话崩溃修复
 * 用例 B：危险操作被拦截不直接执行
 * 用例 C：多轮 tool_call_id 不变量（核心 B1 回归）
 * 用例 D：确认流闭环（最终执行 + 待确认清除）
 * ========================================================================= */
describe("P0-1 多轮工具 · 用例 B：危险操作被拦截", () => {
  it("含 delete_task 的 tool_calls 被拦截，任务未删、聊天历史出现待确认提示、无异常", async () => {
    const win = freshWin();
    seedTask(win, "del1", "删除目标");

    // mock chatOnce：首轮返回 delete_task 工具调用
    const calls = [];
    win.chatOnce = async (messages) => {
      calls.push(messages.length);
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_del_1",
                  type: "function",
                  function: { name: "delete_task", arguments: JSON.stringify({ task_id: "del1" }) },
                },
              ],
            },
          },
        ],
      };
    };

    let threw = false;
    try {
      // 生产调用方（onChatSubmit）传入 getChat(active) 作为 hist；此处忠实复现
      await win.runChatLoop([{ role: "system", content: "" }], win.getChat("office"));
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(false);

    // 任务未被删除（危险分支未调用 execTool）
    expect(win.findTask("del1")).not.toBeNull();
    expect(win.__test.getTasks().find((t) => t.id === "del1").deletedAt).toBeFalsy();
    expect(win.__test.getTasks().length).toBe(1);

    // 聊天历史中出现「待确认」提示（危险分支的副作用），证明拦截生效
    const hist = win.getChat("office");
    const hasPending = hist.some((m) => typeof m.content === "string" && m.content.includes("（待确认）"));
    expect(hasPending).toBe(true);

    // 仅与模型交互一次（返回 tool_calls 后即拦截，未进入二次请求）
    expect(calls.length).toBe(1);
  });
});

describe("P0-1 多轮工具 · 用例 C：tool_call_id 不变量（B1 回归核心）", () => {
  it("第二轮请求必须携带 role:assistant(tool_calls) 与 role:tool(tool_call_id==首轮id)", async () => {
    const win = freshWin();
    seedTask(win, "t1", "列出任务");

    const captured = [];
    win.chatOnce = async (messages) => {
      // 快照，避免后续被原地修改影响断言
      captured.push(messages.map((m) => ({ ...m })));
      if (captured.length === 1) {
        // 首轮：非危险工具调用 list_tasks
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_list_1",
                    type: "function",
                    function: { name: "list_tasks", arguments: JSON.stringify({ scenario: "office" }) },
                  },
                ],
              },
            },
          ],
        };
      }
      // 次轮：普通文本
      return { choices: [{ message: { role: "assistant", content: "好的，已为您列出。" } }] };
    };

    await win.runChatLoop([{ role: "system", content: "" }], win.getChat("office"));

    // 必须发生两轮请求：一轮返回 tool_calls，一轮返回文本
    expect(captured.length).toBe(2);

    const second = captured[1];
    // 关键不变量 1：第二轮请求中保留 assistant(tool_calls) 完整结构
    const assistantMsg = second.find(
      (m) => m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.tool_calls[0].id).toBe("call_list_1");

    // 关键不变量 2：第二轮请求中存在 role:tool 且 tool_call_id 与首轮 id 完全一致
    const toolMsg = second.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg.tool_call_id).toBe("call_list_1");

    // 更强约束：tool.tool_call_id 必须精确等于 assistant.tool_calls[0].id（缺失即触发 400）
    expect(toolMsg.tool_call_id).toBe(assistantMsg.tool_calls[0].id);
  });
});

describe("P0-1 多轮工具 · 用例 D：确认流闭环", () => {
  it("拦截后用户发送「确认」→ 危险操作最终被执行（软删）且待确认被清除", async () => {
    const win = freshWin();
    seedTask(win, "cfm1", "确认删除目标");

    const captured = [];
    win.chatOnce = async (messages) => {
      captured.push(messages.length);
      if (captured.length === 1) {
        // 首轮：delete_task 工具调用 → 触发拦截
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_cfm_1",
                    type: "function",
                    function: { name: "delete_task", arguments: JSON.stringify({ task_id: "cfm1" }) },
                  },
                ],
              },
            },
          ],
        };
      }
      // 确认后第二轮：普通文本
      return { choices: [{ message: { role: "assistant", content: "已处理。" } }] };
    };

    // 第一步：触发拦截，设置内部待确认（传入真实 hist，与 onChatSubmit 一致）
    await win.runChatLoop([{ role: "system", content: "" }], win.getChat("office"));
    expect(win.findTask("cfm1")).not.toBeNull(); // 尚未删除

    // 第二步：用户发送「确认」触发 onChatSubmit 确认分支
    const fakeEvent = {
      preventDefault() {},
      target: { msg: { value: "确认" } },
    };
    let threw = false;
    try {
      await win.onChatSubmit(fakeEvent);
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(false);

    // 闭环证明：危险操作最终被执行（任务被软删）
    expect(win.findTask("cfm1")).toBeNull();
    const t = win.__test.getTasks().find((x) => x.id === "cfm1");
    expect(t).toBeDefined();
    expect(t.deletedAt).toBeTruthy();

    // 待确认已清除的佐证：确认后再发一条非确认消息，不应进入「取消操作」分支
    // （若待确认未清除，非确认文本会命中取消分支并追加「已取消操作」消息）
    const histBefore = win.getChat("office").length;
    const fakeEvent2 = { preventDefault() {}, target: { msg: { value: "随便说点别的" } } };
    await win.onChatSubmit(fakeEvent2);
    const histAfter = win.getChat("office");
    const cancelled = histAfter.slice(histBefore).some(
      (m) => typeof m.content === "string" && m.content.includes("已取消操作")
    );
    expect(cancelled).toBe(false);
  });
});

/* =========================================================================
 * P0-3 Key 不外泄 + AES-256-GCM 轮转
 * 用例 6：AES 轮转（逐字节复现 main.js 算法，验证往返 + 篡改检测）
 * 用例 7：契约静态校验
 * ========================================================================= */

// —— 逐字节复现 electron/main.js 的密钥派生 + AES-256-GCM 加解密（行 112-134）——
function aiConfigKey() {
  return createHash("sha256")
    .update("agent-workbench::ai::" + os.hostname() + "::" + (process.env.USERNAME || process.env.USER || ""))
    .digest();
}
const ENC_TEST_PATH = path.join(os.tmpdir(), "agent-workbench-ai-config.test.enc");
function aiConfigPathTmp() {
  return ENC_TEST_PATH;
}
function loadAiConfigRepro() {
  try {
    const p = aiConfigPathTmp();
    if (!fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    const d = createDecipheriv("aes-256-gcm", aiConfigKey(), buf.subarray(0, 12), { authTagLength: 16 });
    d.setAuthTag(buf.subarray(12, 28));
    const json = d.update(buf.subarray(28), "utf8", "utf8") + d.final("utf8");
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
function saveAiConfigRepro(cfg) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", aiConfigKey(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(cfg), "utf8"), c.final()]);
  const tag = c.getAuthTag();
  fs.writeFileSync(aiConfigPathTmp(), Buffer.concat([iv, tag, enc]));
}
// 低级封装：直接操作 [iv(12) | tag(16) | enc] 缓冲，便于注入篡改
function encryptRaw(obj) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", aiConfigKey(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}
function decryptRaw(buf) {
  const d = createDecipheriv("aes-256-gcm", aiConfigKey(), buf.subarray(0, 12), { authTagLength: 16 });
  d.setAuthTag(buf.subarray(12, 28));
  return d.update(buf.subarray(28), "utf8", "utf8") + d.final("utf8");
}

describe("P0-3 AES · 用例 6：AES-256-GCM 轮转", () => {
  afterEach(() => {
    if (fs.existsSync(ENC_TEST_PATH)) fs.unlinkSync(ENC_TEST_PATH);
  });

  it("saveAiConfig → loadAiConfig 往返一致（含敏感 key 字段）", () => {
    const cfg = { base: "https://api.openai.com/v1", model: "gpt-4o-mini", key: "sk-super-secret-123", enabled: true };
    saveAiConfigRepro(cfg);
    const got = loadAiConfigRepro();
    expect(got).not.toBeNull();
    expect(got.key).toBe("sk-super-secret-123");
    expect(got.base).toBe(cfg.base);
    expect(got.model).toBe(cfg.model);
    expect(got.enabled).toBe(true);
  });

  it("文件缺失时 loadAiConfig 返回 null（不抛异常）", () => {
    if (fs.existsSync(ENC_TEST_PATH)) fs.unlinkSync(ENC_TEST_PATH);
    expect(loadAiConfigRepro()).toBeNull();
  });

  it("篡改 IV → GCM 认证失败，解密抛错", () => {
    const buf = encryptRaw({ key: "secret" });
    const tampered = Buffer.from(buf);
    tampered[0] ^= 0xff; // 翻转 IV 首字节
    expect(() => decryptRaw(tampered)).toThrow();
  });

  it("篡改密文 → GCM 认证失败，解密抛错", () => {
    const buf = encryptRaw({ key: "secret" });
    const tampered = Buffer.from(buf);
    tampered[30] ^= 0xff; // 翻转密文区某字节
    expect(() => decryptRaw(tampered)).toThrow();
  });

  it("篡改认证标签 → GCM 认证失败，解密抛错", () => {
    const buf = encryptRaw({ key: "secret" });
    const tampered = Buffer.from(buf);
    tampered[12] ^= 0xff; // 翻转 tag 首字节
    expect(() => decryptRaw(tampered)).toThrow();
  });

  it("低级往返（不落盘）明文 → 密文 → 明文 一致", () => {
    const plain = JSON.stringify({ hello: "world", n: 42 });
    const rt = decryptRaw(encryptRaw(JSON.parse(plain)));
    expect(rt).toBe(plain);
  });
});

describe("P0-3 契约 · 用例 7：Key 不离开主进程（静态校验）", () => {
  let html, main, preload;
  beforeEach(() => {
    html = fs.readFileSync(HTML_PATH, "utf8");
    main = fs.readFileSync(MAIN_PATH, "utf8");
    preload = fs.readFileSync(PRELOAD_PATH, "utf8");
  });

  it("前端：Electron 网关存在且先于浏览器直连兜底", () => {
    expect(html).toContain("window.electronAPI.chat(body)");
    expect(html).toContain("function isElectron(){");
    const gwIdx = html.indexOf("electronAPI.chat(body)");
    const fetchIdx = html.indexOf('base+"/chat/completions"');
    expect(gwIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(gwIdx).toBeLessThan(fetchIdx); // 主进程代理优先于渲染进程直连
  });

  it("preload：chat 仅透传 body(arg)，不含 key 字段", () => {
    const m = preload.match(/chat:\s*\(arg\)\s*=>\s*[^;]*/);
    expect(m).not.toBeNull();
    const chatLine = m[0];
    expect(chatLine).toMatch(/ipcRenderer\.invoke\("chat",\s*arg\)/);
    expect(chatLine).not.toMatch(/key/); // chat 请求体不携带 apiKey
  });

  it("main：Key 仅来自 loadAiConfig()，chat 入参不读 arg.key", () => {
    expect(main).toMatch(/const cfg = loadAiConfig\(\);/);
    expect(main).not.toMatch(/arg\.key/); // 绝不接收渲染进程传入的 key
    // 请求体由 arg 构造，Authorization 仅用主进程 cfg.key
    expect(main).toMatch(/messages:\s*\(arg && Array\.isArray\(arg\.messages\)\) \? arg\.messages : \[\]/);
    expect(main).toMatch(/"Authorization":\s*"Bearer "\s*\+\s*cfg\.key/);
  });

  it("main：fetch 带 AbortController 30s 超时", () => {
    expect(main).toMatch(/new AbortController\(\)/);
    expect(main).toMatch(/30000/);
  });

  it("main：AES-256-GCM 结构与算法与复现一致", () => {
    expect(main).toMatch(/aes-256-gcm/);
    expect(main).toMatch(/buf\.subarray\(0,12\)/);
    expect(main).toMatch(/buf\.subarray\(12,28\)/);
    expect(main).toMatch(/authTagLength:\s*16/);
    expect(main).toMatch(/crypto\.randomBytes\(12\)/);
  });
});
