/**
 * autoDangerConfirm.js —— dangerConfirm 浮层的「自动接盘器」
 * ----------------------------------------------------------------------------
 * 为什么需要它：生产侧把原生 confirm() 换成 dangerConfirm() 真浮层后，jsdom 测试里
 * 再没有人替它们点「确认执行」了。`tests/helpers/loadApp.js` 里那句
 * `window.confirm = () => true` 只对**原生** confirm 生效，对 dangerConfirm 毫无作用
 * —— 于是 Import / 回滚这些流程会永远停在 `await dangerConfirm(...)` 上，
 * 调用方最终以异常收场（实测：`P0-4 用例 C` 的 `threw` 变 true，一批用例同时红）。
 *
 * 本助手让浮层一出现就点「确认执行」，**语义与旧的 confirm 替身完全等价**
 * （旧替身同样是"无条件确认"），从而让那批"测的是导入宽容度 / 错误告警 / 跨设备
 * Key 迁移、与确认 UX 无关"的用例继续测它们真正要测的东西。
 *
 * 只给这类用例用。**测确认框本身行为的用例不要用它** —— 那些必须显式点 Yes/No/Esc，
 * 才能证明"确认前动作未发生 / 确认后才发生"（参见 confirm-migration-batch*.test.js）。
 *
 * 三条设计约束（都是实测踩出来的）：
 *   ① 窗口被 afterEach 关掉后必须自己停 —— 否则轮询会打到 undefined DOM 上，
 *      产出与本次改动无关的 Unhandled Rejection 噪声；
 *   ② 点完立刻停，不留常驻计时器；
 *   ③ 超时兜底：等不到浮层也要停（避免用例本身失败时无限轮询拖垮全量）。
 */
export function autoDangerConfirm(win, { timeout = 8000, interval = 10 } = {}) {
  let stopped = false;
  const started = Date.now();

  const tick = () => {
    if (stopped) return;
    let yes = null;
    try {
      yes = win.document.getElementById("dangerConfirmModalYes");
    } catch (_e) {
      stopped = true; /* 窗口已关闭：就地停，别把噪声留到 afterEach 之后 */
      return;
    }
    if (yes) {
      stopped = true;
      yes.click();
      return;
    }
    if (Date.now() - started > timeout) { stopped = true; return; }
    setTimeout(tick, interval);
  };

  tick();
  return () => { stopped = true; };
}
