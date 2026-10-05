/* spawn-available.js —— 判定「本机是否允许派生子进程」的共享助手
   ----------------------------------------------------------------------------
   背景（2026-10-05 实测取证）：本机沙箱**禁止一切子进程派生**。`spawnSync` /
   `execFileSync` 的返回/抛出形态固定为：

     execFileSync: 抛 Error，e.code === "EBUSY"、e.status === null、
                   e.message === "spawnSync node EBUSY"、e.stdout === ""、e.stderr === ""
     spawnSync:    返回对象，r.status === null、r.error.code === "EBUSY"、
                   r.stdout === ""、r.stderr === ""

   连 `node -e "console.log(1)"` 都跑不起来。后果是 `tests/color-tokens.test.js`
   与 `tests/build-structure.test.js` 里 4 个用例**必然失败**，且失败形态是
   「空 stdout 上的断言失败」（`expected '' to contain 'PASS'`）——**与真回归无法区分**，
   会把「本机环境限制」伪装成「代码坏了」。

   本助手只做一件事：把「因沙箱限制而无法派生」这一**唯一**特征识别出来，供调用方
   显式 `skip` 并打印原因。**它只影响本机**：

     · CI / 正常环境：子进程可用 → 派生的真实 status 被正常断言，行为**完全不变**；
     · 本机沙箱：识别为不可用 → `skip`（不是 pass、不是 fail），并在输出里写明原因。

   ⚠️ 判据刻意收窄到 `code === "EBUSY"`。**不**把「status===null 且输出为空」泛化为
   沙箱特征 —— 真回归也可能是该形态（进程被 OOM kill / 被信号终止），泛化会放过真 bug。
   EBUSY 是本机沙箱的独有指纹，正常环境不会在 spawn 上出现。
*/

/** 从 execFileSync 抛出的 Error 判断是否为沙箱禁止派生 */
export function isSandboxSpawnError(err) {
  return !!(err && err.code === "EBUSY");
}

/** 从 spawnSync 的返回对象判断是否为沙箱禁止派生 */
export function isSandboxSpawnResult(r) {
  return !!(r && r.error && r.error.code === "EBUSY");
}

/** 供 skip 消息复用的统一说明 */
export const SANDBOX_SKIP_REASON =
  "本机沙箱禁止子进程派生（spawnSync/execFileSync 一律 EBUSY）—— " +
  "该用例在 CI / 正常环境执行；本机跳过而非判失败，避免把环境限制伪装成代码回归。";
