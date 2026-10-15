#!/usr/bin/env node
/**
 * lint-server-idor.mjs —— 服务端「按外部键删改必须判归属」类门禁（2026-10-11 新增）
 * ----------------------------------------------------------------------------
 * 背景：同一形态在 40 天内**漏了三次** ——
 *   ① v3.7.105 修 `DELETE /api/auth/devices/:id`
 *      （修复注释原文：「原实现按 id 在**全局** session 表里找，不看归属 —— 任何已登录用户
 *        都能踢掉别人的设备」）
 *   ② v3.7.105 修 `DELETE /api/notifications/schedules/:id`
 *      （修复注释原文：「对比同文件的 PUT /schedules/:id 是有 s.userId !== req.user.sub 校验的，
 *        说明这条 DELETE 是遗漏而非设计」）
 *   ③ 2026-10-11 独立复核发现 `POST /api/notifications/push/unsubscribe` **仍无归属** —— 第三次。
 *
 * 三次的修复注释都写明了「同文件另一处有校验，说明这是遗漏」，说明作者**已识别这是"类"问题**，
 * 但只逐处修现场、没有立类门禁。这正是台账 R-6「同类缺陷只修现场、不立门禁」记的那条。
 * 本文件把那条类规则写成可执行断言。
 *
 * 规则：**凡 handler 内调用 store 的删改方法（del* / remove* / delete* / update* / set* / upsert*），
 *       必须同时出现归属判断（`req.user.sub`），否则报违规。**
 * 例外（WHITELIST，必须附理由，否则就是放水）见下方常量。
 *
 * ⚠️ 已知覆盖缺口（如实记账，勿以为它覆盖了服务端安全全貌）：
 *   · 只做**文本级**扫描，不做数据流追踪 —— 若归属值经中间变量传递（`const uid = req.user.sub`
 *     之后用 `uid`），本门禁会误报。当前代码库未出现该写法；出现时加进 WHITELIST 并写明理由。
 *   · 只覆盖 `store.<method>(` 形态；直接改 `store.data.xxx`（如 auth.js:380 读 sessions）不在扫描内。
 *   · 只覆盖**归属**这一类，不覆盖 fail-open / 地址规范化 / 有界性
 *     （另三条见 `Interaction-第十一轮-*独立复核*.md` §5.2 的建议）。
 *
 * 用法：
 *   node scripts/lint-server-idor.mjs             # 检查（有违规 → 退出码 1）
 *   node scripts/lint-server-idor.mjs --report    # 只出报告，不判失败
 *   node scripts/lint-server-idor.mjs --scan <路径>
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const REPORT_ONLY = args.includes('--report');
const scanIdx = args.indexOf('--scan');
const SCAN_DIR = scanIdx >= 0 && args[scanIdx + 1] ? args[scanIdx + 1] : join(ROOT, 'server', 'src');

/* 白名单：确属无需归属判断的 handler。每一条都必须有理由 —— 没有理由的白名单就是放水。 */
const WHITELIST = [
  { file: 'auth.js', path: '/logout', reason: '以 refreshToken 本身为凭据，持有该 token 即有权删除该会话' },
  /* 下面两条**不是**「无需归属」，而是「当前无处可判归属」—— 如实记缺口，勿当放水：
     实例级集成配置（OAuth app 凭据）语义上属实例而非用户，store 里也确实没有 userId 维度。
     真正的问题是「谁有权改实例配置」需要一个角色体系，而当前 `server/src` 全局无 admin/role，
     所有认证用户等价（`server/README.md` 亦自述「可救的开发骨架，不是可交付产品」）。
     收紧指引：引入 RBAC（或「首个注册用户即 owner」）后，这两条应改为校验调用者是管理员，
     并从本 WHITELIST 移除。 */
  { file: 'integrations.js', path: '/oauth/:provider/callback', reason: '实例级集成配置的写入侧：无用户维度可判（已知权限面缺口，见上方注释）' },
  { file: 'integrations.js', path: '/oauth/:provider', reason: '实例级集成配置的删除侧：同上，是同一缺口的两面' },
];

const MUTATING = /\bstore\.(?:del|remove|delete|update|set|upsert)[A-Za-z0-9_]*\s*\(/g;
const OWNERSHIP = /req\.user\.sub/;

/* 凭据 / 临时态类方法：**其键本身即凭据**（知道该键 = 有权操作该记录），故无需再判归属。
   这是一条**语义类**，不是逐处豁免：
     · 验证码 setCode/getCode/markCodeUsed —— 键 = email；能否通过由 code 值本身决定，
       且 email 尚未绑定任何账号（注册前），本就没有 userId 可判；
     · 会话 saveSession/getSession/deleteSession —— 键 = refreshToken，持有它即有权删该会话
       （`/logout` 的语义正是"用凭据换删除"）；
     · OAuth 一次性票据 setOAuthState/getOAuthState/deleteOAuthState —— 键 = 服务端随机生成的
       state，一次性消费，本身就是防伪凭据。
   反例（**不属于**本类，各自处理方式见下）：
     · `removePushSub`（键 = endpoint，是资源标识而非凭据）—— **v3.7.129 已补上归属校验**
       （`store.removePushSub(endpoint, userId)`），本门禁现已对它是绿的；
     · `setIntegration` / `removeIntegration`（键 = provider 名）—— 也**不是**凭据类，但同样
       **没有** userId 维度可判：`store.integrations` 是 provider→meta 的**全局字典**，属实例级
       配置（一个实例连一个 OAuth app）。当前服务端无角色体系（`server/src` 全局无 admin/role），
       所有认证用户等价 —— 故这两条进 WHITELIST，并**记为已知权限面缺口**（见 WHITELIST 内注释），
       而不是当成「已安全」。 */
const CREDENTIAL_METHODS = new Set([
  'setCode', 'getCode', 'markCodeUsed',
  'saveSession', 'getSession', 'deleteSession',
  'setOAuthState', 'getOAuthState', 'deleteOAuthState',
]);

/** 切出所有 `router.<method>("path", ...)` 的完整调用体（按括号配平，支持多行与中间件） */
function extractHandlers(src) {
  const out = [];
  const re = /router\.(get|post|put|delete|patch)\s*\(\s*(["'`])([^"'`]+)\2/g;
  let m;
  while ((m = re.exec(src))) {
    const start = src.indexOf('(', m.index);
    let depth = 0;
    let end = -1;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end < 0) continue;
    out.push({
      method: m[1].toUpperCase(),
      path: m[3],
      line: src.slice(0, m.index).split('\n').length,
      body: src.slice(start, end + 1),
    });
  }
  return out;
}

function main() {
  if (!existsSync(SCAN_DIR)) {
    console.error('[lint-server-idor] 扫描目录不存在: ' + SCAN_DIR);
    process.exit(1);
  }
  const files = readdirSync(SCAN_DIR).filter((f) => f.endsWith('.js'));
  const violations = [];
  let handlers = 0;
  let mutating = 0;

  for (const f of files) {
    const src = readFileSync(join(SCAN_DIR, f), 'utf8');
    for (const h of extractHandlers(src)) {
      handlers++;
      MUTATING.lastIndex = 0;
      const calls = [...h.body.matchAll(MUTATING)].map((x) => x[0].replace(/\s*\($/, ''));
      if (!calls.length) continue;
      mutating++;
      if (OWNERSHIP.test(h.body)) continue;
      /* 若本次涉及的删改调用**全部**属"凭据/临时态"语义类，归属由凭据本身承担 → 跳过 */
      const names = calls.map((c) => c.replace(/^store\./, ''));
      if (names.every((n) => CREDENTIAL_METHODS.has(n))) continue;
      if (WHITELIST.some((w) => w.file === f && w.path === h.path)) continue;
      violations.push({ file: f, line: h.line, method: h.method, path: h.path, calls: [...new Set(calls)] });
    }
  }

  /* 作用域自证：防空转 —— 一个 handler 都没解析到，说明解析器坏了，此时绝不能报"通过" */
  if (handlers === 0) {
    console.error('[lint-server-idor] ✗ 未解析到任何 router handler —— 解析器可能失效，拒绝报通过');
    process.exit(1);
  }

  console.log('[lint-server-idor] 扫描 ' + SCAN_DIR);
  console.log('[lint-server-idor] handler ' + handlers + ' 个，其中含删改调用 ' + mutating + ' 个');

  if (!violations.length) {
    console.log('[lint-server-idor] ✓ 所有删改 handler 都有归属判断（req.user.sub）');
    process.exit(0);
  }

  console.log('');
  console.log('[lint-server-idor] ✗ 发现 ' + violations.length + ' 处「按外部键删改但无归属判断」：');
  for (const v of violations) {
    console.log('  ' + v.file + ':' + v.line + '  ' + v.method + ' ' + v.path + '  → ' + v.calls.join(', '));
  }
  console.log('');
  console.log('[lint-server-idor] 修法（先取归属并校验，再执行删改）：');
  console.log('    const rec = store.getXxx(String(req.params.id));');
  console.log('    if (!rec || rec.userId !== req.user.sub) return fail(res, 404, "not_found");');
  console.log('    store.deleteXxx(...);');
  console.log('[lint-server-idor] 确属无需归属的（如 /logout），加进本文件 WHITELIST 并写明理由。');

  process.exit(REPORT_ONLY ? 0 : 1);
}

main();
