// ===== UI Layer (交互层·Onboarding 引导) =====
/* ---------- B：Onboarding 首次启动引导 ---------- */
// B1：首次启动检测（未标记 onboarded 且无任务）
function needsOnboarding(){
  if(load(PREFIX+"onboarded", false)) return false;
  const tasks = getTasks();
  return tasks.length === 0;
}
// B2：引导 modal 内部状态（当前步 + step1 选中的场景）
let _onboardStepNo = 1;
let _onboardSelectedSc = "office";
// 渲染指定步的 modal
function _onboardRenderStep(step){
  // 移除已有 modal
  const old = document.querySelector(".onboard-modal");
  if(old) old.remove();
  let html;
  if(step === 1){
    html = `<div class="onboard-modal" id="onboardModal">
      <div class="onboard-card">
        <div class="onboard-step">第 ${step} / 3 步</div>
        <div class="onboard-title">${t("onboard.welcome")}</div>
        <div class="onboard-desc" data-i18n="onboard.step1Desc">这是一个帮你管理任务、养成习惯的工具。先创建你的第一个任务吧！</div>
        <div class="onboard-scenarios" id="onboardSc">
          ${ORDER.map(sc=>`<button type="button" class="onboard-sc-btn${sc===_onboardSelectedSc?" selected":""}" data-sc="${sc}">${SCENARIOS[sc].name}</button>`).join("")}
        </div>
        <input class="onboard-input" id="onboardTaskInput" placeholder="任务标题，如 写周报 / 修复报错 / 缴水电费" data-i18n-placeholder="field.onboardTaskInputPh">
        <div class="onboard-actions">
          <button type="button" class="onboard-btn-secondary" id="onboardSkip" data-i18n="onboard.skip1">跳过</button>
          <button type="button" class="onboard-btn-primary" id="onboardCreate" data-i18n="onboard.create">创建</button>
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
          <span class="u-fw-600" style="color:${SCENARIOS.office.color};font-size:var(--fs-lg)">${SCENARIOS.office.name}</span>
          <span class="arr">→</span>
          <span class="u-fw-600" style="color:${SCENARIOS.study.color};font-size:var(--fs-lg)">${SCENARIOS.study.name}</span>
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
  document.body.insertAdjacentHTML("beforeend", html);
  _onboardBindStep(step);
}
// 绑定每步按钮
function _onboardBindStep(step){
  const modal = document.getElementById("onboardModal");
  const close = ()=>{ if(modal) modal.remove(); };
  if(step === 1){
    document.querySelectorAll("#onboardSc .onboard-sc-btn").forEach(b=> /** @type {HTMLElement} */(b).onclick=()=>{
      _onboardSelectedSc = /** @type {HTMLElement} */(b).dataset.sc;
      document.querySelectorAll("#onboardSc .onboard-sc-btn").forEach(x=> x.classList.remove("selected"));
      b.classList.add("selected");
    });
    const skip = document.getElementById("onboardSkip");
    if(skip) skip.onclick = ()=>{ close(); _onboardRenderStep(2); };
    const create = document.getElementById("onboardCreate");
    if(create) create.onclick = ()=>{
      const input = /** @type {HTMLInputElement} */(document.getElementById("onboardTaskInput"));
      const title = input ? input.value.trim() : "";
      if(!title){ toast(t("onboard.titleRequired", "请输入任务标题"), "warn"); return; }
      const tasks = getTasks();
      tasks.push({id:uid(), sc:_onboardSelectedSc, title, due:todayStr(), priority:"", status:"todo", doneAt:null, note:"", tags:[], created:Date.now()});
      setTasks(tasks);
      toast(t("onboard.firstTaskCreated", "已创建第一个任务，去「{name}」场景查看").replace("{name}", SCENARIOS[_onboardSelectedSc].name), "ok");
      close(); _onboardRenderStep(2);
    };
  }else if(step === 2){
    const skip = document.getElementById("onboardSkip");
    if(skip) skip.onclick = ()=>{ close(); _onboardRenderStep(3); };
    const trigger = document.getElementById("onboardTrigger");
    if(trigger) trigger.onclick = ()=>{
      // 创建一个 office 交付任务并完成，触发联动
      const tasks = getTasks();
      const _task = {id:uid(), sc:"office", title:t("onboard.deliveryTitle","交付上线 v2.3"), due:todayStr(), priority:"P1", status:"todo", doneAt:null, note:t("onboard.deliveryNote","onboarding 模拟触发"), tags:["onboarding"], created:Date.now()};
      tasks.push(_task);
      setTasks(tasks);
      completeTask(_task.id);
      toast(t("onboard.simTriggered", "已模拟触发：交付完成 → 自动生成学习充电任务"), "ok");
      /** @type {HTMLButtonElement} */(trigger).disabled = true; trigger.textContent = "已触发";
    };
    const next = document.getElementById("onboardNext");
    if(next) next.onclick = ()=>{ close(); _onboardRenderStep(3); };
  }else if(step === 3){
    const skip = document.getElementById("onboardSkip");
    if(skip) skip.onclick = ()=>{ close(); _finishOnboarding(); };
    const config = document.getElementById("onboardConfig");
    if(config) config.onclick = ()=>{ close(); _finishOnboarding(); try{ openDrawer(); }catch(e){ /* noop */ } };
  }
}
// 引导完成：标记 onboarded 并渲染主界面
function _finishOnboarding(){
  save(PREFIX+"onboarded", true);
  try{ render(); checkCount(); dailyDigest(); }catch(e){ /* noop */ }
}
// B2：渲染引导 modal（入口）
function renderOnboarding(){
  _onboardStepNo = 1;
  _onboardSelectedSc = "office";
  _onboardRenderStep(_onboardStepNo);
}
