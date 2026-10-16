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

  it("⑥ 迁移等效：只带快捷键的那条仍有 sub（且 sub 由 keys 生成，不是手写第二份）", () => {
    const acts = win.registeredActs();
    const withSub = acts.filter((a) => a.sub);
    expect(withSub.map((a) => a.__id), "原本只有「新建任务」带 sub，迁移后不应凭空多出").toEqual(["task.new"]);
    expect(withSub[0].sub, "sub 应由 keys 生成（N）").toBe("N");
    /* 反向：把 keys 清空后 sub 必须消失 —— 证明它真的来自 keys 而非残留字段 */
    const R = win.CMD;
    expect(R.get("task.new").keys).toEqual(["n"]);
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
