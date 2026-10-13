/**
 * contrast-baseline.cjs —— 对比度阈值表（项目适配层：各项目覆盖写这里）
 * ----------------------------------------------------------------------------
 * 判定口径（重要，不要照抄 WCAG 4.5）：
 *   阈值 = max(ABS_FLOOR, 基线 × TOLERANCE)，其中 ABS_FLOOR = 1.5、TOLERANCE = 0.9
 *   由内核 contrast.js 导出。即「允许 10% 抖动，退步超过一成就红」。
 *   为什么不直接断言 4.5:1：若现状某项本就低于理想值，直接断言会造成**基线红**，
 *   之后真正的新回归被淹没在「一直红」里。先用实测定基线把「退步」精确抓住，
 *   比追求理想值更有用；理想值由设计侧单独推动（theme-matrix 的低对比度清单即此用途）。
 *
 * 基线来源（Interaction pilot）：本机 Playwright 实测（2026-09-24 首测；v3.7.52 随
 *   「场景色令牌化 + 弱色阶提档 + -text 系列落地」的配色改版更新）。
 *   v3.7.52 起 muted/panel 与 on-accent/accent 两类整体上台阶（例：forest muted
 *   2.61→4.64、mist muted 2.82→4.63、dark on-accent 2.82→4.68、sepia on-accent
 *   2.54→4.61），基线随之上调，避免「已经修好了又慢慢退回去」却不报警。
 *   本表与 tests/e2e/theme-matrix.spec.js 内的 BASELINE 同源同值 —— 改基线时两边同步。
 *
 * 新项目怎么定基线（首轮）：
 *   ① 先把本表留空 {}，跑一次对比度用例 —— 会失败，但失败信息里带每项的实测值与建议基线；
 *   ② 实测值同时落盘 _probe/contrast-matrix.txt（用例先落盘后断言，失败也有数据）；
 *   ③ 把每项「实测值 × 0.9」填进本表，重跑至全绿。
 *
 * 调基线纪律：只允许因「实测确认的配色改版」调整，且必须在提交信息里说明原因；
 *   不许为了变绿而下调 —— 那是把门拆了再通过，属测试作弊（反作弊规范明令禁止）。
 */
const CONTRAST_BASELINE = {
  light:  { "text/panel": 18.88, "text/bg": 14.34, "muted/panel": 6.19, "on-accent/accent": 5.23, "danger/panel": 4.56, "accent/panel": 5.23 },
  dark:   { "text/panel": 12.47, "text/bg": 15.22, "muted/panel": 5.28, "on-accent/accent": 4.68, "danger/panel": 5.02, "accent/panel": 4.95 },
  sepia:  { "text/panel": 7.94,  "text/bg": 7.52,  "muted/panel": 5.39, "on-accent/accent": 4.61, "danger/panel": 4.88, "accent/panel": 2.28 },
  elegant:{ "text/panel": 13.00, "text/bg": 10.90, "muted/panel": 5.49, "on-accent/accent": 4.66, "danger/panel": 4.15, "accent/panel": 4.02 },
  aurora: { "text/panel": 17.70, "text/bg": 15.42, "muted/panel": 6.76, "on-accent/accent": 5.58, "danger/panel": 4.56, "accent/panel": 5.58 },
  matrix: { "text/panel": 13.34, "text/bg": 14.30, "muted/panel": 6.71, "on-accent/accent": 11.04, "danger/panel": 4.77, "accent/panel": 10.30 },
  forest: { "text/panel": 5.61,  "text/bg": 8.58,  "muted/panel": 4.64, "on-accent/accent": 10.12, "danger/panel": 2.19, "accent/panel": 3.89 },
  ocean:  { "text/panel": 14.17, "text/bg": 11.42, "muted/panel": 6.33, "on-accent/accent": 8.75, "danger/panel": 3.93, "accent/panel": 8.25 },
  mist:   { "text/panel": 4.80,  "text/bg": 7.36,  "muted/panel": 4.63, "on-accent/accent": 7.88, "danger/panel": 2.11, "accent/panel": 3.08 },
  ink:    { "text/panel": 14.80, "text/bg": 15.79, "muted/panel": 6.08, "on-accent/accent": 8.73, "danger/panel": 5.42, "accent/panel": 8.81 }
};

module.exports = { CONTRAST_BASELINE };
