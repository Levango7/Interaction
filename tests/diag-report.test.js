/**
 * diag-report.test.js —— 诊断与反馈面板（设置 → 关于）· 回归验证（v3.7.64 新增）
 * ----------------------------------------------------------------------------
 * 背景：诊断缓冲（_diagLog / pushDiag / getDiag）全仓 50+ 处上报、入队即 _scrub 脱敏，
 * 但此前消费者只有 tests/ —— 用户遇到异常时没有把现场交出来的通道。
 * 本文件守四件事：
 *   ① 报告内容：版本 / BUILD_TAG / 环境行 / 存储行 + 诊断条目齐全；
 *   ② 脱敏与隐私边界：疑似凭据 [REDACTED]；报告不得包含存储里的任务正文（黑盒断言）；
 *   ③ 复制路径：clipboard 可用 → writeText(报告)；不可用 → 回退文本框可见且含报告；
 *   ④ 面板列表：toggle 展开后渲染条目（新→旧）；无记录渲染空态。
 *
 * 运行：npm test（源码态直跑 npx vitest 会全量假失败，见 tests/helpers/loadApp.js 守卫）
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("诊断与反馈面板（关于卡 · v3.7.64）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("① 报告含版本 / 运行环境 / 存储行，并包含已推送的诊断条目", () => {
    const T = win.__test;
    T.pushDiag("error", "boom-diag-test", { where: "unit" });
    const rep = T.buildDiagReport();
    expect(rep).toContain("诊断报告");
    expect(rep).toMatch(/应用版本: v[\d.]+ · b[\w]+/);
    expect(rep).toMatch(/运行形态: /);
    expect(rep).toMatch(/存储: \d+ 个键 · 约 [\d.]+ KB/);
    expect(rep).toContain("boom-diag-test");
    expect(rep).toContain("ctx: {\"where\":\"unit\"}");
  });

  it("② 疑似凭据入报告前已脱敏，且报告不含存储中的任务正文", () => {
    const T = win.__test;
    const token = "abcdefghijklmnopqrstuvwxyz0123456789"; // ≥24 位，触发 _scrub
    T.pushDiag("warn", "token=" + token);
    win.localStorage.setItem(T.PREFIX + "tasks", JSON.stringify([{ id: "t1", title: "SECRET_TITLE_XYZ" }]));
    const rep = T.buildDiagReport();
    expect(rep).not.toContain(token);
    expect(rep).toContain("[REDACTED]");
    expect(rep).not.toContain("SECRET_TITLE_XYZ");
    /* 存储行统计的是键数与体积，不是内容——正文一个字都不该进报告 */
    expect(rep).toMatch(/存储: 1 个键/);
  });

  it("③-1 clipboard 可用：点击复制按钮写入报告并提示成功", async () => {
    const T = win.__test;
    T.pushDiag("info", "copy-me-please");
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(win.navigator, "clipboard", { value: { writeText }, configurable: true });
    const btn = win.document.getElementById("btnCopyDiag");
    expect(btn, "#btnCopyDiag 应存在于关于卡").toBeTruthy();
    btn.click();
    await new Promise((r) => win.setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("copy-me-please");
  });

  it("③-2 clipboard 不可用：回退文本框自动展开并填入报告", () => {
    const T = win.__test;
    Object.defineProperty(win.navigator, "clipboard", { value: undefined, configurable: true });
    T.pushDiag("error", "fallback-case");
    const btn = win.document.getElementById("btnCopyDiag");
    const box = win.document.getElementById("diagFallback");
    expect(box.classList.contains("u-hidden")).toBe(true);
    btn.click();
    expect(box.classList.contains("u-hidden")).toBe(false);
    expect(box.value).toContain("fallback-case");
    expect(box.value).toContain("应用版本");
  });

  it("④-1 toggle 展开渲染诊断条目（新→旧）", () => {
    const T = win.__test;
    T.pushDiag("error", "older-entry");
    T.pushDiag("warn", "newer-entry");
    const det = win.document.getElementById("diagCollapse");
    det.open = true;
    det.dispatchEvent(new win.Event("toggle"));
    const list = win.document.getElementById("diagList");
    const text = list.textContent;
    expect(text).toContain("newer-entry");
    expect(text).toContain("older-entry");
    expect(text.indexOf("newer-entry")).toBeLessThan(text.indexOf("older-entry"));
  });

  it("④-2 无诊断记录时渲染空态（不出现条目行）", () => {
    const det = win.document.getElementById("diagCollapse");
    det.open = true;
    det.dispatchEvent(new win.Event("toggle"));
    const list = win.document.getElementById("diagList");
    expect(list.querySelectorAll("div").length).toBe(0);
    expect(list.textContent.length).toBeGreaterThan(0);
  });
});
