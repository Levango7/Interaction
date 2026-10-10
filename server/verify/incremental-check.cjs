/* 增量同步（阶段 2）检查 —— 服务端真机验证脚本
 *
 * 运行：cd server && node verify/incremental-check.cjs
 *
 * 覆盖（每条都对着 docs/cloud-sync-incremental-contract.md §二 的契约口径）：
 *   ① 上行 + 回显；② 幂等重放；③ 跨设备下行；④ 显式删除信号（removed）；
 *   ⑤ 逐键 LWW（旧 ts 不覆盖新值）；⑥ 删除胜平局/复活规则；
 *   ⑦ **快照相干性**（增量写的键，全量 GET 必须看得到 —— 两条路同世界）；
 *   ⑧ 全量 PUT 重建增量视图（消失的键补墓碑、全部键取新 seq）；
 *   ⑨ 元键（`_` 前缀）不进视图 + 坏输入 400 + 无 token 401；
 *   ⑩ 剪枝 → needsFull（客户端据此回退全量）；
 *   ⑪ 跨用户隔离。
 *
 * 环境坑沿用另三份脚本：独立端口（4575，避开 Docker 占的 3001）+ Node fetch 直连（不读 http_proxy）。
 */
"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
const PORT = "4575";
const BASE = "http://127.0.0.1:" + PORT;

function startServer(extraEnv) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["src/index.js"], {
      cwd: SRV,
      env: Object.assign({}, process.env, { PORT, ALLOW_PLACEHOLDER_SECRETS: "true" }, extraEnv || {}),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { out += d.toString(); });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; clearInterval(tick);
      reject(new Error("启动超时\n子进程输出：[" + out + "]"));
    }, 20000); /* 20s：与 hardening-check 同口径（满载机器 8~10s 会假红） */
    const tick = setInterval(async () => {
      if (settled) return;
      try {
        const j = await (await fetch(BASE + "/api/health")).json();
        if (j && j.name === "agent-workbench-auth") { settled = true; clearTimeout(timer); clearInterval(tick); resolve(p); }
      } catch (_e) { /* 未就绪 */ }
    }, 200);
    p.on("error", (err) => { if (settled) return; settled = true; clearTimeout(timer); clearInterval(tick); reject(new Error("spawn 失败：" + err.message)); });
    p.on("exit", (code) => {
      if (settled || code === 0 || code === null) return;
      settled = true; clearTimeout(timer); clearInterval(tick);
      reject(new Error("进程退出 code=" + code + "\n子进程输出：[" + out + "]"));
    });
  });
}

let TOKEN = null;
async function hit(method, urlPath, body, opts) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  const wantAuth = opts ? opts.auth !== false : true;
  if (wantAuth && TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  const r = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (_e) { /* 非 JSON */ }
  return { status: r.status, json: j };
}
/** 走增量端点并直接把 data 拆出来：{ status, data:{token,changed,removed,needsFull}, raw } */
async function round(since, changes, removed) {
  const r = await hit("POST", "/api/sync/changes", { since: since || 0, changes: changes || [], removed: removed || [] });
  return { status: r.status, data: (r.json && r.json.data) || {}, raw: r.json };
}
const reg = async (mail) => (await hit("POST", "/api/auth/register", { email: mail, password: "abcd12345" }, { auth: false }));
const byKey = (arr, k) => (arr || []).filter((x) => x && x.k === k);

let passN = 0, failN = 0;
function check(label, cond, detail) {
  if (cond) { passN++; console.log("  PASS  " + label.padEnd(52) + (detail ? "| " + detail : "")); }
  else { failN++; console.log("  FAIL  " + label.padEnd(52) + (detail ? "| " + detail : "")); }
}
function group(name) { console.log("\n" + name); }

(async () => {
  let proc = await startServer();
  const T0 = Date.now();
  const K_TASKS = "wb_agent_tasks", K_NOTES = "wb_agent_notes", K_NEW = "wb_agent_chat_office";

  try {
    group("① 前置（同一账号的两个会话 = 「两台设备」；同步状态是 per-user 的）");
    const mailA = "incrA" + T0 + "@example.com", mailB = "incrB" + T0 + "@example.com";
    const rA = await reg(mailA);
    const tokA = rA.json && rA.json.data && rA.json.data.accessToken;
    check("注册 A 且拿到 token（设备 1 的会话）", rA.status === 200 && !!tokA, "HTTP " + rA.status);
    /* 「另一台设备」= 同一账号再登录一次拿第二个会话，而不是另一个账号 ——
       跨账号本来就不该互相看见（⑪ 专门验这一点），用两个账号会把「隔离」误判成「同步坏了」。 */
    const rB = await hit("POST", "/api/auth/login", { email: mailA, password: "abcd12345" }, { auth: false });
    const tokB = rB.json && rB.json.data && rB.json.data.accessToken;
    const rtA = rA.json && rA.json.data && rA.json.data.refreshToken;
    const rtB = rB.json && rB.json.data && rB.json.data.refreshToken;
    /* 判「第二台设备」看**独立会话**（refreshToken/sid 不同），不看 access token 字符串 ——
       同一秒内两次签发的 JWT 载荷相同、字符串本就一样（确定性签名），拿它判设备会假红。 */
    check("同账号第二次登录拿到独立会话（设备 2）", rB.status === 200 && !!tokB && !!rtB && rtB !== rtA, "HTTP " + rB.status);

    group("② 上行 + 回显 + 幂等");
    TOKEN = tokA;
    const ts1 = T0, ts2 = T0 + 1;
    const payload1 = { changes: [{ k: K_TASKS, v: "[]", ts: ts1 }, { k: K_NOTES, v: "[\"n1\"]", ts: ts1 }] };
    let a1 = await round(0, payload1.changes, []);
    check("A 首轮 200 且 needsFull=false", a1.status === 200 && a1.data.needsFull === false, "HTTP " + a1.status + " token=" + a1.data.token);
    check("token 为正（服务端水位已推进）", typeof a1.data.token === "number" && a1.data.token > 0);
    check("回显：changed 含刚上行两个键", byKey(a1.data.changed, K_TASKS).length === 1 && byKey(a1.data.changed, K_NOTES).length === 1);
    check("removed 为空", (a1.data.removed || []).length === 0);
    const tokA1 = a1.data.token;
    const a1b = await round(0, payload1.changes, []);
    check("幂等：同请求重放 token 不变", a1b.data.token === tokA1, "token " + a1b.data.token + " vs " + tokA1);
    check("幂等：changed 数量不重复增长", (a1b.data.changed || []).length === (a1.data.changed || []).length);

    group("③ 跨设备下行");
    TOKEN = tokB;
    const b1 = await round(0);
    check("B 首轮看到 A 上行的两个键（值一致）",
      byKey(b1.data.changed, K_TASKS)[0] && byKey(b1.data.changed, K_TASKS)[0].v === "[]" &&
      byKey(b1.data.changed, K_NOTES)[0] && byKey(b1.data.changed, K_NOTES)[0].v === "[\"n1\"]");
    const tokB1 = b1.data.token;

    group("④ 显式删除信号（removed）");
    const delTs = T0 + 10;
    const b2 = await round(tokB1, [], [{ k: K_NOTES, ts: delTs }]);
    check("B 删键 200 且回显 removed", b2.status === 200 && byKey(b2.data.removed, K_NOTES).length === 1);
    check("B 的 changed 不再含被删键", byKey(b2.data.changed, K_NOTES).length === 0);
    TOKEN = tokA;
    const a2 = await round(tokA1);
    check("A 增量轮拿到显式 removed（旧 since 也看得到）", byKey(a2.data.removed, K_NOTES).length === 1);
    check("A 的 changed 不含已删键", byKey(a2.data.changed, K_NOTES).length === 0);
    const tokA2 = a2.data.token;

    group("⑤ 逐键 LWW（旧 ts 不覆盖新值）");
    const oldTs = ts1 - 1000;              // 比既有 ts1 更旧
    const a3 = await round(tokA2, [{ k: K_TASKS, v: "[\"STALE\"]", ts: oldTs }], []);
    check("旧 ts 写入被拒（不改状态）", a3.data.token === tokA2, "token " + a3.data.token + " vs " + tokA2);
    const a4 = await round(a3.data.token);
    check("since 之后该键无新变更（token 未推进）", byKey(a4.data.changed, K_TASKS).length === 0);
    const snapStale = await hit("GET", "/api/sync/snapshot", null);
    check("快照里仍是原值（旧 ts 的 STALE 被 LWW 拒掉）",
      snapStale.json && snapStale.json.data && snapStale.json.data.snapshot && snapStale.json.data.snapshot[K_TASKS] === "[]",
      "tasks=" + (snapStale.json && snapStale.json.data && snapStale.json.data.snapshot ? snapStale.json.data.snapshot[K_TASKS] : "-"));
    const newTs = T0 + 20;
    const a5 = await round(a4.data.token, [{ k: K_TASKS, v: "[\"FRESH\"]", ts: newTs }], []);
    check("新 ts 写入生效", byKey(a5.data.changed, K_TASKS)[0] && byKey(a5.data.changed, K_TASKS)[0].v === "[\"FRESH\"]");
    TOKEN = tokB;
    const b3 = await round(tokB1);
    check("B 能看到 A 的最新值（跨设备 LWW 收敛）", byKey(b3.data.changed, K_TASKS)[0] && byKey(b3.data.changed, K_TASKS)[0].v === "[\"FRESH\"]");
    const tokB2 = b3.data.token;

    group("⑥ 删除 vs 更新的平局/复活规则");
    const reviveTs = delTs + 1000;
    TOKEN = tokA;
    const a6 = await round(a5.data.token, [{ k: K_NOTES, v: "[\"n2\"]", ts: reviveTs }], []);
    check("更新 ts 更新于墓碑 → 键复活（回到 changed）", byKey(a6.data.changed, K_NOTES)[0] && byKey(a6.data.changed, K_NOTES)[0].v === "[\"n2\"]");
    check("且 removed 里不再有它（墓碑已清）", byKey(a6.data.removed, K_NOTES).length === 0);
    const tieTs = reviveTs;
    const a7 = await round(a6.data.token, [], [{ k: K_NOTES, ts: tieTs }]);
    check("同 ts 删除胜（确定性平局规则）", byKey(a7.data.removed, K_NOTES).length === 1);
    const a8 = await round(a7.data.token, [{ k: K_NOTES, v: "[\"n3\"]", ts: tieTs }], []);
    check("同 ts 更新不得复活（防重放复活）", byKey(a8.data.changed, K_NOTES).length === 0);

    group("⑦ 快照相干性（增量写 → 全量 GET 必须看得到）");
    const snapA = await hit("GET", "/api/sync/snapshot", null);
    const snapObj = snapA.json && snapA.json.data && snapA.json.data.snapshot;
    check("GET /snapshot 200 且有快照", snapA.status === 200 && !!snapObj);
    check("增量写入的键出现在全量快照（tasks=FRESH）", snapObj && snapObj[K_TASKS] === "[\"FRESH\"]", snapObj ? "tasks=" + snapObj[K_TASKS] : "-");
    check("被删键不在全量快照", snapObj && !(K_NOTES in snapObj));

    group("⑧ 全量 PUT 重建增量视图（两条路同世界）");
    TOKEN = tokA;
    const snapAt = T0 + 30;
    const put = await hit("PUT", "/api/sync/snapshot", { snapshot: { [K_TASKS]: "[\"FULL\"]", [K_NEW]: "[\"c1\"]", _deviceMeta: { deviceId: "dev-A" } }, updatedAt: snapAt });
    check("全量 PUT 200", put.status === 200);
    const snapA2 = await hit("GET", "/api/sync/snapshot", null);
    const s2 = snapA2.json && snapA2.json.data && snapA2.json.data.snapshot;
    check("全量 GET 与刚 PUT 一致（键集/值）",
      s2 && s2[K_TASKS] === "[\"FULL\"]" && s2[K_NEW] === "[\"c1\"]" && !(K_NOTES in s2) && s2._deviceMeta && s2._deviceMeta.deviceId === "dev-A");
    TOKEN = tokB;
    const b4 = await round(tokB2);
    check("B 增量轮：全量重定义后的键都取了新 seq（能看到 tasks=FULL 与 chat）",
      byKey(b4.data.changed, K_TASKS)[0] && byKey(b4.data.changed, K_TASKS)[0].v === "[\"FULL\"]" && byKey(b4.data.changed, K_NEW).length === 1);
    const tokB3 = b4.data.token;

    group("⑨ 元键与坏输入");
    TOKEN = tokA;
    const a9 = await round(a8.data.token, [{ k: "_deviceMeta", v: "{\"x\":1}", ts: T0 + 40 }], [{ k: "_meta", ts: T0 + 40 }]);
    check("_ 前缀元键被忽略（不进 changed/removed）", byKey(a9.data.changed, "_deviceMeta").length === 0 && byKey(a9.data.removed, "_meta").length === 0);
    const bad = await hit("POST", "/api/sync/changes", { since: 0, changes: "nope", removed: [] });
    check("changes 非数组 → 400 invalid_changes", bad.status === 400 && bad.json && bad.json.error === "invalid_changes", "HTTP " + bad.status);
    const savedTok = TOKEN; TOKEN = null;
    const noTok1 = await hit("POST", "/api/sync/changes", { since: 0, changes: [], removed: [] }, { auth: false });
    const noTok2 = await hit("GET", "/api/sync/snapshot", null, { auth: false });
    check("增量端点无 token → 401", noTok1.status === 401, "HTTP " + noTok1.status);
    check("全量端点无 token → 401", noTok2.status === 401, "HTTP " + noTok2.status);
    TOKEN = savedTok;

    group("⑩ 剪枝 → needsFull（客户端据此回退全量）");
    const many = [];
    for (let i = 0; i < 210; i++) many.push({ k: "wb_agent_gone_" + i, ts: T0 + 100 + i });
    const a10 = await round(a9.data.token, [], many);
    check("一次 210 条删除 200", a10.status === 200);
    const a11 = await round(a10.data.token);
    check("跟得上水位 → needsFull=false", a11.data.needsFull === false);
    const a12 = await round(0);
    check("since=0（落后于剪枝下限）→ needsFull=true", a12.data.needsFull === true, "prunedBelow 已推进");
    check("needsFull 时不返回半份视图（changed/removed 空）", (a12.data.changed || []).length === 0 && (a12.data.removed || []).length === 0);

    group("⑪ 跨用户隔离（另一个账号不许看见）");
    const rC = await reg("incrC" + T0 + "@example.com");
    TOKEN = rC.json && rC.json.data && rC.json.data.accessToken;
    const c1 = await round(0);
    check("新用户 C 看不到 A/B 的任何键", (c1.data.changed || []).length === 0 && (c1.data.removed || []).length === 0);
    check("C 的 token 独立从 0 起", c1.data.token === 0, "token=" + c1.data.token);

    group("⑫ mv+提示：冲突检测 / 清单下发 / 解决（服务端声明策略）");
    /* 策略是进程级配置 → 同端口同数据文件重启一台 mv 机（数据从磁盘重载，用户与 token 不变
       —— JWT 密钥同源；端口需等旧进程退出后再绑）。前面所有组跑在默认 lww 上，行为零变化。 */
    try { proc.kill(); } catch (e) { /* 已退出 */ }
    await new Promise((r) => setTimeout(r, 800));
    proc = await startServer({ SYNC__CONFLICTPOLICY: "mv" });
    /* 重启后先各取一个新 token：⑩ 组的剪枝已把 prunedBelow 推高，旧 token 会触发 needsFull
       （响应 changed/removed 为空 —— 本身是正确行为，但会让"值是否回显"的断言失真） */
    TOKEN = tokA; const tokAF = (await round(0)).data.token;
    TOKEN = tokB; const tokBF = (await round(0)).data.token;
    const K_CONF = "wb_agent_conf_demo", K_CONF2 = "wb_agent_conf_demo2", K_CONF3 = "wb_agent_conf_demo3";
    const aFirst = await round(tokAF, [{ k: K_CONF, v: "vA", ts: T0 + 5000 }]);
    check("响应声明策略 = mv", aFirst.data.conflictPolicy === "mv", "policy=" + aFirst.data.conflictPolicy);
    check("新写的值本身不产生冲突（清单为空）", (aFirst.data.conflicts || []).length === 0);
    /* B 端用更新 ts 写同一键 → 正常落定 */
    TOKEN = tokB;
    const bNew = await round(tokBF, [{ k: K_CONF, v: "vB", ts: T0 + 9000 }]);
    check("B 的新值正常落定", byKey(bNew.data.changed, K_CONF).some((x) => x.v === "vB"));
    /* A 端再用更旧的 ts 写 → 输的一方进冲突清单；A 拿到的服务端值仍是 vB（旧值没应用上去） */
    TOKEN = tokA;
    const aOld = await round(tokAF, [{ k: K_CONF, v: "vA-old", ts: T0 + 100 }]);
    const cf = (aOld.data.conflicts || []).find((c) => c.k === K_CONF);
    check("旧 ts 的变更被记进冲突清单", !!cf);
    check("清单含双方值与记录时刻", !!cf && cf.local.v === "vA-old" && cf.remote.v === "vB" && cf.at > 0);
    check("服务端值未被旧值覆盖（A 拿到的仍是 vB）", byKey(aOld.data.changed, K_CONF).some((x) => x.v === "vB"));
    /* resolve = local：本机值生效，清单清空 */
    const resLocal = await hit("POST", "/api/sync/resolve", { k: K_CONF, choice: "local", ts: T0 + 12000 }, { auth: true });
    check("resolve=local → 200", resLocal.status === 200 && resLocal.json && resLocal.json.ok === true, "HTTP " + resLocal.status);
    const afterLocal = await round(aOld.data.token);
    check("解决后本机值生效", byKey(afterLocal.data.changed, K_CONF).some((x) => x.v === "vA-old"));
    check("冲突清单已清空", (afterLocal.data.conflicts || []).length === 0);
    /* 再造一条 → resolve = remote：A 拿到的是服务端值 */
    TOKEN = tokB;
    const bNew2 = await round(tokBF, [{ k: K_CONF2, v: "vB2", ts: T0 + 13000 }]);
    TOKEN = tokA;
    const aOld2 = await round(tokAF, [{ k: K_CONF2, v: "vA2", ts: T0 + 200 }]);
    check("第二条冲突被记录", (aOld2.data.conflicts || []).some((c) => c.k === K_CONF2));
    const resRemote = await hit("POST", "/api/sync/resolve", { k: K_CONF2, choice: "remote", ts: T0 + 14000 }, { auth: true });
    const afterRemote = await round(aOld2.data.token);
    check("resolve=remote → A 拿到的是服务端值 vB2", byKey(afterRemote.data.changed, K_CONF2).some((x) => x.v === "vB2"));
    check("两条冲突都已清", (afterRemote.data.conflicts || []).length === 0);
    /* 坏 choice 要在**存在冲突**的键上验（已解决的键返回 404 也是正确语义，单独验） */
    TOKEN = tokB;
    await round(tokBF, [{ k: K_CONF3, v: "vB3", ts: T0 + 18000 }]);
    TOKEN = tokA;
    await round(tokAF, [{ k: K_CONF3, v: "vA3", ts: T0 + 300 }]);
    const badChoice = await hit("POST", "/api/sync/resolve", { k: K_CONF3, choice: "bogus", ts: T0 + 15000 }, { auth: true });
    check("对存在冲突的键传非法 choice → 400 invalid_choice", badChoice.status === 400 && badChoice.json && badChoice.json.error === "invalid_choice", "HTTP " + badChoice.status);
    const solved = await hit("POST", "/api/sync/resolve", { k: K_CONF, choice: "local", ts: T0 + 16000 }, { auth: true });
    check("已解决的键再解决 → 404（幂等收口）", solved.status === 404, "HTTP " + solved.status);
    const noConf = await hit("POST", "/api/sync/resolve", { k: "wb_agent_never_conflicted", choice: "local", ts: T0 + 17000 }, { auth: true });
    check("解决从未冲突的键 → 404", noConf.status === 404, "HTTP " + noConf.status);
    const noTok = await hit("POST", "/api/sync/resolve", { k: K_CONF3, choice: "local", ts: T0 + 19000 }, { auth: false });
    check("resolve 无 token → 401", noTok.status === 401, "HTTP " + noTok.status);
  } finally {
    try { proc.kill(); } catch (_e) { /* 已退出 */ }
  }

  console.log("\n=== 汇总：" + passN + "/" + (passN + failN) + " 通过 ===");
  process.exit(failN ? 1 : 0);
})().catch((e) => {
  console.error("验证脚本异常：", e);
  process.exit(2);
});
