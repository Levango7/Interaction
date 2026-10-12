/**
 * icon-scan.mjs —— 「字符当图标」判定的纯函数层
 * ----------------------------------------------------------------------------
 * 供 `scripts/lint-icons.mjs` 与单元测试共用（同 lib/empty-catch.mjs 的分工：
 * 判定在这里，CLI 只管参数/基线/退出码）。**测试直接 import 本文件调纯函数，
 * 不 spawn CLI** —— 本机沙箱的 execFileSync 一律 EBUSY。
 *
 * 背景：项目 P0 规则要求「图标必须是统一描边、可矢量缩放的 SVG 方案」，但代码里
 * 长期存在用字符字形充当功能图标的地方（`☰` 订阅源、`⚙` 编辑布局、`✓` 保存、
 * `✕` 关闭）。这类写法的实际危害不是"不好看"，而是：
 *   · 字形随字体变（不同平台/字号下宽度、粗细、基线都不同，对不齐）；
 *   · 不可参与 `stroke-width` / `currentColor` 等描边与配色规范；
 *   · 屏幕阅读器会把 `☰` 念成"三叉戟"之类，与功能语义脱节。
 *
 * 两条判定轴（与 empty-catch 门禁同构：**分级不是为了数数，是为了定优先级**）：
 *   P0 = 按钮内容**只有**符号 —— 用户没有任何文字线索，只能靠字形猜功能，最该修；
 *   P1 = 符号与文字**混排**（如「⚙ 编辑布局」）—— 文字仍可兜底，次优先。
 *
 * 为什么只扫 <button>：
 *   `→`（链式连接符）、`●`（状态点）等落在 <span class="arr"> / <span class="u-text-ok">
 *   里的符号属**排版符号**，不是"用户借它识别按钮功能"的图标；把它们一并算违规会让
 *   门禁一上线就红一片、且逼着把排版符号也换成 SVG（那是过度设计）。
 *   判据就一句：**这个符号是不是"按钮唯一的内容"**。
 */

/* 常被当作功能图标用的单色符号字形：箭头 / 技术符号 / 几何形状 / dingbat。
   刻意**不含** CJK 标点与被广泛接受的排版符号（…、·、—），那些不是图标候选。
   也**不含**变体选择符 U+FE00-FE0F —— 那个归 EMOJI_CLASS（语义上属于 emoji 修饰）。 */
export const SYMBOL_CLASS = /[\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF]/;

/* emoji 范围（与团队 P0 规则给出的检测正则一致）+ ZWJ + 键帽 + 变体选择符。 */
export const EMOJI_CLASS = /[\u{1F000}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}\uFE00-\uFE0F]/u;

/* <button ...>内容</button>。内容用非贪婪 + 长度上限：
   非贪婪足以在正常模板里停在最近的闭合标签；上限是防御"漏了闭合标签"时
   把后面几千行整个吞进来（那会产出巨大的假阳性与极慢的正则回溯）。 */
const BUTTON_RE = /<button\b[^>]*>([\s\S]{0,400}?)<\/button>/g;

const isIconChar = (ch) => SYMBOL_CLASS.test(ch) || EMOJI_CLASS.test(ch);

/**
 * 扫描一段源码，返回全部「按钮内容含符号字形」的条目。
 * @param {string} raw  源文件内容
 * @param {string} file 文件名（用于 key/报告）
 * @returns {Array<{file:string,line:number,sig:string,occ:number,level:string,why:string,text:string}>}
 */
export function scanSource(raw, file) {
  const items = [];
  const occSeen = {};
  for (const m of raw.matchAll(BUTTON_RE)) {
    const inner = m[1];
    if (!inner) continue;
    /* 已经是 SVG 图标 → 合规，直接跳过（这是本项目期望的写法） */
    if (/<svg/i.test(inner)) continue;

    /* 去掉内部标签后的可见文本（<span class="nm">保存</span> → 保存） */
    const text = inner.replace(/<[^>]*>/g, "").trim();
    if (!text) continue;

    /* 过滤字符串拼接残渣：内容里出现 `' +` / `+ t(` 说明这是被切开的源码片段，
       提取出的"文本"并不等于最终渲染内容。实测若不滤，`← ' + t("auth.back","返回") + '`
       会被记成一处假 P1 —— 门禁报噪音就会失去信任，宁可漏报不可误报。 */
    if (/' *\+|\+ *t\(|\+ *UI_ICONS/.test(text)) continue;

    const bare = text.replace(/\s/g, "");
    if (!bare) continue;
    if (![...bare].some(isIconChar)) continue;      // 无符号 → 正常按钮
    if (![...bare].every(isIconChar)) {
      /* 符号与文字混排：只有当符号**位于开头**才算"图标位"。
         句中出现的符号（如「保存 (Ctrl+S)」里的括号）不算图标，避免误报。 */
      if (!isIconChar(bare[0])) continue;
    }

    const level = [...bare].every(isIconChar) ? "P0" : "P1";
    const line = raw.slice(0, m.index).split("\n").length;
    const sig = text.slice(0, 24);
    occSeen[sig] = (occSeen[sig] || 0) + 1;
    items.push({
      file,
      line,
      sig,
      occ: occSeen[sig],
      level,
      why:
        level === "P0"
          ? "按钮内容只有符号字形 —— 用户只能靠字形猜功能，应换成 UI_ICONS 的 SVG"
          : "按钮内容以符号字形开头 —— 文字可兜底，仍建议换成 SVG 图标",
      text: text.slice(0, 40),
    });
  }
  return items;
}

/** 基线比较用的稳定键（同 empty-catch：file + sig + 出现序号）。 */
export const keyOf = (it) => it.file + ":" + it.sig + "#" + (it.occ || 1);
