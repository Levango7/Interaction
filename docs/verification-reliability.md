# 验证可靠性改造（2026-10-12 · 用户拍板「不要造成信息丢失，导致答复出问题」）

> 起因：2026-10-11~12 一天的真机验收连抓四个真 bug（信封 P0 / Linear teamId / WebDAV ETag /
> 加上探针自身两个错），证明「契约全绿 ≠ 能跑」。但同一天也连踩一串**验证链自身**的坑：
> 它们不改变产品对错，却让**我的答复不可信**——那才是用户不满的来源。本文把这类坑
> 分类、定规则、落机械化守卫。

## 一、今天实际发生的五类「答复可能失真」

| # | 现象 | 后果 | 归属 |
|---|---|---|---|
| 1 | `npm run e2e \| tail -2` 显示 exit 0，实际 2 失败 | **谎报绿**（tail 吃了真退出码） | 度量方式 |
| 2 | 本机 e2e harness 卡死（600s、worker/teardown 双挂），输出只有「96 did not run」 | **既非绿也非红**，无法判 | 环境 |
| 3 | 我 `taskkill` 清残留浏览器误杀 Playwright 自己的 headless_shell → launch 全挂 | 把环境弄坏还以为是产品问题 | 操作 |
| 4 | 探针首跑红，但**不带响应体**（409 不知道为什么），连猜三轮（路径/引号） | 定位绕远、结论晚到 | 工具 |
| 5 | `src:extract` 用旧 HTML 把我的 src 编辑静默冲掉 | **自己的工作无声丢失** | 双态架构 |

共同结构：**信息在链条某一环被静默吞掉**（退出码、失败详情、响应体、编辑、环境状态）。
所以改良的总原则不是「更仔细」，而是**每一环都必须把「我不知道」变成显式输出**。

## 二、五条规则（写进协作纪律）

1. **验证命令禁止接管道**。退出码是判据的一部分，管道只保留最后一个命令的退出码。
   一律落盘再看：`<cmd> > log 2>&1; echo exit=$?; grep -E "passed|failed|did not run" log`。
2. **「没有失败信息」的红色一律视为「未判定」，不得表述为通过**。 harness 挂起、
   worker 退出、零用例执行——三种都不是绿。
3. **断言变红先问「是谁错了」**：产品错了→修产品；测试编码了旧行为→修测试前提；
   环境错了→修环境或宣布本机判定通道不可用、判据交 CI。**不允许为了绿灯放宽断言**。
4. **探针/脚本红时必须打印对端响应体**。猜不出原因的红，九成是探针自己错了。
5. **清理进程只杀页面级**（chrome.exe 的页面实例），**绝不动 headless_shell /
   Playwright 自己的二进制**；误伤后的修复代价是整条本地判定通道。

## 三、机械化守卫（本批落地）

### 1. `scripts/verify-run.mjs` —— 验证命令的统一入口

用法：`node scripts/verify-run.mjs "<标签>" -- <命令...>`

- 输出落 `verify-out/<标签>-<时间戳>.log`（不进版本库）；
- 结束时打印**单行判据**：`[verify] ✓|✗ <标签> exit=N · passed=X · failed=Y · did-not-run=Z`；
- 退出码原样透传；管道事故从此不可能（本脚本内部不接管道，调用方也不接）。
- `passed/failed/did-not-run` 从 vitest / playwright 两套摘要里抽（兼容现有格式）。

### 2. `scripts/check-browser.mjs` —— 本机浏览器环境预检

用法：`node scripts/check-browser.mjs`（退出码 0 = 可用，78 = 不可用）

- 真启动 chromium → 开 `data:text/html` 页 → 断言 `document.title` 可取 → 关闭；
- **不可用时明确说「本机 Playwright 判定通道不可用，e2e 判据以 CI 为准」**，
  而不是让测试挂 600 分钟吐出三行「did not run」。
- `scripts/run-e2e.mjs` 已改为**先跑预检**：不可用则直接以 78 退出并打印上面那句话
  （CI runner 上预检通过，行为不变）。

### 3. `run-e2e.mjs` 自带看门狗

- 超过 `E2E_WATCHDOG_MS`（默认 20 分钟）仍在跑 → 主动 kill 子进程、打印已输出尾部
  30 行 + `chrome` 进程数，退出码 79（= 未判定）。本机 harness 卡死从此**有结论**，
  不会再出现「跑了两小时只有三行输出」。

## 四、验收（这批自己的判据）

- `verify-run` 对三种命令各跑一次：成功命令 → `✓ exit=0`；失败命令 → `✗ exit=1`；
  挂起命令（`sleep` 超看门狗）→ `未判定 exit=79` 且带尾部输出。
- `check-browser` 在本机当前（坏）环境 → 78 + 人话提示；修好后 → 0。
- `run-e2e` 在坏环境下 → 78 且**不再出现 600s 静默挂起**。

### 4. 补充：globalSetup 才是双态预检的**正确位置**（当天二次修正）

设计初稿把「拼回 HTML」放在 `run-e2e.mjs` 里 —— 实测证明**放错了**：经
`scripts/verify-run.mjs` 包装或裸 `npx playwright test` 调用时那个 runner 被绕过，
预检不触发，HTML 停在源码态，57~70 个用例报 `setActive is not defined` /
`AppBridge is not defined` / `window.apiLogin is not a function` —— **全是假红**，
定位花了两轮 20 分钟。最终改放到 `playwright.config.js` 的 `globalSetup`
（`tests/e2e/global-setup.cjs`）——Playwright 每次运行都走的入口，**绕过任何
runner 都仍然生效**；CI 上本就是交付态，这一步是 no-op。

> 教训与四-2 同族：**守卫要放在「不可能被绕过」的那一层**，而不是某条调用路径上。

**最硬的实证**：源码态下经包装器跑 e2e → globalSetup 自动拼回 → **96/96 全绿**（5 分钟）；
而在 globalSetup 之前，同一条命令是 57 失败的假红。

## 五、明确不做

- 不重写 e2e 框架、不换 runner（那是另一次重构，且今天的问题是度量层不是框架层）；
- 不给「本机跑不动」自动重试 N 次（重试只会把 20 分钟变成 2 小时，且仍无结论）；
- 不把手动步骤（UI 六步）自动化掉（它们要 Electron 真窗口，归到用户侧）。
