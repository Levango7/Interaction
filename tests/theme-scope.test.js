/**
 * theme-scope.test.js —— 主题入口收敛（2026-10-20 P1-3）
 * ----------------------------------------------------------------------------
 * 背景：主题下拉曾一次列出 11 项（亮/暗/跟随 + 8 套实验主题），首屏决策成本高。
 * P1-3 只收敛**入口**：默认列表 3 项，实验主题用 `option[hidden]` 收起，勾选后出现；
 * 契约与持久化逻辑一律不动（老用户选中的实验主题必须仍然可见、仍然生效）。
 * 四条判据：① 默认 3 可见 / 8 隐藏；② 勾选后 8 项全部可见；③ 取消勾选后重新隐藏；
 * ④ 当前值是实验主题时自动勾选并可见（防"下拉空白"）；⑤ 通过下拉切实验主题仍然生效。
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

const opts = (win) => [...win.document.querySelectorAll("#cfgTheme option")];
const labOpts = (win) => opts(win).filter((o) => o.hasAttribute("data-lab"));

describe("主题入口收敛", () => {
  it("默认只可见 亮/暗/跟随系统，8 套实验主题为 hidden", async () => {
    const win = await startApp();
    expect(opts(win).length, "总选项仍是 11（数据不动，只收入口）").toBe(11);
    const labs = labOpts(win);
    expect(labs.length, "实验主题应有 8 套").toBe(8);
    expect(labs.every((o) => o.hasAttribute("hidden")), "实验主题默认必须隐藏").toBe(true);
    const core = opts(win).filter((o) => !o.hasAttribute("data-lab"));
    expect(core.map((o) => o.value)).toEqual(["light", "dark", "system"]);
  });

  it("勾选「显示实验主题」后 8 项全部可见，取消后重新隐藏", async () => {
    const win = await startApp();
    const chk = win.document.getElementById("cfgThemeShowLab");
    expect(chk, "应有显示实验主题的开关").toBeTruthy();
    chk.checked = true;
    chk.dispatchEvent(new win.Event("change"));
    expect(labOpts(win).every((o) => !o.hasAttribute("hidden")), "勾选后应全部可见").toBe(true);
    chk.checked = false;
    chk.dispatchEvent(new win.Event("change"));
    expect(labOpts(win).every((o) => o.hasAttribute("hidden")), "取消后应重新隐藏").toBe(true);
  });

  it("当前值是实验主题时：自动勾选并让该项可见（防下拉空白）", async () => {
    const win = await startApp();
    const sel = win.document.getElementById("cfgTheme");
    sel.value = "sepia";
    win.syncThemeLabOption();
    const chk = win.document.getElementById("cfgThemeShowLab");
    expect(chk.checked, "应为当前实验主题自动打开开关").toBe(true);
    const sepia = win.document.querySelector('#cfgTheme option[value="sepia"]');
    expect(sepia.hasAttribute("hidden"), "当前选中的实验主题必须可见").toBe(false);
  });

  it("通过下拉选实验主题仍然生效（收敛入口不影响能力）", async () => {
    const win = await startApp();
    const chk = win.document.getElementById("cfgThemeShowLab");
    chk.checked = true; chk.dispatchEvent(new win.Event("change"));
    const sel = win.document.getElementById("cfgTheme");
    sel.value = "sepia";
    sel.dispatchEvent(new win.Event("change"));
    expect(win.document.documentElement.getAttribute("data-theme"), "应切到 sepia").toBe("sepia");
  });
});
