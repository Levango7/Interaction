/**
 * prod-startup-guard.test.js —— v3.7.157 生产启动守卫的真机守护
 * ----------------------------------------------------------------------------
 * 守卫语义：NODE_ENV=production 且 dev.allowUnsafeDevEndpoints=true ⇒ 进程
 * 拒绝启动（exit 1 + 指路报错）。它把 server/README 里「生产必须为 false」
 * 从**手册规则**变成**强制门**——此前运维忘了改就是静默裸奔（开关放行的是
 * 完整认证绕过：/wechat/confirm 凭 email 直签 token）。
 *
 * 测试两层：
 *   1. 纯函数 unsafeProdStartup 的判据矩阵（含开关来源不区分：config.json 与
 *      环境变量合并后只看最终值）；
 *   2. 真起三个服务端子进程（spawn node src/index.js）：
 *      A 生产 + 开关开  → 非零退出 + 报错含「拒绝启动」
 *      B 非生产 + 开关开 → 正常监听（本地联调不受守卫误伤）
 *      C 生产 + 开关关  → 正常监听（干净配置在生产环境照常启动）
 *     子进程用 AGENT_WORKBENCH_USER_CONFIG 隔离钩子屏蔽本机 config.json
 *     （真实密钥/开关不得混入测试判据），dataFile 与端口都走临时值。
 */
import { test, expect } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, "..", "server");
const { unsafeProdStartup, applyEnv } = require_(path.join(SERVER_DIR, "src", "config.js"));

test("unsafeProdStartup 判据矩阵", () => {
  expect(unsafeProdStartup({ dev: { allowUnsafeDevEndpoints: true } }, "production")).toBe(true);
  expect(unsafeProdStartup({ dev: { allowUnsafeDevEndpoints: true } }, "development")).toBe(false);
  expect(unsafeProdStartup({ dev: { allowUnsafeDevEndpoints: true } }, undefined)).toBe(false);
  expect(unsafeProdStartup({ dev: { allowUnsafeDevEndpoints: false } }, "production")).toBe(false);
  expect(unsafeProdStartup({}, "production")).toBe(false);
  expect(unsafeProdStartup(null, "production")).toBe(false);
  // 非严格 true：JSON 里写字符串 "true" 经 env 覆盖路径已转布尔，此处只防漏网
  expect(unsafeProdStartup({ dev: { allowUnsafeDevEndpoints: "true" } }, "production")).toBe(false);
  expect(unsafeProdStartup({ dev: { allowUnsafeDevEndpoints: 1 } }, "production")).toBe(false);
});

test("applyEnv 回归：环境变量名与配置节同名不能抹掉整节（v3.7.157）", () => {
  // 实证触发态：vitest worker 带 DEV=1（回归守护无论本机是否有这个变量都成立）
  const savedDev = process.env.DEV, savedLeaf = process.env.DEV__ALLOWUNSAFEDEVENDPOINTS;
  process.env.DEV = "1";
  process.env.DEV__ALLOWUNSAFEDEVENDPOINTS = "true";
  try {
    const cfg = { port: 3001, dev: { allowUnsafeDevEndpoints: false }, security: { rateLimit: { loginMax: 10 } } };
    applyEnv(cfg, "");
    // 节必须仍是对象（旧实现会把 dev 替换成字符串 "1"）
    expect(typeof cfg.dev).toBe("object");
    expect(cfg.dev).toEqual({ allowUnsafeDevEndpoints: true }); // 叶子覆盖在节存活后必须生效
    expect(cfg.security).toEqual({ rateLimit: { loginMax: 10 } }); // 递归仍在，未受影响
    expect(cfg.port).toBe(3001); // 数字叶子保持数字语义
  } finally {
    if (savedDev === undefined) delete process.env.DEV; else process.env.DEV = savedDev;
    if (savedLeaf === undefined) delete process.env.DEV__ALLOWUNSAFEDEVENDPOINTS; else process.env.DEV__ALLOWUNSAFEDEVENDPOINTS = savedLeaf;
  }
});

/** 占一个临时空闲端口（listen(0) 语义）；index.js 的 PORT 判定是 `Number(env.PORT) || cfg.port`，
 *  PORT=0 是 falsy 会落到 cfg.port，所以必须给真端口。 */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/** 起一个服务端子进程；opts.nodeEnv=undefined 表示显式删除该环境变量（模拟本地联调）。 */
function bootServer({ nodeEnv, unsafeFlag }) {
  return new Promise((resolve) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aw-prodguard-"));
    const env = Object.assign({}, process.env, {
      AGENT_WORKBENCH_USER_CONFIG: path.join(tmp, "no-config.json"), // 隔离本机 config.json
      JWT__ACCESSSECRET: "test-access-secret-7f3a9c",
      JWT__REFRESHSECRET: "test-refresh-secret-1b2d4e",
      DATAFILE: path.join(tmp, "auth.json"),
    });
    delete env.NODE_ENV;
    if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;
    if (unsafeFlag !== undefined) env.DEV__ALLOWUNSAFEDEVENDPOINTS = unsafeFlag;

    freePort().then((port) => {
      env.PORT = String(port);
      const proc = spawn(process.execPath, ["src/index.js"], {
        cwd: SERVER_DIR,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "", err = "", settled = false;
      const finish = (r) => { if (!settled) { settled = true; resolve(r); } };
      proc.stdout.on("data", (c) => { out += c; });
      proc.stderr.on("data", (c) => { err += c; });
      const timer = setTimeout(() => {
        try { proc.kill(); } catch (e) { /* 超时兜底 */ }
        finish({ timedOut: true, out, err });
      }, 15_000);
      proc.on("exit", (code) => {
        clearTimeout(timer);
        clearInterval(started);
        finish({ code, out, err });
      });
      // 监听成功信号：启动日志出现即视为「起了」（再 kill 收尾）
      const started = setInterval(() => {
        if (/listening on http:\/\/localhost:/.test(out)) {
          clearInterval(started);
          clearTimeout(timer);
          try { proc.kill(); } catch (e) { /* kill 失败让 exit 兜底 */ }
          finish({ code: null, out, err, started: true });
        }
      }, 80);
    }).catch((e) => resolve({ bootError: String((e && e.message) || e) }));
  });
}

test("A 生产环境 + 开关开 → 拒绝启动（非零退出 + 指路报错）", async () => {
  const r = await bootServer({ nodeEnv: "production", unsafeFlag: "true" });
  expect(r.bootError).toBeFalsy();
  expect(r.timedOut).toBeFalsy();
  expect(r.started).toBeFalsy();
  expect(r.code).not.toBe(0);
  expect(r.err).toContain("拒绝启动");
  expect(r.err).toContain("allowUnsafeDevEndpoints");
}, 30_000);

test("B 非生产（本地联调）+ 开关开 → 正常启动", async () => {
  const r = await bootServer({ nodeEnv: undefined, unsafeFlag: "true" });
  expect(r.bootError).toBeFalsy();
  expect(r.started).toBe(true);
  expect(/listening on http:\/\/localhost:/.test(r.out)).toBe(true);
}, 30_000);

test("C 生产环境 + 开关关（干净配置） → 正常启动", async () => {
  const r = await bootServer({ nodeEnv: "production", unsafeFlag: "false" });
  expect(r.bootError).toBeFalsy();
  expect(r.started).toBe(true);
  expect(/listening on http:\/\/localhost:/.test(r.out)).toBe(true);
}, 30_000);
