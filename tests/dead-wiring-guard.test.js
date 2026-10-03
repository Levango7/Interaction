/**
 * dead-wiring-guard.test.js —— 死接线门禁（v3.7.86 B2）
 * ----------------------------------------------------------------------------
 * 背景：v3.7.73 挖出第 7 例死接线（语义召回开关 `#aiMemRag` 全仓渲染 0 命中，cfg.rag 恒 false），
 * v3.7.86 B2 全量普查又挖出**第 8 例**：v1.6-B 的旧日历弹窗 `#calModal` 及其三个按钮
 * （btnCalClose / btnCalTabMonth / btnCalTabWeek）全仓零引用 —— 而 render-overview 的
 * `bindCalendarEvents()` 无参调用恰好绑到这个化石容器，导致**概况卡日历的翻月/ICS 入口实际是死的**。
 *
 * 本门禁口径：静态 HTML 里的**可交互控件 id**（input/button/select/textarea 及 label[for]），
 * 在 src/ 全块按**字符串任意出现**判定是否被引用（覆盖三种绑定形态：$("#x") / querySelector("#x") /
 * 事件委托 `el.id === "x"`）—— 零出现即死接线。动态渲染出来的 id 不在静态 HTML 里，不参与本门禁。
 * 误报过的教训也记着：事件委托形态曾让第一次普查误判 8 个活控件为死（记档于 v3.7.86 CHANGELOG）。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8").replace(/\r\n/g, "\n");
const srcDir = path.join(ROOT, "src");
const srcFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith(".js"));
const srcBlob = srcFiles.map((f) => fs.readFileSync(path.join(srcDir, f), "utf8")).join("\n");

describe("死接线门禁：静态可交互控件必须被代码引用", () => {
  it("零引用的控件 id 为空", () => {
    const ids = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
    const dead = [];
    for (const id of ids) {
      const isCtl = new RegExp("<(input|button|select|textarea)[^>]*id=\"" + id + "\"", "i").test(html)
        || new RegExp("<label[^>]*for=\"" + id + "\"", "i").test(html);
      if (!isCtl) continue;
      if (!srcBlob.includes(id)) dead.push(id);
    }
    expect(dead,
      "这些静态可交互控件在全仓 src/ 里零引用（死接线；确认无用则连标记一起删，有能力则接上）：\n  " + dead.join("\n  ")
    ).toEqual([]);
  });

  it("旧日历弹窗化石已随 v3.7.86 删除（防止复活）", () => {
    expect(html, "#calModal 旧弹窗应已删除").not.toMatch(/id="calModal"/);
    expect(html).not.toMatch(/id="btnCalClose"|id="btnCalTabMonth"|id="btnCalTabWeek"|id="calendarView"/);
    /* 绑定不得再无参指向已删容器 */
    expect(srcBlob).not.toMatch(/\$\("#calendarView"\)/);
  });
});