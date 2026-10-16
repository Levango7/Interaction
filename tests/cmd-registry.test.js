/**
 * cmd-registry.test.js —— 命令注册表：把"严谨规则"落成机械（P0-4）
 * ----------------------------------------------------------------------------
 * 背景（docs/evaluation-product-2026-10-16.md §二）：命令面板本身很成熟（拼音/模糊/recent），
 * 缺的是**规则**——没有集中注册表，于是：
 *   ① 快捷键撞车静默发生（hotkeys 里 `e.key==="n"` 与 acts 里 `sub:"N"` 两套无单一真相源）；
 *   ② 用户无法知道"到底有哪些命令"；
 *   ③ 新命令无约束地往里加。
 *
 * 本文件守四件事（先红后绿）：
 *   ① **注册即查重**：重复 id / 重复键位 → 不注册 + console.error（不是静默覆盖）；
 *   ② 每条命令必须 label + run 齐备（缺一不可，否则面板会出现点了没反应的死项）；
 *   ③ `findByKeys` 能按规范键位串找到命令（给后续 hotkeys 迁移用）；
 *   ④ **迁移完整性**：registry 里的命令数与 buildCmds 实际渲染出来的一致 ——
 *      这一条是"防止迁移漏项/多项"的锚（否则面板会悄悄少几个命令而没人发现）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import { stripCommentsAndStrings } from "../scripts/lib/code-scan.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let win;

beforeEach(() => {
  win = loadApp();
});

describe("命令注册表：规则", () => {
  it("① 重复 id 不被注册，且必须 console.error（不静默覆盖）", () => {
    const R = win.makeRegistry();
    const errs = [];
    win.console.error = (...a) => errs.push(a.map(String).join(" "));
    R.register({ id: "a", label: "A", keys: [], run: () => {} });
    const before = R.all().length;
    R.register({ id: "a", label: "A 副本", keys: [], run: () => {} });
    expect(R.all().length, "重复 id 不得增加条目").toBe(before);
    expect(R.get("a").label, "原有条目不得被覆盖").toBe("A");
    expect(errs.join(" "), "必须留下痕迹").toMatch(/a|重复|dup/i);
  });

  it("② 重复键位不被注册（返回被拒的那条，由调用方决定是否重试）", () => {
    const R = win.makeRegistry();
    const errs = [];
    win.console.error = (...a) => errs.push(a.map(String).join(" "));
    R.register({ id: "first", label: "先来", keys: ["ctrl+k"], run: () => {} });
    R.register({ id: "second", label: "后到", keys: ["ctrl+k"], run: () => {} });
    expect(R.findByKeys("ctrl+k"), "键位必须仍指向先注册的那条").toBe("first");
    expect(R.all().some((c) => c.id === "second"), "撞键的那条不得混进表").toBe(false);
    expect(errs.join(" ")).toMatch(/ctrl\+k|键位|conflict|dup/i);
  });

  it("③ 缺 label 或 run 的命令拒绝注册（防面板出现点了没反应的死项）", () => {
    const R = win.makeRegistry();
    expect(R.register({ id: "noLabel", keys: [], run: () => {} })).toBe(false);
    expect(R.register({ id: "noRun", label: "有名字没动作", keys: [] })).toBe(false);
    expect(R.register({ id: "ok", label: "完整", keys: [], run: () => {} })).toBe(true);
    expect(R.all().length).toBe(1);
  });

  it("④ findByKeys 支持规范化（大小写/空格/修饰符顺序不敏感）", () => {
    const R = win.makeRegistry();
    R.register({ id: "x", label: "X", keys: ["Ctrl+Shift+Z"], run: () => {} });
    expect(R.findByKeys("ctrl+shift+z")).toBe("x");
    expect(R.findByKeys(" shift + ctrl + z ")).toBe("x");
    expect(R.findByKeys("ctrl+z")).toBe(null);
  });

  it("⑤ 迁移完整性：registry 的命令与 buildCmds 渲染出来的一条不差", () => {
    /* 这一条是"防止迁移漏项/多项"的锚 —— 面板悄悄少几个命令而没人发现是最坏的事故。
       这里直接问**产品自己用的那个函数**（buildCmds 也从它取 acts），
       所以它红 = 面板真的会少/多命令，不是测试的臆测。 */
    const acts = win.registeredActs();
    const ids = acts.map((a) => a.__id).filter(Boolean);
    expect(ids.length, "acts 必须全部带 registry id").toBe(acts.length);
    expect(new Set(ids).size, "id 不得重复").toBe(ids.length);
    expect(ids.length, "迁移前后条数必须一致（原 acts 共 15 条）").toBe(15);
    expect(ids).toContain("task.new");
    expect(ids).toContain("theme.toggle");
    expect(ids).toContain("data.clear");
    expect(ids).toContain("ui.openRecycle");
  });

  it("⑥ 有 sub 的条目必须**恰好**等于注册表里带 keys 的那几条（sub 由 keys 生成，不是手写第二份）", () => {
    /* v3.7.132（第二步）：原先这条断言的是「只有 task.new 带 sub」。现在 keys 成了键位的**唯一真相源**
       （hotkeys 也按它分发），于是把 `g`（总览）补进注册表 —— 它本来就是个真实快捷键，
       只是从没在面板上露过面。断言随之升级为**逐一对应**：有 sub ⇔ 有 keys，且键位文本一致。
       这比"只有一条"更强：既拦"凭空多出的假提示"，也拦"注册了 keys 却在面板上看不见"。 */
    const acts = win.registeredActs();
    const withSub = acts.filter((a) => a.sub);
    /* 有 keys 的以**注册表**为准（acts 是渲染用的投影，不带 keys 字段） */
    const withKeys = win.CMD.all().filter((c) => (c.keys || []).length).map((c) => c.id);
    expect(withSub.map((a) => a.__id).sort(), "有 sub 的必须恰好等于有 keys 的（不能多也不能少）")
      .toEqual(withKeys.slice().sort());
    expect(withSub.map((a) => a.__id), "现已知的两条：新建任务 N / 查看总览 G").toEqual(["task.new", "view.overview"]);
    expect(withSub.find((a) => a.__id === "task.new").sub).toBe("N");
    expect(withSub.find((a) => a.__id === "view.overview").sub).toBe("G");
    /* 反向：keys 与 sub 必须同源 —— 清掉 keys，sub 就该消失 */
    const R = win.CMD;
    expect(R.get("task.new").keys).toEqual(["n"]);
    expect(R.get("view.overview").keys).toEqual(["g"]);
  });

  it("⑦ 幂等：重复调用注册不产生重复条目，也不报错", () => {
    win.registerAppCmds();                       // 先让它注册一轮，再取基线
    const before = win.CMD.size();
    win.registerAppCmds();
    win.registerAppCmds();
    expect(win.CMD.size(), "重复注册不得增加条目").toBe(before);
    expect(before, "注册应确实落了表").toBeGreaterThan(0);
  });
});

describe("v3.7.132 第二步：hotkeys 按注册表分发（键位只有一处定义）", () => {
  /* 迁移动机：原先 `ui-hotkeys.js` 写 `e.key==="n"` / `e.key==="g"`，而面板的提示是另一份手写的 ——
     改一处忘一处就是错提示。现在键位住在命令定义里，两条路径共用同一份。
     这里**不写死 `n`/`g` 字面量**去按：从注册表里读 keys，再按那个键 ——
     否则测试自己又变成"第二份真相源"，把搬迁自由改没了。 */
  const press = (w, key) => {
    const ev = new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    w.document.dispatchEvent(ev);
    return ev;
  };

  it("⑧ 按下某命令的注册键位 → 该命令的 run 被调用（真·同一份定义）", () => {
    win.registerAppCmds();
    const seen = [];
    ["task.new", "view.overview"].forEach((id) => {
      const c = win.CMD.get(id);
      expect(c, id + " 必须在注册表里").toBeTruthy();
      const key = (c.keys || [])[0];
      expect(key, id + " 必须带键位（否则本条测不到分发）").toBeTruthy();
      const orig = c.run;
      c.run = () => seen.push(id);
      press(win, key);
      c.run = orig;
    });
    expect(seen, "两条都应由注册表分发触发").toEqual(["task.new", "view.overview"]);
  });

  it("⑨ N 键：从「统计」也要切回场景并聚焦新建任务输入框（原只有总览会切）", () => {
    win.registerAppCmds();
    win.setActive("stats");
    expect(win.getActive()).toBe("stats");
    press(win, "n");
    expect(win.getActive(), "统计页没有任务表单：不切场景的话按 N 等于没反应").toBe("office");
    const f = win.document.getElementById("taskForm");
    /* ⚠️ 这里必须自己 querySelector —— 写 `f.title` 会拿到 form 的 title **属性**（字符串），
       正是本笔修掉的那个坑；用例若照抄失效写法，就会把 bug 当成期望值钉死。 */
    const titleInput = f.querySelector('[name="title"]');
    expect(win.document.activeElement, "焦点应落在新建任务的标题输入框").toBe(titleInput);
  });

  it("⑩ 未注册的字母键不得吞掉事件（不得 preventDefault，也不得误触发）", () => {
    const ev = press(win, "q");
    expect(ev.defaultPrevented, "没绑定的键要和没按一样").toBe(false);
  });

  it("⑪ 输入态豁免：在 INPUT 里打 n / g 不得触发命令", () => {
    win.registerAppCmds();
    win.setActive("tasks");
    const input = win.document.createElement("input");
    win.document.body.appendChild(input);
    input.focus();
    const ev = new win.KeyboardEvent("keydown", { key: "g", bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(win.getActive(), "在输入框里打字不能把场景切走").toBe("tasks");
  });

  it("⑫ 全仓不得再出现 `form.title.focus()` —— 那取到的是 title 属性（字符串），必然抛错", () => {
    /* 这是本笔**顺带抓到并修掉**的一处长期静默失效：`#taskForm` 是 `<form>`，
       `form.title` 被 HTMLElement.title（字符串）遮蔽，`.focus()` 必然 TypeError ——
       四处调用点因此全部无效（三处打断 handler、一处被 try 吞掉）。
       现在统一走 `focusTaskTitleInput()`（core-shared），这条把"再写回去"堵死。 */
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
    /* 必须先剥注释再匹配：本笔的说明性注释里就写着 `f.title.focus()`（作为反例引用），
       不剥的话守护会把"解释这个坑的文字"当成"这个坑"。用仓库既有的剥离器（口径同其它门禁）。 */
    const bad = readdirSync(dir).filter((f) => f.endsWith(".js"))
      .filter((f) => /\.title\.focus\s*\(/.test(stripCommentsAndStrings(readFileSync(join(dir, f), "utf8"))));
    expect(bad, "这些文件又写回了失效写法：" + bad.join(", ")).toEqual([]);
    /* 正向：助手必须真的定义在**早于所有调用方**的层里，否则会新增逆层边 */
    expect(typeof win.focusTaskTitleInput, "助手必须挂在 window 上可被各层调用").toBe("function");
    /* 反向：四个已知调用点必须**真的**改用了助手 —— 否则"删掉失效写法"可以退化成"直接删掉功能" */
    const callers = ["ui-scene-bind.js", "ui-palette.js", "ui-global-events.js", "ui-ge-calendar.js"]
      .filter((f) => !/focusTaskTitleInput\s*\(/.test(stripCommentsAndStrings(readFileSync(join(dir, f), "utf8"))));
    expect(callers, "这些调用点没走共用助手（聚焦功能会再次静默失效）：" + callers.join(", ")).toEqual([]);
    expect(win.focusTaskTitleInput(), "没有表单时应安全返回 null（不抛）").not.toBeTruthy();
  });
});
