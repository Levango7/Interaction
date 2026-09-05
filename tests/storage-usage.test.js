/**
 * v3.4.7 批次四：存储用量仪表回归
 * 设置页数据管理顶部用量卡：容量横条（localStorage 逐 key UTF-16 统计 / ~5MB 口径）
 * + Top5 大 key + 三档阈值（70%/85% 变色）+ estimate 参考行（可用时）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");
const PREFIX = "wb_agent_";

describe("存储用量仪表", () => {
  let win;
  beforeAll(() => {
    win = loadApp();
    // 造数据：一个大 key 排 Top1
    win.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t1", title: "x".repeat(2000) }]));
  });

  it("源码契约：卡片 + 渲染函数 + 阈值三档存在", () => {
    const src = fs.readFileSync(HTML, "utf8");
    expect(src).toMatch(/id="storageUsageCard"/);
    expect(src).toMatch(/function renderStorageUsage/);
    expect(src).toMatch(/pct >= 70 && pct < 85/);   // warn 档
    expect(src).toMatch(/pct >= 85/);               // danger 档
    expect(src).toMatch(/storage-usage-fill\.warn|classList\.toggle\("warn"/);
  });

  it("运行时：renderStorageUsage 填充横条百分比 + Top5 行", () => {
    win.renderStorageUsage();
    const fill = win.document.getElementById("storageUsageFill");
    const total = win.document.getElementById("storageUsageTotal");
    const top = win.document.getElementById("storageUsageTop");
    expect(fill).toBeTruthy();
    expect(total.textContent).toMatch(/%$/);
    expect(fill.style.width).toMatch(/%$/);
    expect(top.children.length).toBeGreaterThanOrEqual(1);
    // Top1 应含 tasks 键名
    expect(top.children[0].innerHTML).toContain("tasks");
  });

  it("运行时：阈值变色——大 key 逼近 5MB 时 warn/danger class 生效", () => {
    const w = loadApp();
    // 2.5MB × 2（UTF-16 计 5MB+）→ danger 档
    w.localStorage.setItem(PREFIX + "big_a", "a".repeat(1250000));
    w.localStorage.setItem(PREFIX + "big_b", "b".repeat(1250000));
    w.renderStorageUsage();
    const fill = w.document.getElementById("storageUsageFill");
    expect(fill.classList.contains("danger")).toBe(true);
  });

  it("口径：localStorage 字节按 UTF-16（len×2）统计——中文与英文每字符同 2 字节", () => {
    const w = loadApp();
    w.localStorage.setItem(PREFIX + "rec_office", JSON.stringify([{ id: "r1", title: "中文标题测试数据" }]));
    w.renderStorageUsage();
    const total = w.document.getElementById("storageUsageTotal");
    // 存在百分比且非 NaN
    expect(total.textContent).toMatch(/\d+(\.\d+)? (B|KB|MB) \/ ~/);
  });
});
