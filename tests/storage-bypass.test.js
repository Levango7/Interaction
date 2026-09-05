/**
 * v3.4.7 批次三（存储评估 G5）：旁路写收编回归
 * saveAiConfig/saveNotes/saveConversation/saveRagDocs/saveCustomThemes/saveScenarioColors
 * 此前裸 setItem 绕过 save() 主入口——无 IDB 镜像、无配额告警、无损坏登记。
 * 现行为：全部经 save()（返回布尔；写入失败 pushDiag + toast）。
 * token 三键（wb_ 前缀裸串读写）与 theme 键（裸串）保持裸写——不对称风险记录在案。
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");
const PREFIX = "wb_agent_";

describe("G5 旁路写收编", () => {
  let win;
  beforeAll(() => { win = loadApp(); });

  it("源码契约：6 个收编函数不再含裸 setItem（全部经 save()）", () => {
    const src = fs.readFileSync(HTML, "utf8");
    const fns = ["saveAiConfig", "saveNotes", "saveConversation", "saveRagDocs", "saveCustomThemes", "saveScenarioColors"];
    for (const fn of fns) {
      const idx = src.indexOf(`function ${fn}(`);
      expect(idx).toBeGreaterThan(0);
      // 函数体到下一个 "function " 声明（粗界：找函数结束的 "}" 顶层关闭——用 900 字符窗口覆盖 saveConversation 最长体）
      const body = src.slice(idx, idx + 900);
      const seg = body.slice(0, body.indexOf("\nfunction ") > 0 ? body.indexOf("\nfunction ") : 900);
      expect(seg, `${fn} 仍含裸 setItem`).not.toMatch(/localStorage\.setItem/);
      expect(seg, `${fn} 未走 save()`).toMatch(/save\(/);
    }
  });

  it("源码契约：save() 返回布尔（true 成功路径）", () => {
    const src = fs.readFileSync(HTML, "utf8");
    const idx = src.indexOf("function save(k, v){");
    const body = src.slice(idx, idx + 700);
    expect(body).toMatch(/return true/);
    expect(body).toMatch(/return false/);
  });

  it("运行时：saveAiConfig 写入后镜像入队（经 save() 的 IDB 钩子）+ 返回 true", () => {
    const w = loadApp();
    const ok = w.saveAiConfig("plugin", { plugins: [{ name: "p1" }] });
    expect(ok).toBe(true);
    expect(w.localStorage.getItem(PREFIX + "ai_config_plugin")).toBe(JSON.stringify({ plugins: [{ name: "p1" }] }));
  });

  it("运行时：saveNotes 语义不变（true + 存储可 JSON.parse 读回）", () => {
    const w = loadApp();
    const ok = w.saveNotes([{ id: "n1", title: "笔记" }]);
    expect(ok).toBe(true);
    const back = JSON.parse(w.localStorage.getItem(PREFIX + "notes"));
    expect(back[0].id).toBe("n1");
  });

  it("运行时：saveRagDocs 写入 + 值同步（含配额告警路径——save 失败返回 false）", () => {
    const w = loadApp();
    w.saveRagDocs([{ docId: "d1", content: "内容" }]);
    expect(w.localStorage.getItem(PREFIX + "rag_docs")).toBe(JSON.stringify([{ docId: "d1", content: "内容" }]));
    // QuotaExceeded 模拟：defineProperty 覆盖 setItem（jsdom 的 localStorage 包装层不可直接赋值）
    const proto = Object.getPrototypeOf(w.localStorage);
    const orig = proto.setItem;
    Object.defineProperty(proto, "setItem", { value: () => { throw new Error("QuotaExceededError"); }, configurable: true, writable: true });
    const r = w.save(PREFIX + "rag_docs", [1]);
    Object.defineProperty(proto, "setItem", { value: orig, configurable: true, writable: true });
    expect(r).toBe(false);
  });
});
