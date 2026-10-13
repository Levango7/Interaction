/**
 * visual-kit/report.js —— 实测值落盘工具（跨项目共享，CommonJS）
 * ----------------------------------------------------------------------------
 * 【模板内置副本】来源：Interaction 仓库 tests/e2e/visual-kit/report.js（v3.7.122 抽取）。
 *   同步方式：上游更新时整文件复制覆盖本文件，并验证「除注释外零差异」（步骤见 README「内核同步」）。
 *   内置而非 require 上游的理由：模板要能复制到任意项目，不能依赖 Interaction 仓内路径。
 * 从 Interaction 的 theme-matrix.spec.js 抽出（v3.7.122）。
 * 用途：把视觉实测值（对比度、尺寸等）写入文件，便于人工复核与将来调阈值。
 * Playwright 默认吞掉 console.log，写文件更可靠。
 *
 * 默认写入 `_probe/<name>.txt`（.gitignore 已含 _probe/，不纳入版本控制）。
 */

const fs = require("node:fs");
const path = require("node:path");

/** 把若干行文本落盘。dir 可覆盖（默认 _probe/），name 为文件名（不含扩展名）。 */
function dumpReport(lines, name, dir) {
  try {
    const d = dir || path.resolve(__dirname, "..", "..", "..", "_probe");
    const file = path.join(d, name + ".txt");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
    return file;
  } catch (e) {
    /* 落盘失败不影响断言 */
    return null;
  }
}

module.exports = { dumpReport };
