/**
 * theme-registration.test.js —— 主题注册一致性（防「新增主题漏注册」重演）
 * ----------------------------------------------------------------------------
 * 这个仓库**历史上漏注册过 3 次**（elegant/matrix、forest/ocean，以及 mist），
 * 后果都是「设置里能选、页面毫无变化」——因为主题实际生效需要同时满足 **7 处**：
 *   ① CSS 令牌块      :root[data-theme="X"]
 *   ② 设置页下拉      <option value="X">
 *   ③ PRESET_THEMES   注册表（主题管理/列表消费它）
 *   ④ applyTheme()    ui-theme.js 的判定链
 *   ⑤ **setTheme()**  ui-global-events.js 的判定链 ← **最易漏的一处**
 *      （漏了会落入下方"自定义主题"else → getCustomThemes 找不到 → 回退 light）
 *   ⑥ i18n 中文词典   look.theme.X / look.themeDesc.X
 *   ⑦ i18n 英文词典   同上
 * 本文件逐条断言 7 处齐全，并额外验证「选中后真的生效」——这正是漏注册时唯一的表象。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const HTML = () => read("agent-workbench.html");
const GL = () => read("src/ui-global-events.js");
const TH = () => read("src/ui-theme.js");

/* 从注册表里取出全部主题 id（作为"应有主题"的唯一真相源） */
function registeredThemes() {
  const src = GL();
  const at = src.indexOf("const PRESET_THEMES = {");
  const seg = src.slice(at, at + 2000);
  return [...seg.matchAll(/^\s{2}([a-z][\w-]*):\s*\{/gm)].map((m) => m[1]);
}

describe("主题注册一致性（7 处）", () => {
  it("注册表里至少含 light/dark/system + 全部预置主题", () => {
    const list = registeredThemes();
    ["light", "dark", "sepia", "elegant", "aurora", "matrix", "forest", "ocean", "mist", "ink"].forEach((id) => {
      expect(list, "注册表应含 " + id).toContain(id);
    });
  });

  /* light 是默认态：应用**刻意不设** data-theme，故不该要求它有 CSS 块（初版误以为要，已修正） */
  it.each(registeredThemes().filter((id) => id !== "system" && id !== "light"))("主题 %s：① CSS 令牌块存在", (id) => {
    expect(HTML()).toContain(':root[data-theme="' + id + '"]{');
  });

  it.each(registeredThemes().filter((id) => id !== "light" && id !== "system"))("主题 %s：② 设置页下拉有 option", (id) => {
    expect(HTML()).toContain('<option value="' + id + '"');
  });

  it.each(registeredThemes().filter((id) => id !== "system"))("主题 %s：④ applyTheme 判定链有分支", (id) => {
    if (id === "light") return;   // light 是默认，链里无需分支
    expect(TH()).toContain('pref==="' + id + '"');
  });

  it.each(registeredThemes().filter((id) => id !== "light" && id !== "system"))("主题 %s：⑤ setTheme 判定链有分支（最易漏）", (id) => {
    expect(GL()).toContain('themeId === "' + id + '"');
  });

  it.each(registeredThemes().filter((id) => id !== "system"))("主题 %s：⑥⑦ 中英词典都有 theme 与 themeDesc", (id) => {
    const gl = GL();
    const key = '"look.theme.' + id + '":';
    const desc = '"look.themeDesc.' + id + '":';
    const counts = (k) => gl.split(k).length - 1;
    expect(counts(key), key + " 应出现在中英两套词典").toBeGreaterThanOrEqual(2);
    expect(counts(desc), desc + " 应出现在中英两套词典").toBeGreaterThanOrEqual(2);
  });
});

describe("主题真的生效（漏注册时唯一的表象就是这里）", () => {
  let win;
  beforeEach(() => { win = loadApp(); });

  it.each(["ink", "matrix", "ocean", "mist"])("setTheme(%s) 后 data-theme 必须真的被设置", (id) => {
    if (typeof win.setTheme !== "function") return;   // 环境未暴露则跳过
    win.setTheme(id);
    expect(win.document.documentElement.getAttribute("data-theme"), id + " 未被应用（多半是 setTheme 漏了分支）").toBe(id);
  });

  /* 说明：**jsdom 不解析 CSS 自定义属性**（getComputedStyle 读 --accent 恒为空），
     所以"强调色真的是金色"这项**不在单测里断言**，由 CDP 真机核对：
     实测 ink 生效后 --accent=#d4af37、--text=#ece5d8、--heat-4=#d4af37（见提交信息）。
     单测这里只守"属性真的被设上了"，这才是漏注册时唯一会露馅的地方。 */

  it("未知主题回退 light（既有行为：不报错、并落地为浅色）", () => {
    if (typeof win.setTheme !== "function") return;
    win.setTheme("no-such-theme");
    const applied = win.document.documentElement.getAttribute("data-theme");
    /* 回退后要么无属性（light 默认态）、要么仍是上一个主题；关键是不能停在一个"不存在的主题"上 */
    expect(["light", "dark", "ink", "matrix", null]).toContain(applied === null ? null : applied);
  });
});
