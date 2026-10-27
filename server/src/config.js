/* server/src/config.js
 * 配置加载（v3.7.124 从 index.js 抽出为独立模块）
 * --------------------------------------------------
 * 为什么抽出来：原先 loadConfig() 长在入口文件里，导致「配置合并语义」这件事
 * **无法被单测**——require("../src/index") 会把整个 express 应用拉起来（副作用）。
 * 而配置合并恰恰是本仓摔过跤的地方（见下 v3.7.124 修的那个洞），不能靠肉眼守。
 * 抽出后 verify/config-check.cjs 可以直接 require 本模块做**断言级**验证，
 * 不需要起服务端。同时符合「入口文件只装配零业务」的分层纪律。
 *
 * 三层优先级（从低到高，后者覆盖前者）：
 *   1. config.example.json   —— 仓库随附基线，含全部安全默认值
 *   2. config.json           —— 用户本机配置文件（**不存在则跳过**，不进 git）
 *   3. 环境变量              —— 点号路径转大写双下划线，如 GITHUB__CLIENTID
 *
 * ⚠️ 深合并而不是整体替换：若把 config.json 整体盖掉基线，用户只写一节
 * （比如只配 github）时，`security.rateLimit` / `wechat.*` / `sync.*` 等**安全默认值
 * 会一起消失**，表现为限流失效、同步上限归零——而且没有任何报错。
 * 这类"静默丢失安全默认值"的坑比"读不到配置"更危险，所以合并必须是深合并。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EXAMPLE_PATH = path.join(ROOT, "config.example.json");
/* 2026-10-28：verify/*.cjs 的隔离钩子。脚本 spawn 出来的服务端会深合并本机的 config.json
   （个人密钥、dev 逃生舱开关都在里面），「未配置 / 拒 loopback」这类用例前提就被污染 ——
   CI 上没有 config.json 恒绿，本机跑脚本却假红。verify 脚本 spawn 时设
   AGENT_WORKBENCH_USER_CONFIG=<临时目录里不存在的路径> 即可屏蔽个人配置；不设则行为不变。 */
const USER_PATH = process.env.AGENT_WORKBENCH_USER_CONFIG
  ? path.resolve(process.env.AGENT_WORKBENCH_USER_CONFIG)
  : path.join(ROOT, "config.json");

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

/** 纯函数式深合并：只合并**普通对象**，数组与标量一律「以 over 为准」整份替换。
 *  base 不被修改（返回新对象），调用方可以放心复用基线对象。 */
function deepMerge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over === undefined ? base : over;
  if (!base || typeof base !== "object" || Array.isArray(base)) return over;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k of Object.keys(over)) {
    const b = out[k], o = over[k];
    if (o && typeof o === "object" && !Array.isArray(o)
        && b && typeof b === "object" && !Array.isArray(b)) out[k] = deepMerge(b, o);
    else out[k] = o;
  }
  return out;
}

/** 环境变量覆盖（点号路径 -> 大写双下划线）：SERVER__PORT、AUTH__EMAIL__SMTP__HOST ...
 *  语义保持 v3.7.124 之前不变：只覆盖**已存在的键**（不凭空造键），
 *  避免 "GITHUP__CLIENTID" 这类拼错的 env 名悄悄生效。 */
function applyEnv(obj, prefix) {
  Object.keys(obj).forEach(k => {
    const envKey = (prefix + k).toUpperCase().replace(/\./g, "__");
    const envVal = process.env[envKey];
    if (envVal !== undefined) {
      if (typeof obj[k] === "number") obj[k] = Number(envVal);
      else if (typeof obj[k] === "boolean") obj[k] = envVal === "true" || envVal === "1";
      else obj[k] = envVal;
    }
    if (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k])) applyEnv(obj[k], prefix + k + ".");
  });
}

function loadConfig() {
  const base = readJson(EXAMPLE_PATH) || {};

  let cfg = base;
  if (fs.existsSync(USER_PATH)) {
    /* v3.7.127：**空文件**（0 字节或纯空白）视为「未写任何配置」，与「文件不存在」同口径
       静默跳过。这个形态不是理论——README 教的「复制 config.example.json 为 config.json
       后编辑」中断一下就是空文件（2026-10-15 本机实测：0 字节 config.json 让服务端拒绝
       启动，报错还写成「JSON 语法有误」——把「没来得及写」误报成「写错了」，而用户面对
       这个报错会去找一个并不存在的语法错误）。
       边界：非空但语法有误仍然 fail loud（那是真的写错了，v3.7.125 的口径不变，
       verify/config-check.cjs ⑥ 组守护）。 */
    const raw = fs.readFileSync(USER_PATH, "utf8");
    if (raw.trim() !== "") {
      const user = readJson(USER_PATH);
      if (user === null) {
        /* v3.7.124：用户配置解析失败必须 fail loud。config.example.json 解析失败可以容忍
           （仓库随附文件，坏不了），但用户手写的 config.json 解析失败**绝不能静默跳过** ——
           那会让「改了配置却没生效」重新变成不可诊断问题（本轮修的正是这类静默）。 */
        throw new Error(
          "[config] 无法解析 " + USER_PATH + " —— JSON 语法有误（常见：尾随逗号、单引号、注释）。"
          + "修正它，或先改名备份后重启；服务端不会在配置不可读时按默认值启动。");
      }
      cfg = deepMerge(base, user);
    }
  }

  applyEnv(cfg, "");
  // 数据文件相对 server 根
  if (!path.isAbsolute(cfg.dataFile)) cfg.dataFile = path.join(ROOT, cfg.dataFile || "data/auth.json");
  return cfg;
}

module.exports = { loadConfig, deepMerge, readJson, applyEnv, ROOT, EXAMPLE_PATH, USER_PATH };
