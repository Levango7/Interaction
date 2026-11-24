/**
 * 每循环局部控制器（v3.7.157 并发收口）——钉「循环 B 的取消不再误伤循环 A」这一 bug 形态。
 *
 * 旧实现：chatController 是模块级单例，runChatLoop 入口无条件覆盖它 ⇒ 第二个会话提交
 * 会把第一个循环的取消/超时句柄顶掉（AbortController 不可用、AbortError 落到错误的循环）。
 * 新实现：每循环持有自己的 ctrl；_chatCancelled(ctrl) 只读传入的那个，不再读模块全局。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("每循环局部控制器", () => {
  it("createChatController 产出的两个控制器互相独立", () => {
    const win = loadApp();
    const a = win.createChatController();
    const b = win.createChatController();
    expect(a).not.toBe(b);
    expect(a.aborted).toBe(false);
    expect(b.aborted).toBe(false);
  });

  it("_chatCancelled(ctrl) 只读传入的控制器，不读模块全局", () => {
    const win = loadApp();
    const a = win.createChatController();
    const b = win.createChatController();
    // 模拟：A 是先进来的循环，B 是后进来的（被用户取消的那个）
    b.aborted = true;
    // A 未取消 ⇒ 即便 B 已取消，A 的判定仍必须是 false（旧单例下这里会误报 true）
    expect(win._chatCancelled(a)).toBe(false);
    expect(win._chatCancelled(b)).toBe(true);
    // 再取消 A ⇒ A 也变 true，互不影响
    a.aborted = true;
    expect(win._chatCancelled(a)).toBe(true);
    expect(win._chatCancelled(b)).toBe(true);
  });

  it("不传参时回退到模块全局（向后兼容旧调用点）", () => {
    const win = loadApp();
    // 不设置任何控制器时：模块全局为 null ⇒ false（不抛错、不误报）
    expect(win._chatCancelled()).toBe(false);
  });
});