/**
 * v3.4.7 批次六：RAG 上下文注入回归
 * 设计：激活闲置 RAG 索引资产——发送消息前 ragInjectContext 检索相关文档拼进
 * system prompt。开关 cfg.rag 显式开启才注入（设置页 AI→记忆「上下文注入」），
 * 默认关（防 token 意外膨胀）；检索失败/无索引降级空串不阻塞主链路。
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");
const PREFIX = "wb_agent_";

describe("RAG 上下文注入", () => {
  let win;
  beforeAll(() => {
    win = loadApp();
  });

  it("源码契约：注入点在 onChatSubmit 的 system prompt 拼接处 + 显式开启语义", () => {
    const src = fs.readFileSync(HTML, "utf8");
    // chatSysPrompt 后拼 ragCtx
    expect(src).toMatch(/chatSysPrompt\(text\) \+ ragCtx/);
    expect(src).toMatch(/await ragInjectContext\(text\)\.catch/);
    // 显式开启（此前 ===false 在无 UI 写入下等效永远开——已修为显式 true 才注入）
    expect(src).toMatch(/cfg\.rag !== true\) return ""/);
    // 设置开关 + 保存/回填
    expect(src).toMatch(/id="aiMemRag"/);
    expect(src).toMatch(/rag: rg \? rg\.checked : false/);
    expect(src).toMatch(/rg\.checked = !!saved\.rag/);
    // 保存同步写 cfg.rag
    expect(src).toMatch(/cfg\.rag = rg \? !!rg\.checked : false/);
  });

  it("运行时：开关关（默认）→ ragInjectContext 返回空串", async () => {
    const w = loadApp();
    // 预置索引文档（有数据也不注入——开关优先）
    w.localStorage.setItem(PREFIX + "rag_docs", JSON.stringify([{ docId: "d1", source: "task", content: "写周报", ts: Date.now() }]));
    const r = await w.ragInjectContext("周报");
    expect(r).toBe("");
  });

  it("运行时：开关开 + 有索引 → 返回上下文段（含【相关上下文】头）", async () => {
    const w = loadApp();
    w.localStorage.setItem(PREFIX + "rag_docs", JSON.stringify([{ docId: "d1", source: "task", content: "写周报任务总结", ts: Date.now() }]));
    w.__test._resetCrypto();
    w.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ enabled: true, rag: true, profiles: [{ id: "p1", name: "T", base: "https://api.test.com/v1", key: "sk", model: "m" }], activeId: "p1" }));
    const r = await w.ragInjectContext("周报");
    expect(r).toContain("【相关上下文】");
    expect(r).toContain("写周报");
  });

  it("运行时：无索引文档时开关开也不注入（安全降级）", async () => {
    const w = loadApp();
    w.__test._resetCrypto();
    w.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ enabled: true, rag: true, profiles: [{ id: "p1", name: "T", base: "https://api.test.com/v1", key: "sk", model: "m" }], activeId: "p1" }));
    // 不写 rag_docs（空索引）
    const r = await w.ragInjectContext("随便什么问题");
    // ragSearch 走关键词降级——无文档命中即空
    expect(r).toBe("");
  });
});
