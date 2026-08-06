import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("Store 状态管理", () => {
  let win;
  beforeEach(() => { win = loadApp(); win.localStorage.clear(); });

  it("S1: createStore 返回 {get, set, subscribe}", () => {
    const s = win.__test.createStore(0);
    expect(s.get).toBeTypeOf("function");
    expect(s.set).toBeTypeOf("function");
    expect(s.subscribe).toBeTypeOf("function");
    expect(s.get()).toBe(0);
  });

  it("S2: set 更新状态，get 返回新值", () => {
    const s = win.__test.createStore(0);
    s.set(1);
    expect(s.get()).toBe(1);
    s.set(n => n + 10);
    expect(s.get()).toBe(11);
  });

  it("S3: subscribe 在 set 时被调用", () => {
    const s = win.__test.createStore(0);
    const calls = [];
    s.subscribe((next, prev) => calls.push([next, prev]));
    s.set(1);
    s.set(2);
    expect(calls).toEqual([[1, 0], [2, 1]]);
  });

  it("S4: subscribe 返回取消订阅函数", () => {
    const s = win.__test.createStore(0);
    const calls = [];
    const unsub = s.subscribe((n) => calls.push(n));
    s.set(1);
    unsub();
    s.set(2);
    expect(calls).toEqual([1]);
  });

  it("S5: subscribe 异常不崩溃其他订阅者", () => {
    const s = win.__test.createStore(0);
    const calls = [];
    s.subscribe(() => { throw new Error("boom"); });
    s.subscribe((n) => calls.push(n));
    s.set(1);
    expect(calls).toEqual([1]);
  });

  it("S6: taskStore 初始化为空数组", () => {
    expect(Array.isArray(win.__test.taskStore.get())).toBe(true);
  });

  it("S7: setTasks 更新 taskStore", () => {
    const { setTasks, taskStore } = win.__test;
    setTasks([{ id: "t1", sc: "office", title: "test", status: "todo", doneAt: null, tags: [], created: Date.now() }]);
    expect(taskStore.get().length).toBe(1);
    expect(taskStore.get()[0].id).toBe("t1");
  });

  it("S8: getTasks 返回 taskStore 的值", () => {
    const { setTasks, getTasks } = win.__test;
    setTasks([{ id: "t2", sc: "code", title: "code", status: "todo", doneAt: null, tags: [], created: Date.now() }]);
    expect(getTasks().length).toBe(1);
    expect(getTasks()[0].id).toBe("t2");
  });
});