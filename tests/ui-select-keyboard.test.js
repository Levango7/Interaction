// 自研下拉键盘行为回归测试（v3.7.58）
// 背景：旧实现给同一触发器绑了两个 keydown 处理器（EDITABLE 分支一个 + 无条件一个）：
//       ① ↓/↑ 一次按键移动两步；② Enter 选中后列表被第二个处理器重新弹开；
//       ③ 可编辑 input 里按空格被拦截成开合。v3.7.58 修复：EDITABLE 只绑上方分支。
// 策略：TEST_GATE 下模块不自动增强，手工造 select 调 window.dsEnhance，派发 KeyboardEvent 断言。

import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function makeEditableSelect(win) {
  const sel = win.document.createElement("select");
  sel.setAttribute("data-editable", "1");
  [["", "选时间"], ["09:00", "09:00"], ["09:30", "09:30"], ["10:00", "10:00"]].forEach(function (pair) {
    const o = win.document.createElement("option");
    o.value = pair[0]; o.textContent = pair[1];
    sel.appendChild(o);
  });
  win.document.body.appendChild(sel);
  win.dsEnhance(sel);
  return sel;
}

describe("自研下拉（ui-select）键盘行为 v3.7.58 回归", () => {
  it("1: 可编辑模式 ↓ 一次精确移动一步（不被第二个处理器再移一步）", () => {
    const win = loadApp();
    win.Element.prototype.scrollIntoView = win.Element.prototype.scrollIntoView || function () {};
    const sel = makeEditableSelect(win);
    const inst = sel.__ds;
    inst.trigger.dispatchEvent(new win.Event("focus"));
    expect(inst.list.hidden).toBe(false);
    // 初始 active = 当前选中项（空值"选时间"）
    inst.trigger.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    const actives = inst.list.querySelectorAll(".ds-opt.is-active");
    expect(actives.length).toBe(1);
    expect(actives[0].textContent).toBe("09:00");
  });

  it("2: 可编辑模式 Enter 选中后列表保持关闭（不被重新弹开）且派发 change", () => {
    const win = loadApp();
    win.Element.prototype.scrollIntoView = win.Element.prototype.scrollIntoView || function () {};
    const sel = makeEditableSelect(win);
    const inst = sel.__ds;
    let changed = null;
    sel.addEventListener("change", function () { changed = sel.value; });
    inst.trigger.dispatchEvent(new win.Event("focus"));
    inst.trigger.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    inst.trigger.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(changed).toBe("09:00");
    expect(sel.value).toBe("09:00");
    expect(inst.list.hidden).toBe(true);
  });

  it("3: 可编辑模式空格不触发开合（回归输入语义，不被 preventDefault）", () => {
    const win = loadApp();
    win.Element.prototype.scrollIntoView = win.Element.prototype.scrollIntoView || function () {};
    const sel = makeEditableSelect(win);
    const inst = sel.__ds;
    inst.trigger.dispatchEvent(new win.Event("focus"));
    const e = new win.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    inst.trigger.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(inst.list.hidden).toBe(false); // focus 时已展开，空格既不关也不重开
  });

  it("4: 非可编辑模式 Enter 打开 → 再按 Enter 选中 active（行为不变）", () => {
    const win = loadApp();
    win.Element.prototype.scrollIntoView = win.Element.prototype.scrollIntoView || function () {};
    const sel = win.document.createElement("select");
    [["a", "甲"], ["b", "乙"], ["c", "丙"]].forEach(function (pair) {
      const o = win.document.createElement("option");
      o.value = pair[0]; o.textContent = pair[1];
      sel.appendChild(o);
    });
    win.document.body.appendChild(sel);
    win.dsEnhance(sel);
    const inst = sel.__ds;
    inst.trigger.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(inst.list.hidden).toBe(false);
    let changed = null;
    sel.addEventListener("change", function () { changed = sel.value; });
    inst.trigger.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(changed).toBe("a"); // active = 当前选中项 a，click() 选中
  });
});
