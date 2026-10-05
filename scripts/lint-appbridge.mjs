#!/usr/bin/env node
/**
 * lint-appbridge.mjs —— AppBridge 槽位完整性门禁
 * ----------------------------------------------------------------------------
 * 背景（2026-10-05 审计发现，P0）：
 *   `src/render-overview.js` 定义了 `_buildCloudSnapshot` / `_applyCloudSnapshot`，
 *   却**从未注册到 AppBridge**。而 `src/ui-ge-integrations.js` 的 WebDAV 同步要读这两个槽：
 *       const build = AppBridge.buildCloudSnapshot;   // undefined
 *       const apply = AppBridge.applyCloudSnapshot;   // undefined
 *   于是 `webdavSyncUpload` / `webdavSyncDownload` 在生产环境**恒在**
 *   `if(typeof x !== "function") return toast("快照构建/应用不可用")` 处提前返回 ——
 *   整个 WebDAV 云同步（上传 + 下载两端）是死的，用户点按钮只会看到一句「不可用」。
 *
 *   为什么既有门禁全都没发现：
 *     · `lint-layers` / `module-graph` 只看**块间依赖方向**，不看运行期槽位是否有实现；
 *     · `dead-wiring-guard` 看的是**DOM 控件的 onclick 是否为空**，不看 JS 槽位；
 *     · 单测全绿 —— 因为 `tests/webdav-sync.test.js` 的 `bridgeStub()` **自己把两个槽桩上了**
 *       （注释还写着「render-overview 注册的快照桥替身」，即作者以为生产侧已注册）。
 *   即：**测试把缺失的依赖当成了前提**，这是本仓反复出现的形态。
 *
 * 本门禁补上这个盲区。判定分两级：
 *   FAIL —— 槽被读取，但 core 未声明默认实现、且全 src 从未赋值 → 值必为 undefined，
 *           读取处的 `typeof` 守卫恒真 → 确定是死路径。
 *   WARN —— 槽被读取，core 声明了 no-op 默认（刻意的安全空操作），但从未赋值 →
 *           不报错但**功能静默不生效**，属可疑死接线，只提示不阻断（沿用本仓棘轮口径）。
 *
 * 用法：
 *   node scripts/lint-appbridge.mjs           # 报告
 *   node scripts/lint-appbridge.mjs --check   # 有 FAIL 即 exit 1
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const CHECK = process.argv.includes("--check");

const files = readdirSync(SRC).filter((f) => f.endsWith(".js"));

/* ---------- 1. core.js 里 AppBridge 对象字面量声明的槽（有默认实现） ---------- */
const coreSrc = readFileSync(join(SRC, "core.js"), "utf8");
const declared = new Set();
const startIdx = coreSrc.indexOf("const AppBridge = {");
if (startIdx < 0) {
  console.error("[lint-appbridge] ✗ core.js 里找不到 `const AppBridge = {` —— 门禁失去锚点，需更新脚本");
  process.exit(1);
}
{
  let i = coreSrc.indexOf("{", startIdx), depth = 0, end = i;
  for (; i < coreSrc.length; i++) {
    if (coreSrc[i] === "{") depth++;
    else if (coreSrc[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = coreSrc.slice(startIdx, end);
  for (const m of body.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm)) declared.add(m[1]);
}

/* ---------- 2. 全 src 扫赋值点与读取点 ---------- */
const assigned = new Map();
const read = new Map();
for (const f of files) {
  const lines = readFileSync(join(SRC, f), "utf8").split("\n");
  lines.forEach((ln, idx) => {
    const no = idx + 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;                 // 跳过注释行
    for (const m of ln.matchAll(/AppBridge\.([A-Za-z_$][\w$]*)/g)) {
      const name = m[1];
      const isAssign = new RegExp("AppBridge\\." + name + "\\s*=(?!=)").test(ln);
      const bag = isAssign ? assigned : read;
      if (!bag.has(name)) bag.set(name, []);
      bag.get(name).push(`${f}:${no}`);
    }
  });
}

/* ---------- 3. 判定 ---------- */
const fatal = [];   // 读取 + 无默认 + 未赋值 → undefined
const warn = [];    // 读取 + 有 no-op 默认 + 未赋值 → 静默不生效
for (const [name, where] of read) {
  if (assigned.has(name)) continue;
  (declared.has(name) ? warn : fatal).push({ name, where });
}

console.log(`[lint-appbridge] core 声明 ${declared.size} 槽 · 赋值 ${assigned.size} 槽 · 读取 ${read.size} 槽`);

if (fatal.length) {
  console.error(`\n[lint-appbridge] ✗ ${fatal.length} 个槽**被读取但既无默认实现、也从未赋值**（值为 undefined，读取处守卫恒真 → 死路径）：`);
  for (const d of fatal) {
    console.error(`  AppBridge.${d.name}`);
    d.where.slice(0, 5).forEach((w) => console.error(`      读取于 ${w}`));
  }
  console.error("\n  修法：在定义该实现的块里补一行 `try{ AppBridge." + fatal[0].name + " = <实现>; }catch(e){}`");
}

if (warn.length) {
  console.log(`\n[lint-appbridge] ⚠ ${warn.length} 个槽有 no-op 默认实现但从未赋值（不报错，但功能静默不生效，仅提示）：`);
  for (const w of warn) {
    console.log(`  AppBridge.${w.name}  ← ${w.where.slice(0, 3).join(", ")}`);
  }
}

if (!fatal.length && !warn.length) console.log("[lint-appbridge] ✓ 所有被读取的槽都有实现（无死槽）");

if (CHECK && fatal.length) {
  console.error(`\n[lint-appbridge] check ✗ ${fatal.length} 个死槽`);
  process.exit(1);
}
process.exit(0);
