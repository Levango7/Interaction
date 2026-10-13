/**
 * contrast-pairs.cjs —— 关键前景/背景令牌配对（项目适配层：各项目覆盖写这里）
 * ----------------------------------------------------------------------------
 * 口径：键为人类可读名称，值为 [前景令牌, 背景令牌]（CSS 自定义属性名，含 -- 前缀）。
 * 测量方式：内核 readPairs() 经 getComputedStyle(documentElement).getPropertyValue()
 * 读令牌的**声明原文**（本项目为 hex，不是计算后的 rgba()），再交给 WCAG 对比度
 * 计算（内核 contrast.js 的解析器支持 #rgb / #rrggbb / rgb() / rgba() 四种写法）。
 *
 * 选配对的原则：覆盖高频前景的五类 —— 正文（text）、弱化（muted）、主色按钮上的字
 * （on-accent）、危险色（danger）、主色本体（accent）—— 配两个背景基底（panel/bg）。
 * 漏配一类，该类的「字看不见了」就没人管。
 *
 * Interaction pilot 口径：原样搬自 tests/e2e/theme-matrix.spec.js（v3.7.52 起稳定）。
 * 其他项目接入：换成自己项目的关键 UI 令牌；**新增配对必须同步补
 * contrast-baseline.cjs**，否则对比度用例会报「基线表缺少配对」。
 */
const CONTRAST_PAIRS = {
  "text/panel": ["--text", "--panel"],
  "text/bg": ["--text", "--bg"],
  "muted/panel": ["--muted", "--panel"],
  "on-accent/accent": ["--on-accent", "--accent"],
  "danger/panel": ["--danger", "--panel"],
  "accent/panel": ["--accent", "--panel"]
};

module.exports = { CONTRAST_PAIRS };
