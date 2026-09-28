import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import { mediaBlocks } from "./helpers/media-blocks.js";

describe("T4.3 移动端增强 - 手势支持 + 触摸优化 + 横屏适配", () => {
  let win;
  let __test;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
  });

  // ===== handleSwipe：滑动方向计算（纯函数） =====
  describe("handleSwipe - 滑动方向计算", () => {
    it("handleSwipe 是函数", () => {
      expect(typeof __test.handleSwipe).toBe("function");
    });

    it("左滑：startX=200, endX=100 → direction='left', distance=100", () => {
      const r = __test.handleSwipe(
        { clientX: 200, clientY: 100 },
        { clientX: 100, clientY: 100 }
      );
      expect(r).not.toBeNull();
      expect(r.direction).toBe("left");
      expect(r.distance).toBe(100);
    });

    it("右滑：startX=100, endX=200 → direction='right', distance=100", () => {
      const r = __test.handleSwipe(
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 }
      );
      expect(r).not.toBeNull();
      expect(r.direction).toBe("right");
      expect(r.distance).toBe(100);
    });

    it("上滑：startY=200, endY=100 → direction='up', distance=100", () => {
      const r = __test.handleSwipe(
        { clientX: 100, clientY: 200 },
        { clientX: 100, clientY: 100 }
      );
      expect(r).not.toBeNull();
      expect(r.direction).toBe("up");
      expect(r.distance).toBe(100);
    });

    it("下滑：startY=100, endY=200 → direction='down', distance=100", () => {
      const r = __test.handleSwipe(
        { clientX: 100, clientY: 100 },
        { clientX: 100, clientY: 200 }
      );
      expect(r).not.toBeNull();
      expect(r.direction).toBe("down");
      expect(r.distance).toBe(100);
    });

    it("距离<50px 返回 null（视为点击而非滑动）", () => {
      // 水平 30px
      expect(__test.handleSwipe(
        { clientX: 100, clientY: 100 },
        { clientX: 130, clientY: 100 }
      )).toBeNull();
      // 垂直 40px
      expect(__test.handleSwipe(
        { clientX: 100, clientY: 100 },
        { clientX: 100, clientY: 140 }
      )).toBeNull();
      // 对角线各 30px（均 <50）
      expect(__test.handleSwipe(
        { clientX: 100, clientY: 100 },
        { clientX: 130, clientY: 130 }
      )).toBeNull();
    });

    it("阈值边界：距离=50px 算滑动（>=50 触发）", () => {
      const r = __test.handleSwipe(
        { clientX: 100, clientY: 100 },
        { clientX: 150, clientY: 100 }
      );
      expect(r).not.toBeNull();
      expect(r.direction).toBe("right");
      expect(r.distance).toBe(50);
    });

    it("对角线滑动取主要方向（水平距离>垂直距离→水平方向）", () => {
      // 水平 120 > 垂直 80 → 水平方向（左滑）
      const r = __test.handleSwipe(
        { clientX: 200, clientY: 100 },
        { clientX: 80, clientY: 180 }
      );
      expect(r).not.toBeNull();
      expect(r.direction).toBe("left");
      expect(r.distance).toBe(120);
    });

    it("对角线滑动取主要方向（垂直距离>水平距离→垂直方向）", () => {
      // 垂直 150 > 水平 60 → 垂直方向（上滑）
      const r = __test.handleSwipe(
        { clientX: 100, clientY: 250 },
        { clientX: 160, clientY: 100 }
      );
      expect(r).not.toBeNull();
      expect(r.direction).toBe("up");
      expect(r.distance).toBe(150);
    });

    it("非法输入（null/undefined）返回 null（防御性）", () => {
      expect(__test.handleSwipe(null, { clientX: 100, clientY: 100 })).toBeNull();
      expect(__test.handleSwipe({ clientX: 100, clientY: 100 }, null)).toBeNull();
      expect(__test.handleSwipe(undefined, undefined)).toBeNull();
    });

    it("缺失坐标属性时按 0 处理（防御性）", () => {
      // touchStart 无 clientX/Y → 按 0；touchEnd (60,0) → 右滑 60px
      const r = __test.handleSwipe({}, { clientX: 60, clientY: 0 });
      expect(r).not.toBeNull();
      expect(r.direction).toBe("right");
      expect(r.distance).toBe(60);
    });
  });

  // ===== swipeToScene：场景切换（纯函数） =====
  describe("swipeToScene - 场景切换", () => {
    it("swipeToScene 是函数", () => {
      expect(typeof __test.swipeToScene).toBe("function");
    });

    it("左滑切换到下一个场景（按 ORDER 顺序）", () => {
      // 断言改为从 ORDER 推导，避免每次增删场景都要手改期望值
      const order = __test.ORDER;
      for (let i = 0; i < order.length - 1; i++) {
        expect(__test.swipeToScene("left", order[i])).toBe(order[i + 1]);
      }
    });

    it("右滑切换到上一个场景（按 ORDER 顺序）", () => {
      const order = __test.ORDER;
      for (let i = 1; i < order.length; i++) {
        expect(__test.swipeToScene("right", order[i])).toBe(order[i - 1]);
      }
    });

    it("最后一个场景左滑不越界（保持末位场景）", () => {
      const last = __test.ORDER[__test.ORDER.length - 1];
      expect(__test.swipeToScene("left", last)).toBe(last);
    });

    it("第一个场景右滑不越界（office → office）", () => {
      expect(__test.swipeToScene("right", "office")).toBe("office");
    });

    it("上下滑动不切换场景（保持当前）", () => {
      expect(__test.swipeToScene("up", "office")).toBe("office");
      expect(__test.swipeToScene("down", "code")).toBe("code");
      expect(__test.swipeToScene("up", "life")).toBe("life");
    });

    it("非 ORDER 场景（overview/stats）保持当前", () => {
      expect(__test.swipeToScene("left", "overview")).toBe("overview");
      expect(__test.swipeToScene("right", "stats")).toBe("stats");
    });

    it("非法场景键保持当前（防御性）", () => {
      expect(__test.swipeToScene("left", "unknown")).toBe("unknown");
      expect(__test.swipeToScene("right", "")).toBe("");
    });
  });

  // ===== isMobile / isMobileLandscape：移动端检测 =====
  describe("isMobile / isMobileLandscape - 移动端检测", () => {
    it("isMobile 是函数", () => {
      expect(typeof __test.isMobile).toBe("function");
    });

    it("isMobileLandscape 是函数", () => {
      expect(typeof __test.isMobileLandscape).toBe("function");
    });

    it("jsdom 默认 innerWidth=1024 → isMobile() 返回 false（测试环境不绑手势）", () => {
      // jsdom 默认窗口宽度 1024，不属于移动端
      expect(__test.isMobile()).toBe(false);
    });

    it("innerWidth<768 时 isMobile() 返回 true", () => {
      const orig = win.innerWidth;
      Object.defineProperty(win, "innerWidth", { value: 375, configurable: true });
      expect(__test.isMobile()).toBe(true);
      Object.defineProperty(win, "innerWidth", { value: orig, configurable: true });
    });

    it("innerWidth<768 且 innerHeight<innerWidth 时 isMobileLandscape() 返回 true", () => {
      const origW = win.innerWidth;
      const origH = win.innerHeight;
      Object.defineProperty(win, "innerWidth", { value: 667, configurable: true });
      Object.defineProperty(win, "innerHeight", { value: 375, configurable: true });
      expect(__test.isMobileLandscape()).toBe(true);
      Object.defineProperty(win, "innerWidth", { value: origW, configurable: true });
      Object.defineProperty(win, "innerHeight", { value: origH, configurable: true });
    });

    it("竖屏移动端 isMobileLandscape() 返回 false", () => {
      const origW = win.innerWidth;
      const origH = win.innerHeight;
      Object.defineProperty(win, "innerWidth", { value: 375, configurable: true });
      Object.defineProperty(win, "innerHeight", { value: 667, configurable: true });
      expect(__test.isMobileLandscape()).toBe(false);
      Object.defineProperty(win, "innerWidth", { value: origW, configurable: true });
      Object.defineProperty(win, "innerHeight", { value: origH, configurable: true });
    });
  });

  // ===== applyLandscapeFold：横屏自动折叠 =====
  describe("applyLandscapeFold - 横屏自动折叠侧边栏", () => {
    it("applyLandscapeFold 是函数", () => {
      expect(typeof __test.applyLandscapeFold).toBe("function");
    });

    it("横屏移动端调用 applyLandscapeFold 后 #side 加 .collapsed 类", () => {
      const origW = win.innerWidth;
      const origH = win.innerHeight;
      Object.defineProperty(win, "innerWidth", { value: 667, configurable: true });
      Object.defineProperty(win, "innerHeight", { value: 375, configurable: true });
      __test.render(); // 先渲染确保 #side 存在
      const side = win.document.getElementById("side");
      side.classList.remove("collapsed");
      __test.applyLandscapeFold();
      expect(side.classList.contains("collapsed")).toBe(true);
      Object.defineProperty(win, "innerWidth", { value: origW, configurable: true });
      Object.defineProperty(win, "innerHeight", { value: origH, configurable: true });
    });

    it("竖屏移动端且用户未手动折叠时 applyLandscapeFold 移除 .collapsed", () => {
      const origW = win.innerWidth;
      const origH = win.innerHeight;
      Object.defineProperty(win, "innerWidth", { value: 375, configurable: true });
      Object.defineProperty(win, "innerHeight", { value: 667, configurable: true });
      __test.render();
      const side = win.document.getElementById("side");
      side.classList.add("collapsed");
      // 清除用户手动折叠标记
      win.localStorage.removeItem(__test.PREFIX + "sideCollapsed");
      __test.applyLandscapeFold();
      expect(side.classList.contains("collapsed")).toBe(false);
      Object.defineProperty(win, "innerWidth", { value: origW, configurable: true });
      Object.defineProperty(win, "innerHeight", { value: origH, configurable: true });
    });
  });

  // ===== CSS 静态检查：触摸目标 + 微交互 + 横屏适配 =====
  describe("CSS 静态检查 - 触摸优化 + 微交互 + 横屏适配", () => {
    let cssText;
    beforeEach(() => {
      // 读取内联 CSS 文本做静态断言
      const styleEl = win.document.querySelector("style");
      cssText = styleEl ? styleEl.textContent : "";
    });

    it("移动端媒体查询内所有可点击元素 min-height:44px", () => {
      // 在 @media(max-width:767px) 块内应有 min-height:44px 声明
      expect(cssText).toMatch(/@media\(max-width:767px\)/);
      expect(cssText).toMatch(/min-height:44px/);
      expect(cssText).toMatch(/min-width:44px/);
    });

    /* ⚠️ 上面那条只证明"块里有某个 44px"，**不证明覆盖面** —— 这条触控规则是逐个类名点名的，
       所以每加一种新控件都可能漏网。v3.7.61 用户截图标注的"上下高度不一致"正是这么漏的：
       自研下拉的可见触发框 `<button class="ds-trigger">` 不在 `input, select, textarea` 里，
       于是窄屏下同排 input 44px、它仍 38px（原生 select 是 position:absolute 的隐藏控件，
       给它加高度对画面毫无作用）。下面这条把"点名清单"钉住，防同类回潮。 */
    it("≤767 的 44px 触控规则点名清单覆盖所有表单可见控件类（v3.7.61）", () => {
      /* ⚠️ 全文件有**多个** @media(max-width:767px) 块（触控尺寸那块只是其一），
         必须 filter 后合并 —— 用 find 只取第一条会静默漏掉真正的规则。 */
      const blocks = mediaBlocks(cssText).filter(b => /max-width:\s*767px/.test(b.query));
      expect(blocks.length, "应存在 @media(max-width:767px) 块").toBeGreaterThan(0);
      /* 先剥注释，再按「最内层 selector{decls}」切块 —— 媒体块里没有嵌套规则，切出来的
         第一段就是选择器列表。不能用 `[^{}]+{[^}]*min-height` 那种一步式正则：
         `[^}]*` 跨不过上一条规则的 `}`，会把选择器错配到别处。 */
      const body = blocks.map(b => b.body).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
      const covered = [];
      const re = /([^{}]+)\{([^{}]*)\}/g;
      let mm;
      while ((mm = re.exec(body))) {
        if (!/min-height:\s*44px/.test(mm[2])) continue;
        for (const s of mm[1].split(",")) {
          const sel = s.replace(/\s+/g, " ").trim();
          if (sel) covered.push(sel);
        }
      }
      expect(covered.length, "没从 ≤767 块里解析出任何 44px 规则，测试本身失效").toBeGreaterThan(5);
      for (const sel of ["input", "select", "textarea", ".ds-trigger", ".addbtn", ".tbtn", ".set-nav-btn", ".kbtns button"]) {
        expect(covered, `触控规则漏了 ${sel}（已点名：${covered.join(" | ")}）`).toContain(sel);
      }
      /* 聊天输入行的模型下拉与同排 附件/发送/输入框 统一 42（v3.7.37 定稿），
         不能被 44 那条拉走 —— 这条例外必须显式存在 */
      expect(body, "缺聊天面板模型下拉的 42px 例外（会把整行拉歪）")
        .toMatch(/\.ds-select:has\(>#chatModelSelect\)>\.ds-trigger\{[^}]*min-height:42px/);
    });

    it("iOS 平滑滚动 -webkit-overflow-scrolling:touch 已启用", () => {
      expect(cssText).toMatch(/-webkit-overflow-scrolling:touch/);
    });

    it("底部导航 active 指示器：.nav-item.active::before 伪元素 + nav-indicator 动画", () => {
      expect(cssText).toMatch(/\.nav-item\.active::before/);
      expect(cssText).toMatch(/@keyframes nav-indicator/);
    });

    it("点击涟漪效果：.ripple 类 + ripple-anim 动画", () => {
      expect(cssText).toMatch(/\.ripple/);
      expect(cssText).toMatch(/@keyframes ripple-anim/);
    });

    it("横屏适配媒体查询：@media(max-width:767px) and (orientation:landscape)", () => {
      expect(cssText).toMatch(/@media\(max-width:767px\) and \(orientation:landscape\)/);
    });

    it("横屏时看板恢复 2 列（grid-template-columns:1fr 1fr）", () => {
      // 横屏块内应有 2 列看板
      expect(cssText).toMatch(/grid-template-columns:1fr 1fr/);
    });
  });

  // ===== 导出完整性 =====
  describe("__test 导出完整性", () => {
    it("handleSwipe 已导出到 window.__test", () => {
      expect(__test.handleSwipe).toBe(win.handleSwipe);
    });

    it("swipeToScene 已导出到 window.__test", () => {
      expect(__test.swipeToScene).toBe(win.swipeToScene);
    });

    it("isMobile / isMobileLandscape / applyLandscapeFold 已导出", () => {
      expect(__test.isMobile).toBe(win.isMobile);
      expect(__test.isMobileLandscape).toBe(win.isMobileLandscape);
      expect(__test.applyLandscapeFold).toBe(win.applyLandscapeFold);
    });
  });
});