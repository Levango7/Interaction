#!/usr/bin/env node
/**
 * install-hooks.mjs —— 接上仓库自带的 `.githooks/`（`git config core.hooksPath`）
 * -----------------------------------------------------------------------------
 * 由 package.json 的 `prepare` 钩子在 `npm install` 后自动调用；也可手动 `npm run hooks:install`。
 * 目的：让 `.githooks/pre-commit`（源码态提交门禁，见 docs/evaluation-conclusion.md 的补充节）
 *   对每个 clone 自动生效，而不是靠人记得去 .git/hooks 里手放一份（那份不会被版本控制）。
 *
 * 为什么不用 husky：本仓不引入额外依赖 —— 一个 `git config` 就够，且 .githooks/ 直接随仓库走。
 *
 * 失败一律不阻断安装（非 git 仓库、git 不在 PATH、只读环境等）—— 只打印提示。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooksDir = join(root, '.githooks');
const WANT = '.githooks';

if (!existsSync(hooksDir)) {
  console.log('[install-hooks] 未找到 .githooks/，跳过');
  process.exit(0);
}

let current = '';
try {
  current = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' }).trim();
} catch { current = ''; /* 未设置：正常，继续往下设置 */ }

if (current === WANT) {
  console.log(`[install-hooks] core.hooksPath 已指向 ${WANT}（提交前源码态门禁已生效）`);
  process.exit(0);
}

try {
  execFileSync('git', ['config', 'core.hooksPath', WANT], { cwd: root, stdio: 'ignore' });
  const from = current ? `（原值 ${current}）` : '';
  console.log(`[install-hooks] 已设置 core.hooksPath = ${WANT}${from} —— 提交前源码态门禁生效`);
} catch {
  console.log('[install-hooks] 未能设置 core.hooksPath（非 git 仓库或 git 不可用）—— 跳过，不影响安装');
}
