import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * v2.3.1 笃行/时间追踪浮层回归测试
 * ----------------------------------------------------------------------------
 * 背景 bug：document 级「点击外部关闭」监听器的 inToolBtn 守卫使用 "#side [data-pomo]"
 * 选择器——v2.1.0 两级菜单后该属性已不存在；且点击后 renderSide() 重建侧栏，
 * 游离 target 的祖先链无 #side，closest("#side …") 恒 null。
 * 结果：侧栏点「笃行」→ toggle 刚打开的浮层被同一 click 冒泡立即关闭（秒开秒关）。
 * 修复后：选择器为纯属性匹配 [data-menu="plug-pomo"] 等。
 */

const PREFIX = "wb_agent_";

describe("v2.3.1 工具浮层（笃行/时间追踪）", () => {
  let win;
  let __test;
  let document;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    document = win.document;
    win.localStorage.clear();
  });

  function openPluginSub() {
    const btn = document.querySelector('#side [data-menu="feat-plugin"]');
    btn.setAttribute("aria-expanded", "true");
    const sub = btn.nextElementSibling;
    if (sub && sub.classList.contains("nav-sub")) sub.removeAttribute("hidden");
  }

  it("侧栏子项 label 为「笃行」，点击后浮层打开且不被同一 click 关闭", () => {
    __test.render();
    openPluginSub();
    const btn = document.querySelector('[data-menu="plug-pomo"]');
    expect(btn.textContent).toContain("笃行");
    btn.click();
    const pop = document.querySelector("#pomoPop");
    expect(pop).toBeTruthy();
    expect(pop.style.display, "浮层必须保持打开（inToolBtn 守卫生效）").not.toBe("none");
  });

  it("再点一次同一子项可关闭浮层（toggle 语义）", () => {
    __test.render();
    openPluginSub();
    // 第一次点击前重新查询（renderSide 会重建 DOM）
    document.querySelector('[data-menu="plug-pomo"]').click();
    const pop = document.querySelector("#pomoPop");
    expect(pop.style.display).not.toBe("none");
    document.querySelector('[data-menu="plug-pomo"]').click();
    expect(pop.style.display, "第二次点击应关闭").toBe("none");
  });

  it("时间追踪浮层同样可以打开", () => {
    __test.render();
    openPluginSub();
    document.querySelector('[data-menu="plug-tracker"]').click();
    const pop = document.querySelector("#trackerPop");
    expect(pop).toBeTruthy();
    expect(pop.style.display).not.toBe("none");
  });
});
