#!/usr/bin/env node
/* config-check.cjs —— 配置加载三层优先级与深合并语义（v3.7.124）
 *
 * 为什么要有这个脚本：本仓在 v3.7.124 之前，loadConfig() **只读 config.example.json**，
 * 而 README §快速启动 与启动报错文案都在教用户「复制 config.example.json 为 config.json」
 * ——那一步从来没有效果。已实测确认：往 config.json 写入非占位 JWT 密钥后启动，
 * 仍被"密钥仍是占位值"拒绝启动（说明那份文件压根没被读）。
 * 修法是：抽出 src/config.js，支持 config.json 并与基线做**深合并**，env 仍最高优先。
 *
 * 为什么必须断言而不是"我看过了"：合并语义是本仓摔过两类跤的地方——
 *   ① 读不到（用户改了配置没生效，且无任何提示）   —— v3.7.124 修的洞
 *   ② 整体替换（只配 github 一节，security.rateLimit 等安全默认值一起消失，**无任何报错**）
 * ②比①更危险：它把限流/同步上限静默降级成 undefined。所以本脚本三条主线：
 *   · 读得到（config.json 生效）
 *   · 保得住默认（深合并，不是整体替换）
 *   · 优先级正确（env > config.json > example）
 * 外加一条 HTTP 层用例：loadConfig 的结果**真的接到了 app 上**（否则单测全绿也没意义）。
 *
 * 运行：cd server && node verify/config-check.cjs
 * 注意：会在 server/ 下临时创建 config.json，finally 里保证删除；开始前若已存在用户
 * 自己的 config.json，会先备份并在结束时还原（绝不吞掉用户的配置）。
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const SRV = path.join(__dirname, "..");
const USER_CFG = path.join(SRV, "config.json");
const { loadConfig, deepMerge } = require("../src/config.js");

let passN = 0, failN = 0;
function check(label, cond, detail) {
  if (cond) { passN++; console.log("  PASS  " + label.padEnd(50) + (detail ? "| " + detail : "")); }
  else { failN++; console.log("  FAIL  " + label.padEnd(50) + (detail ? "| " + detail : "")); }
}
function group(n) { console.log("\n" + n); }

/* ---- config.json 的临时占位（备份 → 写 → 还原，保证不碰用户配置）---- */
let BACKUP = null;
const hadUserCfg = fs.existsSync(USER_CFG);
if (hadUserCfg) {
  BACKUP = fs.readFileSync(USER_CFG);
  console.log("[config-check] 检测到已存在的 server/config.json，已备份，结束时还原。");
}
function writeUserCfg(obj) {
  fs.writeFileSync(USER_CFG, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
}
function clearUserCfg() { try { fs.unlinkSync(USER_CFG); } catch (_e) { /* 不存在 */ } }
function restoreUserCfg() {
  clearUserCfg();
  if (hadUserCfg) { fs.writeFileSync(USER_CFG, BACKUP); console.log("[config-check] 已还原原 server/config.json。"); }
}

const envKey = (dotted) => dotted.split(".").map((s) => s.toUpperCase()).join("__");
/* loadConfig 里 env 覆盖的是**已存在的键**，所以断言 env 优先级时必须传一个
   在 config.example.json 里确实存在的键（github.clientId 就是）。 */
const ENV_KEY = envKey("github.clientId");

function freePort() {
  return new Promise((resolve, reject) => {
    const s = require("node:http").createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on("error", reject);
  });
}
function startServer(port, extraEnv) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["src/index.js"], {
      cwd: SRV,
      env: Object.assign({}, process.env, {
        PORT: String(port),
        ALLOW_PLACEHOLDER_SECRETS: "true",
        DATAFILE: path.join(os.tmpdir(), "config-check-data-" + port + ".json"),
      }, extraEnv || {}),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "", settled = false;
    const timer = setTimeout(() => {
      if (settled) return; settled = true; reject(new Error("启动超时\n" + out));
    }, 20000);
    const tick = setInterval(async () => {
      if (settled) return;
      try {
        const j = await (await fetch("http://127.0.0.1:" + port + "/api/health")).json();
        if (j && j.name === "agent-workbench-auth") { settled = true; clearTimeout(timer); clearInterval(tick); resolve(p); }
      } catch (_e) { /* 未就绪 */ }
    }, 200);
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { out += d.toString(); });
    p.on("error", (e) => { if (!settled) { settled = true; clearTimeout(timer); clearInterval(tick); reject(e); } });
    p.on("exit", (code) => {
      if (settled || code === 0 || code === null) return;
      settled = true; clearTimeout(timer); clearInterval(tick);
      reject(new Error("启动退出 code=" + code + "\n" + out));
    });
  });
}

(async () => {
  /* ---------- ① 基线：没有 config.json 时应读到仓库基线 ---------- */
  group("① 基线：无 config.json 时读到 config.example.json（且未受 env 干扰）");
  clearUserCfg();
  const savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  const base = loadConfig();
  check("读到基线 github.clientId 为空串", base.github.clientId === "", "clientId=" + JSON.stringify(base.github.clientId));
  check("读到基线安全默认 security.rateLimit.loginMax=10", base.security.rateLimit.loginMax === 10,
    "loginMax=" + base.security.rateLimit.loginMax);
  check("dataFile 被解析成绝对路径", path.isAbsolute(base.dataFile), base.dataFile);

  /* ---------- ② 读得到：config.json 真的生效（本轮修的洞） ---------- */
  group("② config.json 生效（v3.7.124 修的洞：此前只读 example，配置完全不生效）");
  writeUserCfg({ github: { clientId: "from-config-json" } });
  const withUser = loadConfig();
  check("config.json 的值被读到", withUser.github.clientId === "from-config-json",
    "clientId=" + withUser.github.clientId);

  /* ---------- ③ 保得住默认：深合并，不是整体替换 ---------- */
  group("③ 深合并：只配一节，其余安全默认值必须仍在");
  check("未写的 security.rateLimit.loginMax 仍是基线 10（没被整体替换掉）",
    withUser.security.rateLimit.loginMax === 10, "loginMax=" + withUser.security.rateLimit.loginMax);
  check("未写的 wechat.qrcodeTicketTtlSec 仍是基线 300",
    withUser.wechat.qrcodeTicketTtlSec === 300, "ttl=" + withUser.wechat.qrcodeTicketTtlSec);
  check("未写的 sync.maxSnapshotBytes 仍是基线 2097152",
    withUser.sync.maxSnapshotBytes === 2097152, "bytes=" + withUser.sync.maxSnapshotBytes);
  check("同节内未写的键仍保留（github.scope 仍是 read:user）",
    withUser.github.scope === "read:user", "scope=" + withUser.github.scope);
  writeUserCfg({ customProbe: { deep: { n: 7 } } });
  const withNewKey = loadConfig();
  check("基线里没有的新键也能进来（customProbe.deep.n=7）",
    withNewKey.customProbe && withNewKey.customProbe.deep && withNewKey.customProbe.deep.n === 7);
  check("deepMerge 不修改 base 对象（纯函数）", base.github.clientId === "" && base.customProbe === undefined);

  /* ---------- ④ 优先级：env 最高 ---------- */
  group("④ 优先级：环境变量覆盖 config.json");
  process.env[ENV_KEY] = "env-wins";
  const envOver = loadConfig();
  check("env 覆盖 config.json（github.clientId=env-wins）", envOver.github.clientId === "env-wins",
    "clientId=" + envOver.github.clientId);
  check("env 覆盖不影响未写键（深合并结果仍在）", envOver.security.rateLimit.loginMax === 10);
  delete process.env[ENV_KEY];
  if (savedEnv !== undefined) process.env[ENV_KEY] = savedEnv;

  /* ---------- ⑤ 数组/标量：整份替换，不逐元素合并 ---------- */
  group("⑤ 数组与标量按「整份替换」语义（不逐元素合并）");
  writeUserCfg({ tools: { fetch: { allowHosts: ["a.example", "b.example"] } } });
  const arrCfg = loadConfig();
  check("数组被整份替换（allowHosts=['a.example','b.example']）",
    Array.isArray(arrCfg.tools.fetch.allowHosts)
    && arrCfg.tools.fetch.allowHosts.length === 2
    && arrCfg.tools.fetch.allowHosts[0] === "a.example",
    JSON.stringify(arrCfg.tools.fetch.allowHosts));
  check("同节内未写键仍在（tools.fetch.maxBytes 仍是基线 1048576）",
    arrCfg.tools.fetch.maxBytes === 1048576, "maxBytes=" + arrCfg.tools.fetch.maxBytes);

  /* ---------- ⑥ 坏配置必须 fail loud ---------- */
  group("⑥ config.json 语法错误：fail loud，不静默按默认启动");
  writeUserCfg("{ this is not json ");
  let threw = false, msg = "";
  try { loadConfig(); } catch (e) { threw = true; msg = e.message; }
  check("坏 JSON 抛错", threw, msg.slice(0, 60));
  check("报错信息指向 config.json 本身", msg.indexOf("config.json") !== -1);

  /* ---------- ⑥b 空文件 = 未写配置（v3.7.127：把「没来得及写」与「写错了」分开） ---------- */
  group("⑥b config.json 空文件（0 字节 / 纯空白）：静默跳过，不按坏 JSON 炸");
  /* 这个形态不是理论：README 教的「复制 config.example.json 为 config.json 后编辑」中断一下
     就是空文件（2026-10-15 本机实测：0 字节 config.json 让服务端拒绝启动，报错还是
     「语法有误」——把没来得及写误报成写错了）。空 = 无配置，与「文件不存在」同口径；
     非空但语法坏仍然 fail loud（⑥ 的用例不变）。 */
  writeUserCfg("");
  let emptyThrew = "", emptyCfg = null;
  try { emptyCfg = loadConfig(); } catch (e) { emptyThrew = e.message; }
  check("空文件不抛错", !emptyThrew, emptyThrew.slice(0, 60));
  check("空文件时基线安全默认值在（loginMax=10）",
    !!emptyCfg && emptyCfg.security.rateLimit.loginMax === 10,
    emptyCfg ? "loginMax=" + emptyCfg.security.rateLimit.loginMax : "(loadConfig 失败)");
  writeUserCfg("  \n\t\n  ");
  let blankThrew = "";
  try { loadConfig(); } catch (e) { blankThrew = e.message; }
  check("纯空白文件同样静默跳过（trim 后为空）", !blankThrew, blankThrew.slice(0, 60));
  clearUserCfg();

  /* ---------- ⑦ HTTP 层：loadConfig 的结果真的接到了 app 上 ---------- */
  group("⑦ 端到端：loadConfig 的产出真的接到 express（否则单测全绿也没意义）");
  /* 口径说明（两版都写错过，才把真实语义钉在这里）：
     app.use(cors({origin: cfg.corsOrigin === "*" ? true : cfg.corsOrigin}))（index.js:62）
     · 基线 "*" → origin:true → cors **回显请求源**（ACAO = 请求带的 Origin）
     · 配置了具体源 → origin:字符串 → cors **固定回显**（ACAO 恒等于配置值，见
       node_modules/cors/lib/index.js:47-56，字符串形态不按请求源过滤）
     所以差分对照的口径是：基线"跟着请求变"、配了之后"钉死不变"，而不是"从 * 变成具体值"。 */
  const ACAO = async (port, origin) => {
    const r = await fetch("http://127.0.0.1:" + port + "/api/health", { headers: { Origin: origin } });
    return r.headers.get("access-control-allow-origin");
  };

  clearUserCfg();
  const P0 = await freePort();
  const srv0 = await startServer(P0);
  let b0a = null, b0b = null;
  try { b0a = await ACAO(P0, "http://probe-a.example"); b0b = await ACAO(P0, "http://probe-b.example"); }
  finally { try { srv0.kill(); } catch (_e) { /* 已退出 */ } }
  check("基线（无 config.json）：ACAO 回显请求源（宽松形态）",
    b0a === "http://probe-a.example" && b0b === "http://probe-b.example",
    "A=" + b0a + " B=" + b0b);

  const P = await freePort();
  const ORIGIN = "http://config-json-probe.example";
  writeUserCfg({ corsOrigin: ORIGIN });
  const srv = await startServer(P);
  let b1a = null, b1b = null;
  try { b1a = await ACAO(P, ORIGIN); b1b = await ACAO(P, "http://someone-else.example"); }
  finally { try { srv.kill(); } catch (_e) { /* 已退出 */ } }
  check("配了 config.json：ACAO 恒等于配置值（不再跟请求源走）",
    b1a === ORIGIN && b1b === ORIGIN, "匹配源=" + b1a + " 非匹配源=" + b1b);
  check("与基线形态不同（差分对照成立：宽松→固定）",
    b0a === "http://probe-a.example" && b1a === ORIGIN && b0a !== b1a,
    b0a + " → " + b1a);

  restoreUserCfg();

  console.log("\n=== 汇总：" + passN + "/" + (passN + failN) + " 通过 ===");
  process.exit(failN ? 1 : 0);
})().catch((e) => {
  console.error("config-check 异常：", e);
  restoreUserCfg();
  process.exit(2);
});
