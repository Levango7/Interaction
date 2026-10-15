#!/usr/bin/env node
/**
 * lint-server-ssrf.mjs —— 网络目标校验的「地址表示法」类门禁（2026-10-11 新增）
 * ----------------------------------------------------------------------------
 * 背景：2026-10-11 独立复核在 `server/src/tools-fetch.js` 发现 2 类 SSRF 绕过，均已实测打通回环：
 *   · **IPv4-mapped IPv6**：`http://[::ffff:7f00:1]/` —— WHATWG URL **不会**把它规范化成
 *     `127.0.0.1`（hostname 保持 `[::ffff:7f00:1]`），而 `_netHostForbidden` 的三条 IPv6 规则
 *     只覆盖 `::1` / ULA(fc00::/7) / 链路本地(fe80::/10)，**漏了 `::ffff:0:0/96`**；
 *   · **DNS 解析形态**：`http://localtest.me/` 解析到 127.0.0.1，但主机名是普通域名，
 *     字符串判定完全看不出来（`127.0.0.1.nip.io` 恰好被 `^127\.` 拦住，纯属巧合）。
 * 两者同属一条类规则：**「任何能到达私网的表示法都要拦」，而不是「枚举私网长什么样」**。
 *
 * 做法：**行为测试**，不是静态扫描 ——
 *   1. 从源码里提取 `_netHostForbidden` 函数体（括号配平）；
 *   2. 用 `new Function` 在隔离环境求值（该函数无外部依赖，纯字符串判定）；
 *   3. 喂一组「必须拦」与「必须放」的样本，按**行为**判定，不猜写法。
 * 这比"扫代码里有没有 normalize 字样"可靠得多 —— 后者写法一变就误报/漏报。
 *
 * 覆盖范围：`server/src/*.js` 与 `electron/main.js`（两侧刻意各持一份同口径实现，
 * 见 tools-fetch.js 头注释；**两侧都要过**，任一侧漏了就是那个运行时被绕过）。
 *
 * ⚠️ 已知缺口（如实记账）：
 *   · 只测 `_netHostForbidden` 这一层；**DNS 解析校验**（解析后判 IP）不在此脚本覆盖内 ——
 *     它需要异步 + 真实 DNS，静态门禁做不了，只能靠 review（本轮报告已给出修法）。
 *   · 样本表是"已知绕过形态"的快照，**不是穷举** —— 新形态出现时要往 SAMPLES 里加。
 *   · 只覆盖 `_netHostForbidden` 这个函数名；若改名，本门禁会因"找不到函数"而失败（有意为之，
 *     避免静默失效）。
 *
 * 用法：
 *   node scripts/lint-server-ssrf.mjs             # 检查（有漏拦 → 退出码 1）
 *   node scripts/lint-server-ssrf.mjs --report    # 只出报告
 *   node scripts/lint-server-ssrf.mjs --scan <路径>   # 指定目录
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const REPORT_ONLY = args.includes('--report');
const scanIdx = args.indexOf('--scan');
const SCAN_DIR = scanIdx >= 0 && args[scanIdx + 1] ? args[scanIdx + 1] : ROOT;

/* 目标文件（相对 SCAN_DIR） */
const TARGETS = ['server/src/tools-fetch.js', 'electron/main.js'];

/* 样本：{ host, mustBlock, why } —— host 是 `new URL(...).hostname` 的形态（含方括号） */
const SAMPLES = [
  // ---- 必须拦（私网 / 回环 / 链路本地 / 元数据）----
  { host: '127.0.0.1', mustBlock: true, why: '回环（点分十进制）' },
  { host: '10.0.0.1', mustBlock: true, why: '私网 10/8' },
  { host: '192.168.1.1', mustBlock: true, why: '私网 192.168/16' },
  { host: '172.16.0.1', mustBlock: true, why: '私网 172.16/12' },
  { host: '169.254.169.254', mustBlock: true, why: '链路本地 / 云元数据' },
  { host: '100.64.0.1', mustBlock: true, why: '★ CGNAT 100.64/10（RFC 6598，R-24 点名的另一处缺口）' },
  { host: 'localhost', mustBlock: true, why: 'localhost' },
  { host: 'foo.local', mustBlock: true, why: '.local 后缀' },
  { host: '[::1]', mustBlock: true, why: 'IPv6 回环' },
  { host: 'fe80::1', mustBlock: true, why: 'IPv6 链路本地' },
  { host: 'fd00::1', mustBlock: true, why: 'IPv6 ULA' },
  // ---- 必须拦：IPv4-mapped IPv6（本轮发现的绕过）----
  { host: '[::ffff:7f00:1]', mustBlock: true, why: '★ IPv4-mapped IPv6（= 127.0.0.1）' },
  { host: '[::ffff:a00:1]', mustBlock: true, why: '★ IPv4-mapped IPv6（= 10.0.0.1）' },
  { host: '[::ffff:c0a8:101]', mustBlock: true, why: '★ IPv4-mapped IPv6（= 192.168.1.1）' },
  { host: '[::ffff:ac10:1]', mustBlock: true, why: '★ IPv4-mapped IPv6（= 172.16.0.1）' },
  { host: '[::ffff:a9fe:a9fe]', mustBlock: true, why: '★ IPv4-mapped IPv6（= 169.254.169.254，云元数据）' },
  { host: '[::ffff:127.0.0.1]', mustBlock: true, why: '★ IPv4-mapped IPv6（点分写法）' },
  // ---- 必须放（正常公网域名）----
  { host: 'example.com', mustBlock: false, why: '普通公网域名' },
  { host: 'api.github.com', mustBlock: false, why: '普通公网域名' },
];

/** 从源码里提取 `function <name>(...){...}` 的完整文本（括号配平） */
function extractFunction(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return null;
  const braceStart = src.indexOf('{', m.index);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, i + 1);
    }
  }
  return null;
}

function main() {
  let blocked = 0;
  let total = 0;
  const failures = [];
  const missing = [];

  for (const rel of TARGETS) {
    const file = join(SCAN_DIR, rel);
    if (!existsSync(file)) { missing.push(rel + '（文件不存在）'); continue; }
    const src = readFileSync(file, 'utf8');
    const fnText = extractFunction(src, '_netHostForbidden');
    if (!fnText) { missing.push(rel + '（未找到 _netHostForbidden）'); continue; }

    let fn;
    try {
      /* 该函数是纯字符串判定、无外部依赖 —— 隔离求值是安全的 */
      fn = new Function(fnText + '\nreturn _netHostForbidden;')();
    } catch (e) {
      missing.push(rel + '（函数求值失败：' + ((e && e.message) || e) + '）');
      continue;
    }

    for (const s of SAMPLES) {
      total++;
      let got;
      try { got = !!fn(s.host); } catch (e) { got = 'ERR:' + ((e && e.message) || e); }
      const ok = got === s.mustBlock;
      if (ok) blocked++;
      else failures.push({ rel, host: s.host, why: s.why, want: s.mustBlock, got });
    }
  }

  console.log('[lint-server-ssrf] 扫描根目录 ' + SCAN_DIR);
  if (missing.length) {
    console.error('[lint-server-ssrf] ✗ 目标不可用（门禁拒绝在缺目标时报通过）：');
    missing.forEach((m) => console.error('  · ' + m));
    process.exit(1);
  }

  console.log('[lint-server-ssrf] 样本 ' + total + ' 条（跨 ' + TARGETS.length + ' 个实现），通过 ' + blocked + ' 条');

  if (!failures.length) {
    console.log('[lint-server-ssrf] ✓ 所有已知地址表示法都被正确处理（拦私网 / 放公网）');
    process.exit(0);
  }

  console.log('');
  console.log('[lint-server-ssrf] ✗ ' + failures.length + ' 条样本行为不符：');
  for (const f of failures) {
    console.log('  ' + f.rel + '  host=' + f.host + '  期望 ' + (f.want ? '拦' : '放') +
      '  实际 ' + (f.got ? '拦' : '放') + '   [' + f.why + ']');
  }
  console.log('');
  console.log('[lint-server-ssrf] 修法：判定前先**规范化主机名** —— 去掉方括号，并把 IPv4-mapped IPv6');
  console.log('  （::ffff:a.b.c.d / ::ffff:xxxx:xxxx）还原成点分十进制，再交给原有规则判；');
  console.log('  另外 DNS 解析形态（如 localtest.me → 127.0.0.1）需在放行前解析 A/AAAA 并逐条判。');

  process.exit(REPORT_ONLY ? 0 : 1);
}

main();
