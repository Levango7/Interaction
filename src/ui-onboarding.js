// ===== UI Layer (交互层·Onboarding 引导) =====
/* ---------- B：Onboarding 首次启动引导 ---------- */
/* B1：首次启动检测 —— v3.7.65 修正：只看「是否已标记 onboarded」。
   旧实现额外要求 tasks.length === 0，但启动链在 ui-global-events.js 顶层就调用了 seed()
   （首次启动播种 4 条演示任务），于是真实新用户永远得到 false —— 三步引导成为不可达路径。
   线上实测复现：清空 localStorage 后重载，演示数据被重新播种、onboarded 为空、引导不出现。 */
function needsOnboarding(){
  return !load(PREFIX+"onboarded", false);
}
// B2：引导 modal 内部状态（当前步 + 第 1 步要完成的那条演示任务 id）
let _onboardStepNo = 1;
let _onboardDemoId = null;
// 渲染指定步的 modal
function _onboardRenderStep(step){
  // 移除已有 modal
  const old = document.querySelector(".onboard-modal");
  if(old) old.remove();
  let html;
  if(step === 1){
    /* v3.7.66：第 1 步从「凭空建一条任务」改成「完成一条演示任务」。
       不是审美改动：首次启动 seed() 已放好演示任务，原文案「先创建你的第一个任务吧」与用户眼前的
       事实直接矛盾；而这个产品真正要教的第一件事是「标记完成 → 统计与联动立刻给反馈」，
       所以让它第 1 步就发生。没有未完成任务时（老数据全完成过的极端）退化为纯「下一步」。 */
    const _demo = getTasks().filter(function(x){ return x && x.status !== "done"; })[0] || null;
    _onboardDemoId = _demo ? _demo.id : null;
    html = `<div class="onboard-modal" id="onboardModal">
      <div class="onboard-card">
        <div class="onboard-step">第 ${step} / 3 步</div>
        <div class="onboard-title">${t("onboard.welcome")}</div>
        <div class="onboard-desc" data-i18n="onboard.step1Desc">这是帮你管理任务、养成习惯的本地工坊。屏幕上这几条是演示数据——先完成一条，感受「任务 → 统计与联动」的闭环。</div>
        ${_demo ? `<div class="card u-mt-2 u-fs-sm"><span class="u-text-dim" data-i18n="onboard.demoTaskLabel">演示任务：</span> <strong>${esc(_demo.title)}</strong></div>` : ""}
        <div class="onboard-actions">
          <button type="button" class="onboard-btn-secondary" id="onboardSkip" data-i18n="onboard.skip1">跳过</button>
          <button type="button" class="onboard-btn-primary" id="onboardDone" data-i18n="${_demo ? "onboard.completeDemo" : "onboard.next"}">${_demo ? t("onboard.completeDemo") : t("onboard.next")}</button>
        </div>
      </div>
    </div>`;
  }else if(step === 2){
    html = `<div class="onboard-modal" id="onboardModal">
      <div class="onboard-card">
        <div class="onboard-step">第 ${step} / 3 步</div>
        <div class="onboard-title" data-i18n="onboard.step2Title">场景联动 — 让正反馈转起来</div>
        <div class="onboard-desc" data-i18n="onboard.step2Desc">完成任务可以触发跨场景联动。比如交付任务完成后自动提醒你学习充电。</div>
        <div class="onboard-chain-demo">
          <span class="u-fw-600" style="color:${scCss(SCENARIOS.office.color)};font-size:var(--fs-lg)">${SCENARIOS.office.name}</span>
          <span class="arr">→</span>
          <span class="u-fw-600" style="color:${scCss(SCENARIOS.study.color)};font-size:var(--fs-lg)">${SCENARIOS.study.name}</span>
        </div>
        <div class="onboard-actions">
          <button type="button" class="onboard-btn-secondary" id="onboardSkip" data-i18n="onboard.skip2">跳过</button>
          <button type="button" class="onboard-btn-secondary" id="onboardTrigger" data-i18n="onboard.simulate">模拟触发</button>
          <button type="button" class="onboard-btn-primary" id="onboardNext" data-i18n="onboard.next">下一步</button>
        </div>
      </div>
    </div>`;
  }else if(step === 3){
    html = `<div class="onboard-modal" id="onboardModal">
      <div class="onboard-card">
        <div class="onboard-step">第 ${step} / 3 步</div>
        <div class="onboard-title" data-i18n="onboard.step3Title">配置 AI 助手（可选）</div>
        <div class="onboard-desc" data-i18n="onboard.step3Desc">配置 AI 后，每个场景都有专属 AI 助手帮你建任务、查总览、搜索。</div>
        <div class="onboard-actions">
          <button type="button" class="onboard-btn-secondary" id="onboardSkip" data-i18n="onboard.later">稍后再说</button>
          <button type="button" class="onboard-btn-primary" id="onboardConfig" data-i18n="onboard.goSettings">去设置</button>
        </div>
      </div>
    </div>`;
  }else{
    return;
  }
  // lint-xss-ok: html 为静态模板字面量，唯一插值是数字 step（1/2/3），无外部数据
  document.body.insertAdjacentHTML("beforeend", html);
  _onboardBindStep(step);
}
// 绑定每步按钮
function _onboardBindStep(step){
  const modal = document.getElementById("onboardModal");
  const close = ()=>{ if(modal) modal.remove(); };
  if(step === 1){
    /* v3.7.68：「跳过」按字面意思结束引导，而不是翻到下一步。
       旧接线是 close() + 渲染下一步 —— 按钮写着跳过，点了却再来一屏；移动端 modal 是全屏 sheet，
       既没有 Esc 也没有点遮罩关闭（src/ui-global-events.js 未接），等于把新用户按在三步里走不出来。 */
    const skip = document.getElementById("onboardSkip");
    if(skip) skip.onclick = ()=>{ close(); _finishOnboarding(); };
    const done = document.getElementById("onboardDone");
    if(done) done.onclick = ()=>{
      if(_onboardDemoId){
        const _dt = getTasks().filter(function(x){ return x && x.id === _onboardDemoId; })[0] || null;
        try{ completeTask(_onboardDemoId); }catch(e){ /* 完成动作本身失败也不该卡住引导 */ }
        toast(t("onboard.demoDone", "已把「{title}」标记完成，切到「统计」页就能看到反馈").replace("{title}", _dt ? _dt.title : ""), "ok");
      }
      close(); _onboardRenderStep(2);
    };
  }else if(step === 2){
    const skip = document.getElementById("onboardSkip");
    if(skip) skip.onclick = ()=>{ close(); _finishOnboarding(); };
    const trigger = document.getElementById("onboardTrigger");
    if(trigger) trigger.onclick = ()=>{
      // 创建一个 office 交付任务并完成，触发联动
      const tasks = getTasks();
      const _task = {id:uid(), sc:"office", title:t("onboard.deliveryTitle","交付上线 v2.3"), due:todayStr(), priority:"P1", status:"todo", doneAt:null, note:t("onboard.deliveryNote","onboarding 模拟触发"), tags:["onboarding"], created:Date.now()};
      tasks.push(_task);
      setTasks(tasks);
      completeTask(_task.id);
      toast(t("onboard.simTriggered", "已模拟触发：交付完成 → 自动生成学习充电任务"), "ok");
      /** @type {HTMLButtonElement} */(trigger).disabled = true; trigger.textContent = t("onboard.simTriggeredDone", "已触发");
    };
    const next = document.getElementById("onboardNext");
    if(next) next.onclick = ()=>{ close(); _onboardRenderStep(3); };
  }else if(step === 3){
    const skip = document.getElementById("onboardSkip");
    if(skip) skip.onclick = ()=>{ close(); _finishOnboarding(); };
    const config = document.getElementById("onboardConfig");
    if(config) config.onclick = ()=>{ close(); _finishOnboarding(); try{ AppBridge.openDrawer(); }catch(e){ /* noop */ } };
  }
}
// 引导完成：标记 onboarded 并渲染主界面
function _finishOnboarding(){
  save(PREFIX+"onboarded", true);
  try{ render(); AppBridge.checkCount(); dailyDigest(); }catch(e){ /* noop */ }
}
/* B2：渲染引导 modal（入口）—— v3.7.66「看过即记」：modal 一展示就写 onboarded 标记。
   旧语义要等走完三步 / 点到最后一次跳过才写，于是中途关页面或直接刷新的人下次从头再被弹一次；
   对免费期新用户，被同一个 modal 拦两道比少看一道更劝退。_finishOnboarding 仍会写一次（幂等）。 */
function renderOnboarding(){
  _onboardStepNo = 1;
  try{ save(PREFIX+"onboarded", true); }catch(e){ /* 存储不可用时退回「每次都弹」，不阻塞功能 */ }
  _onboardRenderStep(_onboardStepNo);
}
