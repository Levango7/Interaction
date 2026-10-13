/**
 * measure.cjs —— 模板统一测量出口（薄封装；spec 只 require 本文件，不直接 require 内核）
 * ----------------------------------------------------------------------------
 * 真实实现 = 内置内核副本 helpers/visual-kit/（4 个文件；来源与同步方式见各文件头部
 * 注释与 README「内核同步」一节）。本文件做三件事：
 *   ① 稳定导入路径：spec 不依赖内核目录结构，内核内部调整文件时不影响 spec；
 *   ② 显式列举导出：导入面即文档，避免 Object.assign 全量导出掩盖新增能力；
 *   ③ 落盘位置说明：dumpReport(lines, name) 默认写 _probe/<name>.txt（_probe/ 已
 *      在 Interaction 的 .gitignore；其他项目请自行确保该目录不入库，或传 dir 覆盖）。
 */
const kernel = require("./visual-kit/index.js");

module.exports = {
  CONTRAST_INJECT: kernel.CONTRAST_INJECT,
  ABS_FLOOR: kernel.ABS_FLOOR,
  TOLERANCE: kernel.TOLERANCE,
  applyTheme: kernel.applyTheme,
  readTokens: kernel.readTokens,
  readPairs: kernel.readPairs,
  checkOverflow: kernel.checkOverflow,
  checkVisible: kernel.checkVisible,
  dumpReport: kernel.dumpReport
};
