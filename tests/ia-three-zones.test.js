/**
 * ia-three-zones.test.js —— 三区导航契约（2026-10-20 P1-1a）
 * ----------------------------------------------------------------------------
 * 背景：侧栏从「总览 / 场景 / AI / 工具 / 系统」五组改成「今日 / 工作台 / 助手 / 更多」四组。
 * 这类 IA 改动的风险不是"少渲染一个按钮"，而是**某个入口被悄悄丢掉**（用户以为功能没了）。
 * 所以这里钉三件事：
 *   ① 组 id 恰好是 today/work/assistant/more（桌面侧栏与移动底栏共用同一份菜单树）；
 *   ② 17 个入口一个不少（含 7 个场景 + 主页/任务/时间轴/联动/AI/工具箱/商店/回收站/设置/说明）；
 *   ③ 每个节点都有"能去哪"的表达（sc / menuId / data-aipage|data-gear|data-help 之一），
 *      防止新增节点忘了接线、只在菜单里占位。
 * 移动端底栏的元素数量与 gid 也在这里对一遍（jsdom 能渲染 #mobBar）。
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

async function startApp() {
  const win = loadApp();
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

describe("三区导航契约", () => {
  it("桌面菜单树：4 组、17 个入口、每个入口都有目的地", async () => {
    const win = await startApp();
    const groups = win._buildSideMenu();
    expect(groups.map((g) => g.gid), "组 id 必须是今日/工作台/助手/更多").toEqual([
      "today", "work", "assistant", "more",
    ]);

    const nodes = groups.flatMap((g) => g.nodes);
    expect(nodes.length, "17 个入口一个都不能丢").toBe(17);

    const hasDest = (n) =>
      !!(n.sc || n.menuId || /data-(aipage|gear|help)/.test(n.extraAttrs || ""));
    const missing = nodes.filter((n) => !hasDest(n)).map((n) => n.id);
    expect(missing, "以下节点没有任何目的地（占位死项）：" + missing.join(",")).toEqual([]);

    const scs = nodes.map((n) => n.sc).filter(Boolean);
    for (const sc of ["office", "data", "design", "study", "code", "life", "health"]) {
      expect(scs, `场景 ${sc} 必须仍在菜单里`).toContain(sc);
    }
    for (const sc of ["overview", "tasks", "timeline", "chainpage", "toolbox", "store", "recycle"]) {
      expect(scs, `入口 ${sc} 必须仍在菜单里`).toContain(sc);
    }
    expect(nodes.some((n) => n.menuId === "feat-ai"), "AI 入口必须在").toBe(true);
    expect(nodes.some((n) => n.extraAttrs && n.extraAttrs.includes("data-gear")), "设置入口必须在").toBe(true);
    expect(nodes.some((n) => n.extraAttrs && n.extraAttrs.includes("data-help")), "说明入口必须在").toBe(true);
  });

  it("分组归属：场景与联动在工作台，AI 在助手，工具箱/商店/回收站/设置/说明在更多", async () => {
    const win = await startApp();
    const g = Object.fromEntries(win._buildSideMenu().map((x) => [x.gid, x.nodes]));
    expect(g.work.map((n) => n.sc).filter(Boolean)).toEqual(
      expect.arrayContaining(["office", "data", "design", "study", "code", "life", "health", "chainpage"]),
    );
    expect(g.assistant.some((n) => n.menuId === "feat-ai")).toBe(true);
    const moreSc = g.more.map((n) => n.sc).filter(Boolean);
    for (const sc of ["toolbox", "store", "recycle"]) expect(moreSc).toContain(sc);
    expect(g.today.map((n) => n.sc).filter(Boolean)).toEqual(
      expect.arrayContaining(["overview", "tasks", "timeline"]),
    );
  });

  it("移动端底栏跟随同一份菜单树：4 个按钮且 gid 对齐", async () => {
    const win = await startApp();
    win.__test.setActive("overview");
    win.__test.render();
    const btns = [...win.document.querySelectorAll("#mobBar [data-mob-group]")];
    expect(btns.map((b) => b.getAttribute("data-mob-group"))).toEqual([
      "today", "work", "assistant", "more",
    ]);
  });
});
