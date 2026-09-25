/**
 * ui-spec-guards.test.js —— 统一设计规范（docs/ui-standards.md）的三处空洞守护
 * ----------------------------------------------------------------------------
 * 起因：v3.7.48 做全站 UI 规范梳理时，盘查了 12 个已有的「规范类测试」，
 *   发现三个维度**完全没有自动化守护**，规范文档写了也没人管：
 *
 *   ① **图标尺寸体系**（§4.2）—— 令牌定义了 --icon-sm/md/lg，但零使用约束。
 *      实测站内有 5 档图标（16/20/18/15/12），令牌管不住其中 2 档。
 *   ② **几何令牌的具体数值**（§3/§9.5）—— 已有测试只断言 --label-h 等「是数字+px」，
 *      没钉死具体值。改错成 99px 也不会红。而 --control-h:38px 是钉死的（口径不一致）。
 *   ③ **半档间距令牌**（§1.4）—— --space-1h:6px / --space-2h:10px 是正式收编的
 *      高频设计值，但 design-tokens.test.js 只钉了整档 1~8，半档可被静默删除。
 *
 * 本文件的定位：**钉住「规范里写死的数值」**，防止它们悄悄漂移。
 * 注意：只钉「规范文档明确承诺的常数」，不钉「实现细节」——
 * 后者由各自的功能测试负责（改实现必须同步改断言）。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mediaBlocks } from "./helpers/media-blocks.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");

/**
 * 从 :root 块里取令牌值（只取 light 默认态，避免被主题覆盖值干扰）
 *
 * ⚠️ 正则必须**排除行内注释**：本文件的令牌定义常写成
 *   `--space-1:4px; --space-1h:6px; … /* 6px 是徽标微间隙… *​/`
 * 若直接匹配到行尾，会把后面的注释文本一起吞进来（本次实测踩到两次：
 *   先是 `[^;]+` 吞了 `/* … *​/`，收紧成 `[^;/]+` 后又被中文破折号 `——` 带出的注释吞掉）。
 * → 值只取「数字 + 单位」这个最小形状，注释再也进不来。
 */
function rootToken(name) {
  const key = name.replace(/^--/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = HTML.match(new RegExp("--" + key + "\\s*:\\s*([\\d.]+(?:px|rem|em|%|vh|vw|ch))"));
  return m ? m[1].trim() : null;
}

/* ═══════════════════════════════════════════════════════════════════════
   ① 图标尺寸体系（ui-standards §4.2）
   ═══════════════════════════════════════════════════════════════════════ */
describe("图标三档制：令牌齐备且按层级取用", () => {
  it("--icon-sm / --icon-md / --icon-lg 三档齐备", () => {
    const want = { "--icon-sm": "16px", "--icon-md": "20px", "--icon-lg": "24px" };
    for (const [k, v] of Object.entries(want)) {
      expect(rootToken(k), k + " 应在 :root 定义").toBeTruthy();
      expect(rootToken(k), k + " 的值应钉死为 " + v).toBe(v);
    }
  });

  it("三档必须递增（16 < 20 < 24）—— 防止有人把某档改成更小的值而层级语义崩塌", () => {
    const n = s => parseInt(s, 10);
    const sm = n(rootToken("--icon-sm")), md = n(rootToken("--icon-md")), lg = n(rootToken("--icon-lg"));
    expect(sm).toBeLessThan(md);
    expect(md).toBeLessThan(lg);
  });

  it("UI_ICONS 与注入助手 ic() 存在（图标必须走统一库，不许手写 svg 拼文字旁）", () => {
    expect(HTML).toMatch(/const\s+UI_ICONS\s*=\s*\{/);
    expect(HTML).toMatch(/function\s+ic\s*\(/);
    expect(HTML).toContain("ic-inline");
  });

  /* 页面级标识图标（.ph-ic 32px）是布局尺寸，明确豁免于三档之外 —— 见规范 §4.2「例外」。
     这条断言把这个豁免写死：若有人把它改成 --icon-* 令牌（或改回别的 px），这里会红。 */
  it("页面标识 .ph-ic 保持 32px（布局尺寸，明确豁免于图标三档）", () => {
    const m = HTML.match(/\.page-head\s+\.ph-ic\s*\{[^}]*width\s*:\s*(\d+)px/);
    expect(m, ".page-head .ph-ic 应有 width 定义").toBeTruthy();
    expect(m[1], "页面标识图标尺寸（规范 §10.1）").toBe("32");
  });

  /* ── v3.7.49 新增：--icon-set 令牌（设置页图标容器专用档） ──────────────
     背景：真实渲染的图标中 18px 有 12 处，全部来自 .set-ic svg 一条硬编码规则。
     它不是散落混乱，而是"容器 36px + 内图标 18px"的成对几何 —— 故单列一档收编，
     而不是强行并入 sm(16)/md(20)（并进去会让图标在 36px 容器里显小）。 */
  describe("--icon-set 第四档（设置页图标容器专用）", () => {
    it("--icon-set 在 :root 定义为 18px", () => {
      expect(rootToken("--icon-set"), "--icon-set 应在 :root 定义").toBeTruthy();
      expect(rootToken("--icon-set"), "--icon-set 的值应钉死为 18px").toBe("18px");
    });

    it("--icon-set 介于 sm(16) 与 md(20) 之间 —— 它是「中间档」的正式收编", () => {
      const n = s => parseInt(s, 10);
      const sm = n(rootToken("--icon-sm")), set = n(rootToken("--icon-set")), md = n(rootToken("--icon-md"));
      expect(sm, "--icon-set 必须大于 sm").toBeLessThan(set);
      expect(set, "--icon-set 必须小于 md").toBeLessThan(md);
    });

    it(".set-ic{width:36px} 与 .set-ic svg 用 --icon-set —— 容器/图标成对，改一个必改另一个", () => {
      const box = HTML.match(/\.set-ic\{[^}]*width\s*:\s*(\d+)px/);
      expect(box, ".set-ic 应有 width 定义").toBeTruthy();
      expect(box[1], "设置页图标容器尺寸").toBe("36");
      const svgRule = HTML.match(/\.set-ic\s+svg\s*\{([^}]*)\}/);
      expect(svgRule, ".set-ic svg 规则应存在").toBeTruthy();
      expect(svgRule[1], ".set-ic svg 必须用 --icon-set 令牌").toContain("var(--icon-set)");
    });

    it("禁止再出现硬编码 18px 的图标尺寸（收编后必须走令牌）", () => {
      /* 18px 是「图标中间档」的正式收编档（--icon-set）。
         但 18px 在非图标语境下是合法的几何值，必须逐条豁免 ——
         否则会误伤，且无法表达"哪些 18px 是被允许的"。 */
      const ALLOWED = [
        ".ov4-badge",        // 通知徽标：min-width 撑椭圆，非图标
        ".todo-chk",         // 原生复选框：浏览器绘制，非 svg 图标
        ".pet .pet-close",   // 桌宠关闭键：圆形按钮，非图标
      ];
      /* 逐行扫描所有 width:18px;height:18px（含 min-width 变体） */
      const lines = HTML.split("\n");
      const bad = [];
      lines.forEach((ln, i) => {
        if (!/(width|height)\s*:\s*18px\s*;\s*(width|height)\s*:\s*18px/.test(ln)) return;
        if (ALLOWED.some(a => ln.includes(a))) return;   // 命中白名单 → 放行
        bad.push("L" + (i + 1) + ": " + ln.trim().slice(0, 80));
      });
      expect(bad, "硬编码 18px 图标尺寸应改为 var(--icon-set)（新增豁免需在 ALLOWED 登记）").toEqual([]);
    });

    it("豁免清单自身有效：三条豁免确为「非图标」几何（防止清单腐化）", () => {
      /* 若某条豁免的选择器在源码里消失，说明它被删/改名了 —— 清单该同步收缩，
         否则 ALLOWED 会变成"永久免死金牌"，掩护真的回归。 */
      for (const sel of [".ov4-badge", ".todo-chk", ".pet .pet-close"]) {
        expect(HTML, "豁免选择器应仍存在于源码：" + sel).toContain(sel);
      }
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   ② 几何令牌的具体数值（ui-standards §3 / §9.5）
   ═══════════════════════════════════════════════════════════════════════ */
describe("几何令牌：具体数值钉死（此前只断言「是 px」，改错不会红）", () => {
  it("控件高度两档：--control-h=38px / --control-h-sm=28px", () => {
    expect(rootToken("--control-h")).toBe("38px");
    expect(rootToken("--control-h-sm")).toBe("28px");
  });

  it("表单垂直节奏：--label-h=18px / --field-msg-h=16px（出错不许跳动）", () => {
    expect(rootToken("--label-h"), "标签行高（规范 §9.5）").toBe("18px");
    expect(rootToken("--field-msg-h"), "提示行高（规范 §9.5）").toBe("16px");
  });

  it("键值行标签列宽：--label-col-w=88px", () => {
    expect(rootToken("--label-col-w"), "键值行标签列宽（规范 §9.6）").toBe("88px");
  });

  it("表单控件圆角：--control-r=12px", () => {
    expect(rootToken("--control-r"), "表单控件专属圆角（规范 §5.1）").toBe("12px");
  });

  it("顶栏高度：--topbar-h=54px（全断点一致；移动端按钮 44px 时仍 54px）", () => {
    expect(rootToken("--topbar-h")).toBe("54px");
  });

  /* 几何令牌只在 :root —— 本轮把「主题不得重复声明」的范围从 --label-col-w 一条
     扩到全部几何令牌（此前只守了一条，其余可被逐主题抄漏而不报错）。 */
  it("所有几何令牌只在 :root 定义，主题块不得重复声明", () => {
    const GEO = ["--control-h", "--control-h-sm", "--control-r", "--label-h", "--field-msg-h", "--label-col-w",
      "--icon-sm", "--icon-md", "--icon-lg", "--icon-set", "--topbar-h"];
    /* 切成「:root{...}」与「:root[data-theme=X]{...}」块，只看后者里有没有几何令牌 */
    const blocks = [...HTML.matchAll(/:root\[data-theme="(\w+)"\]\{([\s\S]*?)\n\}/g)];
    const bad = [];
    for (const [, th, body] of blocks) {
      for (const tk of GEO) {
        if (new RegExp("--" + tk.replace(/^--/, "") + "\\s*:").test(body)) bad.push(th + " 重复声明 " + tk);
      }
    }
    expect(bad, "几何令牌应只在 :root（规范 §1.2）").toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   ③ 半档间距令牌（ui-standards §1.4 / §2）
   ═══════════════════════════════════════════════════════════════════════ */
describe("间距体系：整档 + 半档都钉死（半档此前完全无守护）", () => {
  it("整档 8 个：--space-1..8 = 4/8/12/16/20/24/28/32", () => {
    const want = { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "20px", 6: "24px", 7: "28px", 8: "32px" };
    for (const [n, v] of Object.entries(want)) {
      expect(rootToken("--space-" + n), "--space-" + n).toBe(v);
    }
  });

  it("★半档 2 个：--space-1h=6px / --space-2h=10px（正式收编的高频设计值，不是临时补丁）", () => {
    expect(rootToken("--space-1h"), "半档 6px（徽标微间隙）").toBe("6px");
    expect(rootToken("--space-2h"), "半档 10px（按钮横向留白）").toBe("10px");
  });

  it("半档值必须落在相邻整档之间（1h 在 1 与 2 之间；2h 在 2 与 3 之间）", () => {
    const n = s => parseInt(s, 10);
    expect(n(rootToken("--space-1"))).toBeLessThan(n(rootToken("--space-1h")));
    expect(n(rootToken("--space-1h"))).toBeLessThan(n(rootToken("--space-2")));
    expect(n(rootToken("--space-2"))).toBeLessThan(n(rootToken("--space-2h")));
    expect(n(rootToken("--space-2h"))).toBeLessThan(n(rootToken("--space-3")));
  });

  it("间距阶梯全部是 4px 基线的整数倍或半档（无 3/5/7/9px 这类幽灵值）", () => {
    const names = ["--space-1", "--space-1h", "--space-2", "--space-2h", "--space-3", "--space-4",
      "--space-5", "--space-6", "--space-7", "--space-8"];
    const vals = names.map(rootToken);
    vals.forEach((v, i) => {
      expect(v, names[i] + " 应有定义").toBeTruthy();
      const px = parseInt(v, 10);
      /* 允许整档（4 的倍数）与半档（6/10，即 4n+2） */
      expect(px % 4 === 0 || px % 2 === 0, names[i] + "=" + v + " 不在 4px 基线体系内").toBe(true);
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   ④ 字号阶梯（ui-standards §4.1）—— 整梯钉死
   ═══════════════════════════════════════════════════════════════════════ */
describe("字号阶梯：九档钉死", () => {
  it("--fs-3xs..--fs-2xl 全部有定义且值正确", () => {
    const want = {
      "--fs-3xs": "10px", "--fs-2xs": "11px", "--fs-xs": "13px", "--fs-sm": "14px",
      "--fs-base": "15px", "--fs-md": "16px", "--fs-lg": "18px", "--fs-xl": "20px", "--fs-2xl": "24px"
    };
    for (const [k, v] of Object.entries(want)) {
      expect(rootToken(k), k).toBe(v);
    }
  });

  it("阶梯严格递增（防止某档被改成同值/倒序，导致层级语义失效）", () => {
    const names = ["--fs-3xs", "--fs-2xs", "--fs-xs", "--fs-sm", "--fs-base", "--fs-md", "--fs-lg", "--fs-xl", "--fs-2xl"];
    const px = names.map(n => parseInt(rootToken(n), 10));
    for (let i = 1; i < px.length; i++) {
      expect(px[i], names[i] + " 应大于 " + names[i - 1]).toBeGreaterThan(px[i - 1]);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   ⑤ 断点体系（ui-standards §8.1）—— 四档 + 不新增
   ═══════════════════════════════════════════════════════════════════════ */
describe("断点体系：四档制，不得新增", () => {
  /** 收集全部媒体查询里的宽度值 */
  const widths = new Set();
  for (const m of HTML.matchAll(/@media[^{]*?\((?:max|min)-width\s*:\s*(\d+)px\)/g)) widths.add(m[1]);

  it("四个主档齐备：1440 / 1023 / 1024 / 767", () => {
    ["1440", "1023", "1024", "767"].forEach(w => {
      expect(widths.has(w), "主断点 " + w + "px 应存在（规范 §8.1）").toBe(true);
    });
  });

  /* 细分档：520（表单退 2 列）、600（特种布局）、479（极窄屏顶栏纯图标）、359（极窄兜底）。
     它们是「同一档内的细分」，不算新增档位 —— 规范 §8.1 明确允许。
     v3.7.48 收敛：历史 879 → 1023、519 → 520（见规范附录 C4 与源码注释）。 */
  it("细分档只有 520 / 600 / 479 / 359", () => {
    const KNOWN_SEGMENTS = new Set(["520", "600", "479", "359"]);
    const MAIN = new Set(["1440", "1439", "1024", "1023", "768", "767"]);
    const unknown = [...widths].filter(w => !KNOWN_SEGMENTS.has(w) && !MAIN.has(w));
    expect(unknown, "出现未登记的断点值（规范 §8.1：不得引入新断点；历史债务见附录 C4）")
      .toEqual([]);
  });

  it("历史债务断点 879 / 519 已收敛（不得回潮）", () => {
    expect(widths.has("879"), "879px 应已并入 1023（规范附录 C4）").toBe(false);
    expect(widths.has("519"), "519px 应已并入 520（规范附录 C4）").toBe(false);
  });

  /* 🔴 v3.7.48 实测揪出的真缺陷：断点收敛后 #recForm 在窄屏列宽塌成 0px。
     根因是「固定列位（grid-column:1/4、grid-column:4）在列数变少时越界」，
     Grid 因此造出隐式列，把真实列挤成 0px（CDP 实测 768px → `0px 0px 138px 38px`）。
     修法是**同特异性成对解除** grid-column + grid-row（只解 column 会被残留 row 钉住）。
     这条守护钉住「越界列位必须有对应的解除」—— 见 MEMORY §5.4、规范附录 C11。 */
  describe("#recForm 固定列位在窄屏必须成对解除（防隐式列塌陷）", () => {
    const blocks = mediaBlocks(HTML);

    /** 取指定断点块里所有规则的拼接文本 */
    const at = (px) => blocks
      .filter(b => new RegExp("max-width:\\s*" + px + "px").test(b.query))
      .map(b => b.body).join("\n");

    it("1023 块里 textarea 字段与加号都回归自动列位", () => {
      const body = at(1023);
      expect(body, "≤1023 应有 textarea 字段的列位解除").toMatch(
        /#recForm>\.fld:has\(>textarea\)\{grid-column:auto;grid-row:auto\}/);
      expect(body, "≤1023 应有加号的列位解除").toMatch(
        /#recForm>\.add-wrap\{grid-column:auto;grid-row:auto\}/);
    });

    it("520 块里同样成对解除", () => {
      const body = at(520);
      expect(body).toMatch(/#recForm>\.fld:has\(>textarea\)\{grid-column:auto;grid-row:auto\}/);
      expect(body).toMatch(/#recForm>\.add-wrap\{grid-column:auto;grid-row:auto\}/);
    });

    it("解除必须同特异性（#recForm 前缀不能省，否则压不过 id 规则）", () => {
      const body = at(1023) + at(520);
      /* 不许出现「无 #recForm 前缀」的解除写法 */
      expect(body, "解除规则必须带 #recForm 前缀（同特异性才生效）")
        .not.toMatch(/(^|[^>\w.#])\.fld:has\(>textarea\)\{grid-column:auto/);
    });
  });
});
