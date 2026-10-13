/**
 * theme-list.cjs —— 主题清单（项目适配层：各项目覆盖写这里）
 * ----------------------------------------------------------------------------
 * 渲染层矩阵按「可独立应用的主题」逐套跑。判定口径：
 *   · light 通常是默认态（无 data-theme 属性），其余主题用 data-theme="<id>" 应用；
 *   · 「跟随系统（system）」类选项的取值取决于 OS 偏好，无法确定性强断言，不进本清单。
 *
 * Interaction pilot 口径（2026-10-13 实测核对）：
 *   PRESET_THEMES 注册表（src/ui-ge-theme.js）共 10 键；CSS 共 9 个
 *   [data-theme="..."] 选择器（aurora/dark/elegant/forest/ink/matrix/mist/ocean/sepia）
 *   + light 默认态 = 10 套可独立应用的主题。主题下拉的第 11 项是 system（跟随系统），
 *   不在本清单内。下游 tests/e2e/theme-matrix.spec.js 的 THEMES/BASELINE 同为这 10 套。
 *
 * 其他项目接入：把数组换成自己项目的主题 id，并同步补 contrast-baseline.cjs 的键
 * （键集合必须与 THEMES 一致，否则对比度用例会报「基线表缺少主题」）。
 */

/** 可独立应用的主题 id 清单（顺序即报告顺序）。 */
const THEMES = ["light", "dark", "sepia", "elegant", "aurora", "matrix", "forest", "ocean", "mist", "ink"];

/** 主题应用属性名（内核 applyTheme 的 opts.attr 默认值）。 */
const THEME_ATTR = "data-theme";

/** 默认态主题 id（内核 applyTheme 的 opts.lightValue：该主题用移除属性来表达）。 */
const LIGHT_THEME = "light";

module.exports = { THEMES, THEME_ATTR, LIGHT_THEME };
