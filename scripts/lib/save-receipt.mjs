/* save-receipt.mjs —— 第三条静态判据（R-37 同族反向，2026-11-09 新增）
 * ------------------------------------------------------------------
 * false-receipt.mjs 守的是「异步回执被丢弃/吞掉却报成功」；
 * 本门禁守它的**反向同族**：持久化包装器（_save*）里裸调 `save(...)`，
 * 把写入是否成功的 false 返回值直接丢弃 —— 配额耗尽 / 隐私模式禁用存储
 * 时调用方以为落盘了，实际没落（data-links 的 _saveSessions 丢的是
 * 「这段对话刷新后就没了」、ui-global-events 的 _saveSyncQueue 丢的是
 * 「断网期间的操作」）。
 *
 * 判据形态（刻意收窄，不是扫所有 save 调用）：
 *   ① 函数名必须是 `_save*` 持久化包装器（本仓约定：包装器的职责就是落盘）
 *   ② 包装器函数体内出现「语句位置」的裸 `save(...)` —— 返回值既不被
 *      return / 赋值 / await / 短路运算 / 条件 / 参数位置消费
 *   ③ 包装器之外的裸 save 调用不命中（那是 168 处调用面的形态，
 *      收进来就变成全仓基线冻结，违背本判据「先修包装器」的批文原意）
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");

const WRAPPER_RE = /^function\s+(_save[A-Za-z0-9_]*)\s*\(/gm;
const CALL_RE = /(^|[^\w$.])save\s*\(/g;

/* 语句尾消费形式：return / await / 赋值 / 短路运算 / 三元 / 参数位置(前缀 ( 或 ,)
   —— 这些都不是「丢弃」；其余（空、; { } 行首之后）一律按裸调处理。 */
const CONSUMED_TAIL = /(return|await|const|let|var|=|&&|\|\||\?)$/;

/** @returns {Array<{file:string,wrapper:string,line:number,kind:string,level:string,evidence:string}>} */
export function findDroppedSaveReceipts(code, file = "src") {
  const items = [];
  let m;
  while ((m = WRAPPER_RE.exec(code)) !== null) {
    const wrapper = m[1];
    const open = code.indexOf("{", m.index + m[0].length);
    if (open < 0) continue;
    let depth = 0, end = -1;
    for (let i = open; i < code.length; i++) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const bodyStart = open + 1;
    const body = code.slice(bodyStart, end);
    let c;
    while ((c = CALL_RE.exec(body)) !== null) {
      const callStart = c.index + (c[0].length - 5);      /* 指向 "save" 的 s */
      const before = body.slice(0, callStart);
      const cut = Math.max(before.lastIndexOf(";"), before.lastIndexOf("{"), before.lastIndexOf("}"), before.lastIndexOf("\n"));
      const tail = before.slice(cut + 1).replace(/\s+/g, "");
      /* 消费形态（return / 赋值 / await / 短路 / 参数位置 / 条件位置）不是丢弃 */
      if (tail !== "" && (CONSUMED_TAIL.test(tail) || /[(,]$/.test(tail))) continue;
      const abs = bodyStart + callStart;
      const lineStart = code.lastIndexOf("\n", abs - 1) + 1;
      const lineEnd = code.indexOf("\n", abs);
      items.push({
        file,
        wrapper,
        line: code.slice(0, abs).split("\n").length,
        kind: "dropped-save-receipt",
        level: "P0",
        evidence: code.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim(),
      });
    }
  }
  return items;
}

/** 扫 src/ 顶层全部 .js，返回聚合清单。 */
export function scanSrc() {
  if (!existsSync(SRC)) throw new Error("[save-receipt] src/ 不存在");
  const items = [];
  for (const f of readdirSync(SRC).filter((f) => f.endsWith(".js"))) {
    items.push(...findDroppedSaveReceipts(readFileSync(join(SRC, f), "utf8"), f));
  }
  return items;
}
