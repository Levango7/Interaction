/**
 * visual-kit/index.js —— 统一出口（跨项目共享，CommonJS）
 * ----------------------------------------------------------------------------
 * 【模板内置副本】来源：Interaction 仓库 tests/e2e/visual-kit/index.js（v3.7.122 抽取）。
 *   同步方式：上游更新时整文件复制覆盖本文件，并验证「除注释外零差异」（步骤见 README「内核同步」）。
 *   内置而非 require 上游的理由：模板要能复制到任意项目，不能依赖 Interaction 仓内路径。
 * 从 Interaction 的 theme-matrix.spec.js 抽出（v3.7.122）。
 * 用法：
 *   const { CONTRAST_INJECT, ABS_FLOOR, TOLERANCE, applyTheme, readPairs, checkOverflow, dumpReport } = require("./visual-kit/index.js");
 */

const contrast = require("./contrast.js");
const measure = require("./measure.js");
const report = require("./report.js");

module.exports = Object.assign({}, contrast, measure, report);
