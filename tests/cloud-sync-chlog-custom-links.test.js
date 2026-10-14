/* 追加到 tests/cloud-sync-stage1.test.js 末尾：把「resetCustomLinks 的删除必须进变更日志」钉住。
   背景（docs/cloud-sync-incremental-contract.md §三「已知边界」原文遗留项，本批收口）：
   wb_custom_links 在同步键集合内，而 resetCustomLinks() 此前是裸 removeItem ⇒ 增量模式下
   服务端留着旧值，下一次下行 changed 会把用户删掉的自定义链接原样复活。 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const CHLOG = PREFIX + "sync_changelog";
const CFG = PREFIX + "cfg";
const LINKS = "wb_custom_links";
const on = () => ({ [CFG]: JSON.stringify({ syncIncremental: true }) });
const delEntries = (win, k) => win.getSyncChangelog().filter((e) => e.k === k && e.op === "del");

describe("阶段1/C1 的遗留边界收口：resetCustomLinks 的删除要进变更日志", () => {
  it("开关打开：重置自定义链后，wb_custom_links 有一条 op:\"del\"（否则下行会复活已删的链接）", async () => {
    const win = await loadApp({ storage: on() });
    const added = win.addCustomLink("office", "增量收口用关键词", "study");
    expect(added && added.ok, "前置：自定义链已写入（" + JSON.stringify(added) + "）").toBe(true);
    expect(win.getCustomLinks().length, "前置：本机确有自定义链").toBeGreaterThan(0);
    expect(JSON.parse(win.localStorage.getItem(LINKS)), "前置：键确实落在存储里").toBeTruthy();

    win.resetCustomLinks();

    expect(win.localStorage.getItem(LINKS), "重置后本机该键应已清除").toBeNull();
    const mine = delEntries(win, LINKS);
    expect(mine.length, "删除必须进增量日志（漏记的后果：服务端旧值随下行复活已删的链接）").toBe(1);
    expect(mine[0].ts).toBeGreaterThan(0);
  });

  it("开关关闭（默认）：仍然零行为变化 —— 不产生队列，重置照样生效", async () => {
    const win = await loadApp({ storage: {} });
    expect(win.getCfg().syncIncremental, "前置：默认开关未开").toBeUndefined();
    win.addCustomLink("office", "关态对照", "study");
    win.resetCustomLinks();
    expect(win.localStorage.getItem(LINKS), "重置功能本身不受开关影响").toBeNull();
    expect(win.getSyncChangelog(), "开关关时队列必须为空").toEqual([]);
    expect(win.localStorage.getItem(CHLOG)).toBeNull();
  });

  it("对不存在的键重置（no-op）不得造假信号：没有 del 条目", async () => {
    const win = await loadApp({ storage: on() });
    expect(win.localStorage.getItem(LINKS), "前置：本机本就没有该键").toBeNull();
    win.resetCustomLinks();
    expect(delEntries(win, LINKS).length, "删除前不存在 = removeItem 静默 no-op，记了就是假信号").toBe(0);
  });
});
