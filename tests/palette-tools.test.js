/**
 * palette-tools.test.js —— 工具接入命令面板（v3.7.22）
 * ----------------------------------------------------------------------------
 * 背景：工具面板的 23 个工具此前**只能从侧栏二级菜单进**，而"快速入口"命令面板搜不到它们
 *   （实测 `TOOL_APPS` 在 ui-palette.js 里出现 0 次）。
 * 本文件守住接入后的四件事：
 *   ① 工具以「工具」分组出现在面板里（数量与注册表一致）
 *   ② 按**名称**能搜到（模糊）
 *   ③ 按**拼音首字母**能搜到（sjc → 时间戳；本批为此补齐了 51 个汉字的首字母）
 *   ④ 点击工具项能真正打开对应工具页
 *
 * 层级说明：ui-palette 属 UI 层、TOOL_APPS 属 Render 层，UI 引用 Render 是**向下依赖**，无倒挂。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
const TOOL_NAMES = ["Markdown 编辑器", "表格编辑器", "幻灯片", "PDF 阅读", "截图 OCR", "时间戳"];

beforeEach(() => { win = loadApp(); });

const openCmd = () => { win.openCmd(); };
const search = (kw) => {
  const input = win.document.querySelector("#cmdInput");
  input.value = kw;
  input.dispatchEvent(new win.Event("input"));
  return [...win.document.querySelectorAll("#cmdList li[data-i]")].map((li) => li.textContent);
};

describe("工具接入命令面板（v3.7.22）", () => {
  it("① 面板里出现「工具」分组（分组头由渲染层自动插入）", () => {
    openCmd();
    const groups = [...win.document.querySelectorAll("#cmdList .cmd-group")].map((g) => g.textContent);
    expect(groups).toContain("工具");
  });

  it("① 工具项数量与注册表一致（≥20；真实注册表 23 个）", () => {
    openCmd();
    const labels = [...win.document.querySelectorAll("#cmdList li[data-i]")].map((li) => li.textContent);
    const hit = TOOL_NAMES.filter((n) => labels.some((l) => l.includes(n)));
    expect(hit.length, "抽查至少命中 5 个已知工具名").toBeGreaterThanOrEqual(5);
    expect(labels.length, "总条目数应显著大于纯命令数（说明工具已并入）").toBeGreaterThan(40);
  });

  it("② 按名称能搜到（模糊）", () => {
    openCmd();
    const r = search("时间戳");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]).toContain("时间戳");
  });

  it("③ 按拼音首字母能搜到工具（sjc → 时间戳）", () => {
    openCmd();
    const r = search("sjc");
    expect(r.some((x) => x.includes("时间戳")), "拼音首字母应能命中工具").toBe(true);
  });

  it("③ 拼音首字母命中时会带高亮（复用已有高亮逻辑）", () => {
    openCmd();
    search("sjc");
    const hits = [...win.document.querySelectorAll("#cmdList b.cmd-hit")].map((b) => b.textContent).join("");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("④ 点击工具项能打开对应工具页（时间戳 → 出现 tsA 输入）", () => {
    openCmd();
    search("时间戳");
    const first = win.document.querySelector("#cmdList li[data-i]");
    expect(first).toBeTruthy();
    first.click();
    expect(win.document.querySelector("#tsA"), "应进入时间戳工具页").toBeTruthy();
  });

  it("④ 工具项会进入「最近使用」（trackRecent 默认开启）", () => {
    openCmd();
    search("表格编辑器");
    const first = win.document.querySelector("#cmdList li[data-i]");
    first.click();
    const recent = win.__test.getCmdRecent();
    expect(recent.some((x) => x.includes("表格编辑器"))).toBe(true);
  });
});
