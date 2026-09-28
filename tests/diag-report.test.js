/**
 * diag-report.test.js —— 诊断与反馈面板（设置 → 关于）· 回归验证（v3.7.64 新增）
 * ----------------------------------------------------------------------------
 * 背景：诊断缓冲（_diagLog / pushDiag / getDiag）全仓 50+ 处上报、入队即 _scrub 脱敏，
 * 但此前消费者只有 tests/ —— 用户遇到异常时没有把现场交出来的通道。
 * 本文件守八件事：
 *   ① 报告内容：版本 / BUILD_TAG / 环境行 / 存储行 + 诊断条目齐全；
 *   ② 脱敏与隐私边界：疑似凭据 [REDACTED]；报告不得包含存储里的任务正文（黑盒断言）；
 *   ③ 复制路径：clipboard 可用 → writeText(报告)；不可用 → 回退文本框可见且含报告；
 *   ④ 面板列表：toggle 展开后渲染条目（新→旧）；无记录渲染空态；
 *   ⑤ 反馈出口（v3.7.65）：提交 Issue = 复制完整报告 + 打开预填链接，且**零网络请求**；
 *   ⑥ URL 预算：诊断爆量时编码后总长 ≤ 7000（GitHub 对超长链接返回 414），正文注明截断；
 *   ⑦ maxEntries 语义：只截列表，缺省调用保持 v3.7.64 全量行为；
 *   ⑧ 形态标签：ASCII 白名单值，Issue 标题不随界面语言变化。
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

  it("⑤-1 提交 Issue：写入完整报告 + 打开预填链接，全程零网络请求", async () => {
    const T = win.__test;
    T.pushDiag("error", "issue-flow-abc");
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(win.navigator, "clipboard", { value: { writeText }, configurable: true });
    const open = vi.fn(() => ({ focus() {} }));
    win.open = open;
    /* 隐私守卫：出口只允许「打开浏览器」，应用自身不得发 fetch/XHR */
    const fetchSpy = vi.fn(() => { throw new Error("应用不应发起网络请求"); });
    win.fetch = fetchSpy;
    win.XMLHttpRequest = function() { throw new Error("应用不应使用 XHR"); };
    const btn = win.document.getElementById("btnOpenIssue");
    expect(btn, "#btnOpenIssue 应存在于关于卡").toBeTruthy();
    btn.click();
    await new Promise((r) => win.setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("issue-flow-abc");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1]).toBe("_blank");
    expect(open.mock.calls[0][2]).toBe("noopener");
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith("https://github.com/Levango7/Interaction/issues/new?")).toBe(true);
    expect(decodeURIComponent(url)).toContain("issue-flow-abc");
    expect(url.length).toBeLessThanOrEqual(7000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("⑤-2 clipboard 不可用：仍打开反馈页，copied 如实为 false", () => {
    const T = win.__test;
    Object.defineProperty(win.navigator, "clipboard", { value: undefined, configurable: true });
    T.pushDiag("warn", "nocopy-case");
    const open = vi.fn(() => null);
    win.open = open;
    const res = T.openDiagIssue();
    expect(open).toHaveBeenCalledTimes(1);
    expect(res.opened).toBe(true);
    expect(res.copied).toBe(false);
  });

  it("⑥-1 诊断爆量：URL 不超预算，正文注明截断", () => {
    const T = win.__test;
    for (let i = 0; i < 120; i++) T.pushDiag("error", "long-entry-" + i + "-" + "x".repeat(200));
    const url = T._diagIssueUrl();
    expect(url.length).toBeLessThanOrEqual(7000);
    const body = decodeURIComponent(url.slice(url.indexOf("&body=") + 6));
    expect(body).toContain("仅列最近");
    expect(body).toContain("复制诊断报告");
  });

  it("⑥-2 单条超长日志：收缩或兜底，URL 仍不超预算", () => {
    const T = win.__test;
    T.pushDiag("error", "huge-" + "y".repeat(40000));
    const url = T._diagIssueUrl();
    expect(url.length).toBeLessThanOrEqual(7000);
    const body = decodeURIComponent(url.slice(url.indexOf("&body=") + 6));
    expect(body).toMatch(/截断版|诊断报告过长/);
  });

  it("⑥-3 Electron 形态用更紧的预算（外链走 shell.openExternal，长 URL 未实测）", () => {
    const T = win.__test;
    for (let i = 0; i < 60; i++) T.pushDiag("error", "electron-entry-" + i + "-" + "z".repeat(120));
    win.isElectron = () => true; // 全局函数声明可覆写：_diagEnvTag 与预算分支都读它
    expect(T._diagEnvTag()).toBe("electron");
    expect(T._diagIssueUrl().length).toBeLessThanOrEqual(2000);
  });

  it("⑦ maxEntries 只截列表；缺省调用保持 v3.7.64 的全量行为", () => {
    const T = win.__test;
    T.pushDiag("info", "entry-oldest");
    T.pushDiag("info", "entry-middle");
    T.pushDiag("info", "entry-newest");
    const full = T.buildDiagReport();
    expect(full).toContain("entry-oldest");
    expect(full).toContain("entry-newest");
    expect(full).not.toContain("仅列最近");
    const one = T.buildDiagReport({ maxEntries: 1 });
    expect(one).toContain("entry-newest");
    expect(one).not.toContain("entry-oldest");
    expect(one).toContain("仅列最近 1 条，共 3 条");
    expect(one).toMatch(/诊断条数: 3/);
  });

  it("⑧ Issue 标题用 ASCII 形态标签，不随界面语言变化", () => {
    const T = win.__test;
    expect(["electron", "pwa", "file", "local", "web", "unknown"]).toContain(T._diagEnvTag());
    const url = T._diagIssueUrl();
    const head = decodeURIComponent(url.slice(0, url.indexOf("&body=")));
    expect(head).toMatch(/\?title=\[v[\d.]+ · (electron|pwa|file|local|web|unknown)\] $/);
  });
});
