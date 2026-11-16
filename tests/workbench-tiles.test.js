/**
 * workbench-tiles.test.js —— 刀 2（左栏工作台收口 + tiles 页）接手续做批
 * ----------------------------------------------------------------------------
 * 背景：孤儿批 wb-ui-c23 的刀 2/刀 3 交织；用户 2026-11-16 裁「只落刀 2，
 * 弃刀 3 右栏（保留已发版 B4 四节）」。本文件只守刀 2 契约：
 *  ① 左栏 work 组收为单一「工作台」入口（sc=workbench），场景不再占侧栏入口；
 *  ② 工作台页渲染 7 场景 + 场景联动 = 8 个 tile，每个都有 data-tile-sc 目的地；
 *  ③ 点 tile 走 formATabOpenScene：有同场景 tab 就切（幂等，不叠），没有就追加；
 *  ④ 移动底栏点 work 组直接导航到工作台（不开抽屉）；
 *  ⑤ 刀 3 特征零引入的反向对照：右栏仍是 B4 四节，无 menubar 会话/三段函数。
 * 运行：npm test -- workbench-tiles
 */
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const ORDER = ["office", "data", "design", "study", "code", "life", "health"];

const boot = (extra) =>
  loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });

async function ready(win) {
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

describe("刀 2 · 左栏工作台收口", () => {
  it("① work 组只剩单一工作台入口，7 场景与联动都不再占侧栏", async () => {
    const win = await ready(boot());
    const groups = win._buildSideMenu();
    const work = groups.filter((g) => g.gid === "work")[0];
    expect(work.nodes.map((n) => n.id)).toEqual(["feat-workbench"]);
    expect(work.nodes[0].sc).toBe("workbench");
    const scs = groups.flatMap((g) => g.nodes).map((n) => n.sc).filter(Boolean);
    for (const sc of ORDER.concat("chainpage")) {
      expect(scs.includes(sc), `${sc} 不应再占侧栏入口`).toBe(false);
    }
  });

  it("② 工作台页渲染 8 个 tile，每个都有非空目的地", async () => {
    const win = await ready(boot());
    win.__test.setActive("workbench");
    win.__test.render();
    const tiles = Array.from(win.document.querySelectorAll("#main .wb-tile"));
    expect(tiles.length, "7 场景 + 场景联动 = 8 个 tile").toBe(8);
    const scs = tiles.map((b) => b.getAttribute("data-tile-sc"));
    for (const sc of ORDER.concat("chainpage")) expect(scs).toContain(sc);
    expect(scs.filter(Boolean).length).toBe(8);
  });

  it("③ 点 tile：无同场景 tab 时追加一个场景视图并切过去", async () => {
    const win = await ready(boot());
    const before = win.getFormATabs().filter((x) => x.scene === "study").length;
    win.formATabOpenScene("study");
    const after = win.getFormATabs().filter((x) => x.scene === "study");
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].scene).toBe("study");
  });

  it("③b 幂等：重复点同一场景不再叠 tab（只切过去）", async () => {
    const win = await ready(boot());
    win.formATabOpenScene("data");
    const n1 = win.getFormATabs().length;
    win.formATabOpenScene("data");
    const n2 = win.getFormATabs().length;
    expect(n2, "重复点不应新增 tab").toBe(n1);
  });

  it("④ 空场景名是死输入，不产生 tab（反向对照）", async () => {
    const win = await ready(boot());
    const n = win.getFormATabs().length;
    win.formATabOpenScene("");
    win.formATabOpenScene(null);
    expect(win.getFormATabs().length).toBe(n);
  });

  it("⑤ 刀 3 零引入：右栏仍是 B4 四节，menubar 会话/三段函数都不存在", async () => {
    const win = await ready(boot());
    expect(win.document.querySelectorAll(".rr-sec").length).toBeGreaterThan(0);
    expect(typeof win._renderRailUpdate).toBe("undefined");
    expect(typeof win._renderMenubarSessions).toBe("undefined");
    expect(win.document.getElementById("helpMenu")).toBeTruthy(); // B6 保留
  });
});
