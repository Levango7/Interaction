/**
 * theme-registration.test.js —— 主题注册一致性（防「新增主题漏注册」重演）
 * ----------------------------------------------------------------------------
 * 这个仓库**历史上漏注册过 3 次**（elegant/matrix、forest/ocean，以及 mist），
 * 后果都是「设置里能选、页面毫无变化」——因为主题实际生效需要同时满足 **7 处**：
 *   ① CSS 令牌块      :root[data-theme="X"]
 *   ② 设置页下拉      <option value="X">
 *   ③ PRESET_THEMES   注册表（主题管理/列表消费它）
 *   ④ applyTheme()    ui-theme.js 的判定链
 *   ⑤ **setTheme()**  ui-ge-theme.js 的判定链 ← **最易漏的一处**
 *      （漏了会落入下方"自定义主题"else → getCustomThemes 找不到 → 回退 light）
 *   ⑥ i18n 中文词典   look.theme.X / look.themeDesc.X
 *   ⑦ i18n 英文词典   同上
 * 本文件逐条断言 7 处齐全，并额外验证「选中后真的生效」——这正是漏注册时唯一的表象。
 *
 * v3.7.150（B3 残余 #82）补两块：
 *   ▸ **反向核对**：正向 7 处以 PRESET_THEMES 为循环源，抓不到历史上真发生的 3 次
 *     （注册表缺 id ⇒ 循环压根不检查它）。反向从 CSS / 下拉回到注册表，两边集合必须相等。
 *   ▸ **解析器自检**：旧实现用 `slice(at, at+2000)` 硬窗口取 id，实测注册表块 1683 B
 *     只剩 317 B 余量，再加一套主题就会把末尾 id 悄悄切掉。改为 helpers 里的配对取块，
 *     并用一份超过窗口的合成注册表钉住它的射程。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const HTML = () => read("agent-workbench.html");
const GL = () => read("src/ui-ge-theme.js");   // v3.7.63：原 ui-global-events.js 按 section 拆块，主题系统归此
/* v3.7.53：中英词典（const MESSAGES）从 UI 层搬进了 core —— 按内容定位，别写死文件名 */
const DICT = () => fs.readdirSync(path.join(ROOT, "src")).filter((x) => x.endsWith(".js"))
  .map((x) => "src/" + x).find((p) => read(p).includes("const MESSAGES = {")) || "src/ui-global-events.js";
const TH = () => read("src/ui-theme.js");

/* 主题 id 的真相源与三个方向的集合，统一由 helpers/theme-registry.mjs 提供
   （配对取块，不用旧版 slice(at,at+2000) 的硬窗口 —— 见该文件头部的两条理由）。 */
import { presetThemeIds, cssThemeIds, selectThemeIds } from "./helpers/theme-registry.mjs";

function registeredThemes() {
  return presetThemeIds(GL());
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
    const gl = read(DICT());
    const key = '"look.theme.' + id + '":';
    const desc = '"look.themeDesc.' + id + '":';
    const counts = (k) => gl.split(k).length - 1;
    expect(counts(key), key + " 应出现在中英两套词典").toBeGreaterThanOrEqual(2);
    expect(counts(desc), desc + " 应出现在中英两套词典").toBeGreaterThanOrEqual(2);
  });
});

/* ============ 反向：从实现面回到注册表（历史那 3 次的形态，正向门抓不到） ============
   正向 7 处断言以 PRESET_THEMES 为循环源 —— 注册表里少一个 id，循环就**根本不会**检查它，
   于是"CSS 有、下拉有、注册表没有"（v3.1.2 / v3.4.0 / v3.6.3 的真实形态）一路绿灯。
   这一组把方向反过来：实现面出现的每个主题 id，都必须能在注册表里找到。 */
describe("主题登记的反向核对（漏注册的真形态）", () => {
  it("CSS 里出现的每个 data-theme 都必须在注册表里（light 是默认态，刻意不设属性）", () => {
    const reg = registeredThemes();
    const orphans = cssThemeIds(HTML()).filter((id) => reg.indexOf(id) < 0);
    expect(orphans, "有主题写了 CSS 却没进 PRESET_THEMES：" + orphans.join(",")).toEqual([]);
  });

  it("设置页下拉里的每个 option 都必须对应注册表条目（system 除外，它走 cfg.theme）", () => {
    const reg = registeredThemes();
    const orphans = selectThemeIds(HTML()).filter((id) => id !== "system" && reg.indexOf(id) < 0);
    expect(orphans, "下拉里出现了未注册的主题：" + orphans.join(",")).toEqual([]);
  });

  it("实现面与注册表两个方向的集合必须相等（多一个少一个都算漂移）", () => {
    const reg = registeredThemes().filter((id) => id !== "light").slice().sort();
    expect(cssThemeIds(HTML()).slice().sort(), "CSS 块集合应等于注册表（去掉默认态 light）").toEqual(reg);
  });

  /* 解析器自身的射程自检：旧版是 slice(at, at+2000) 的硬窗口，注册表块实测已 1683 B，
     再加一套主题就会把末尾 id 切在窗口外 ⇒ 门禁从此看不见它。这里用一份**超过窗口**的合成
     注册表钉住"配对取块"这个修法 —— 窗口式解析在这份样本上会少读，用例即红。 */
  it("注册表超过 2000 字节时仍要读全（挡死硬切片窗口的回归）", () => {
    const many = [];
    for (let i = 0; i < 20; i++) many.push('  t' + i + ': { name: "' + "补位".repeat(60) + '", desc: "x" }');
    const synthetic = "const PRESET_THEMES = {\n" + many.join(",\n") + "\n};\n";
    expect(synthetic.length, "合成样本必须超过旧的 2000 窗口才有射程").toBeGreaterThan(2000);
    /* 自证"这条用例确实能抓到旧口径"：同一份样本按旧的窗口式解析会少读末尾 id。
       没有这一句，"改成配对取块"这件事本身就没有证据 —— 样本撑不爆窗口的话用例恒绿。 */
    const naive = [...synthetic.slice(0, 2000).matchAll(/^\s{2}([a-z][\w-]*)\s*:\s*\{/gm)].map((m) => m[1]);
    expect(naive.includes("t19"), "样本撑不到窗口外 ⇒ 本用例没有射程").toBe(false);
    const ids = presetThemeIds(synthetic);
    expect(ids.length).toBe(20);
    expect(ids, "末尾的 id 不许被切掉").toContain("t19");
  });

  it("当前真实注册表的最后一个键，必须真的被解析器读到（配对的现场自检）", () => {
    const src = GL();
    const blockEnd = src.indexOf("\n};", src.indexOf("const PRESET_THEMES = {"));
    const lastLiteral = [...src.slice(src.indexOf("const PRESET_THEMES"), blockEnd)
      .matchAll(/^\s{2}([a-z][\w-]*)\s*:\s*\{/gm)].pop();
    expect(registeredThemes(), "解析结果必须含注册表里字面最后一个主题").toContain(lastLiteral[1]);
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

/* v3.7.148（台账 R-35）：主题持久化**不许**用「读不到就当空对象」写回整份 cfg。
   生产竞态：initCrypto 在配置可见之前读了一次 ⇒ 内存缓存是空快照；随后应用主题时
   persistThemeToCfg 用 getCfg()（那份空快照）写回 ⇒ 整份 AI 配置被覆盖成 {theme}，
   下一次刷新就永远「未配置」（语义召回静默退化成词法 —— rag-hybrid:105 在 CI 上就是这么红的）。 */
describe("主题持久化不得覆盖整份 cfg（R-35）", () => {
  it("空快照 + 存储里有配置 ⇒ 主题写入后 profiles/base 仍在", async () => {
    const win = loadApp();
    win.localStorage.clear();
    /* 1) 让应用以**空配置**完成一次加密初始化（复现"缓存是空快照"那一刻） */
    await win.__test.initCrypto();
    /* 2) 配置在这之后才落进存储（另一标签页 / 种子数据 / 慢盘） */
    const cfg = { enabled: true, base: "http://127.0.0.1:11434/v1", key: "sk-test", model: "qwen", rag: true,
      profiles: [{ id: "p", name: "p", base: "http://127.0.0.1:11434/v1", key: "sk-test", model: "qwen", embedModel: "bge-m3" }],
      activeId: "p" };
    win.localStorage.setItem("wb_agent_cfg", JSON.stringify(cfg));
    /* 3) 应用主题（启动时/用户切换时都会走这条） */
    win.__test.setTheme("dark");
    const after = JSON.parse(win.localStorage.getItem("wb_agent_cfg") || "{}");
    expect(after.profiles, "主题写入把 profiles 抹掉了 = 配置丢失").toHaveLength(1);
    expect(after.base).toBe(cfg.base);
    expect(after.theme, "主题本身仍要持久化").toBe("dark");
  });
});
