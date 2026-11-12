/**
 * lint-bindings.test.js —— data-action 绑定覆盖门禁的判定层单测（形态 A B2，功能设计 §2）
 * ----------------------------------------------------------------------------
 * 直接 import `scripts/lib/bindings-scan.mjs` 调纯函数 —— 不 spawn CLI
 * （同 icon-lint.test.js：本机沙箱 execFileSync 一律 EBUSY）。
 *
 * 钉住的是门禁判据的双向包含：
 *   ① 发射了没 handler ⇒ 死控件（点了没反应）→ 红
 *   ② handler 没人发射 ⇒ 死键（表里有、界面没有，纯假覆盖）→ 红
 *   ③ 双齐 ⇒ 绿；同名字面重复发射只算一次（并集去重）
 *   ④ scanActionsInSource 只认 data-action（双/单引号），不误收 data-act 等近亲属性
 *   ⑤ parseFormAActions 只认 `const FORM_A_ACTIONS = {...}` 块，键序即定义序
 * 窄变异自证（§2「删一个 handler / 去一个发射」）：本文件第 4 个 describe
 * 直接对真实 ui-global-events.js / render-entry.js / agent-workbench.html 做
 * 字符串级窄变异，验证门禁判据会翻红 —— 变异只发生在内存字符串，不落盘。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanActionsInSource, parseFormAActions, checkBindings } from "../scripts/lib/bindings-scan.mjs";

const scan = (s) => scanActionsInSource(s, "fixture");

describe("scanActionsInSource：提取发射", () => {
  it("双引号与单引号两种写法都认，行号从 1 起", () => {
    const r = scanActionsInSource('<button data-action="faTabAdd">x</button>\n<span data-action=\'faTabClose\'>y</span>', "f.html");
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ action: "faTabAdd", line: 1, file: "f.html" });
    expect(r[1]).toMatchObject({ action: "faTabClose", line: 2, file: "f.html" });
  });

  it("不误收 data-act / data-action-x 等近亲属性", () => {
    expect(scan('<button data-act="new">旧控件</button><button data-action-x="faTabAdd">错名</button>')).toHaveLength(0);
  });

  it("JS 模板字符串里的发射同样抓到（tab 条是 JS 拼出来的）", () => {
    const r = scan('return \'<button data-action="faTabSwitch" data-tab-id="\'+esc(tb.id)+\'">\';');
    expect(r.map((x) => x.action)).toEqual(["faTabSwitch"]);
  });
});

describe("parseFormAActions：handler 键集", () => {
  it("按定义序提取键", () => {
    const r = parseFormAActions("const FORM_A_ACTIONS = {\n  faTabSwitch: function(){},\n  faRailToggle: function(){}\n};");
    expect(r).toEqual(["faTabSwitch", "faRailToggle"]);
  });

  it("表不存在 / 键名非标识符 ⇒ 空数组（不让坏表静默通过）", () => {
    expect(parseFormAActions("const X = {};")).toEqual([]);
    expect(parseFormAActions("const FORM_A_ACTIONS = { 'fa-tab-add': function(){} };")).toEqual([]);
  });
});

describe("checkBindings：双向包含", () => {
  it("发射并集 ⇄ 键集完全一致 ⇒ ok", () => {
    const r = checkBindings({ used: [{ action: "faTabAdd" }, { action: "faTabAdd" }, { action: "faTabSwitch" }], handlers: ["faTabSwitch", "faTabAdd"] });
    expect(r.ok).toBe(true);
    expect(r.union).toEqual(["faTabAdd", "faTabSwitch"]); // 去重 + 排序
    expect(r.missingHandler).toEqual([]);
    expect(r.deadHandler).toEqual([]);
  });

  it("发射了没 handler ⇒ missingHandler 报死控件，ok=false", () => {
    const r = checkBindings({ used: [{ action: "faTabAdd" }, { action: "faGhost" }], handlers: ["faTabAdd"] });
    expect(r.ok).toBe(false);
    expect(r.missingHandler).toEqual(["faGhost"]);
    expect(r.deadHandler).toEqual([]);
  });

  it("handler 没人发射 ⇒ deadHandler 报死键，ok=false", () => {
    const r = checkBindings({ used: [{ action: "faTabAdd" }], handlers: ["faTabAdd", "faTabClose"] });
    expect(r.ok).toBe(false);
    expect(r.missingHandler).toEqual([]);
    expect(r.deadHandler).toEqual(["faTabClose"]);
  });

  it("两个方向同时坏 ⇒ 两份清单各报各的", () => {
    const r = checkBindings({ used: [{ action: "faX" }], handlers: ["faY"] });
    expect(r.ok).toBe(false);
    expect(r.missingHandler).toEqual(["faX"]);
    expect(r.deadHandler).toEqual(["faY"]);
  });

  it("空 ⇄ 空 ⇒ ok（全删干净不算坏；门禁守的是不一致）", () => {
    expect(checkBindings({ used: [], handlers: [] }).ok).toBe(true);
  });
});

describe("窄变异自证（§2：删 handler / 去发射 必须翻红）", () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const EVENTS = fs.readFileSync(path.join(ROOT, "src", "ui-global-events.js"), "utf8");
  const HTML = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
  const RENDER = fs.readFileSync(path.join(ROOT, "src", "render-entry.js"), "utf8");

  const usedOf = (...texts) => texts.flatMap((t) => scanActionsInSource(t, "mut"));
  const baseline = usedOf(HTML, RENDER);
  const handlers = parseFormAActions(EVENTS);

  it("基线：真实三处源双向包含（绿）", () => {
    expect(checkBindings({ used: baseline, handlers }).ok).toBe(true);
    expect(handlers).toHaveLength(5); // B2 首落 4 键 + B3 faCmpToggle（faRrSec 随 B4、faMenuOpen 待 §8、faImmersive 待应用层定）
  });

  it("变异①：删一个 handler 引用 ⇒ 门红（死控件面）", () => {
    const mutated = EVENTS.replace("faTabClose: function(el){ formATabClose(el.getAttribute(\"data-tab-id\")); },", "");
    expect(mutated).not.toBe(EVENTS); // 变异必须真发生
    const r = checkBindings({ used: baseline, handlers: parseFormAActions(mutated) });
    expect(r.ok).toBe(false);
    expect(r.missingHandler).toEqual(["faTabClose"]); // 发射还在、handler 没了 ⇒ 死控件
  });

  it("变异②：去掉 src 的一处发射 ⇒ 门红（死 handler 面）", () => {
    /* 双态仓：with-injected 跑测时 HTML 是交付态，render-entry 的内容同时存在于
       agent-workbench.html 内联块与 src/render-entry.js —— 一处逻辑变异必须两处同改，
       否则并集里还剩内联副本，门禁假绿。 */
    const mutatedSrc = RENDER.replace('data-action="faTabClose"', 'data-actionx="faTabClose"');
    const mutatedHtml = HTML.replace('data-action="faTabClose"', 'data-actionx="faTabClose"');
    expect(mutatedSrc).not.toBe(RENDER);
    expect(mutatedHtml).not.toBe(HTML);
    const r = checkBindings({ used: usedOf(mutatedHtml, mutatedSrc), handlers });
    expect(r.ok).toBe(false);
    expect(r.deadHandler).toEqual(["faTabClose"]); // handler 还在、没人发射 ⇒ 死键
  });

  it("变异③：HTML 骨架的发射改名 ⇒ 门红（死控件面）", () => {
    const mutated = HTML.replace('data-action="faRailToggle"', 'data-action="faRailTogglex"');
    expect(mutated).not.toBe(HTML);
    const r = checkBindings({ used: usedOf(mutated, RENDER), handlers });
    expect(r.ok).toBe(false);
    expect(r.missingHandler).toEqual(["faRailTogglex"]); // 改名后的发射没人接 ⇒ 死控件
    expect(r.deadHandler).toEqual(["faRailToggle"]);      // 原键成了死 handler ⇒ 双向都红
  });
});
