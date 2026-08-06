// ===== Render Layer (渲染层·场景主区) =====
/* ---------- 渲染：场景主区 ---------- */
/**
 * 渲染场景主区 HTML（任务看板 + 资料库 + 场景专属卡片 + AI 对话）
 * @returns {string} HTML 字符串
 */
function renderMainHTML(){
  const s = SCENARIOS[active];
  const tasksAll = getActiveTasks().filter(x=>x.sc===active);
  const tasks = tasksAll;
  const open = tasks.filter(x=>x.status!=="done");
  const recs = getRec(active);
  const rec = s.record;
  const cfg = getCfg();

  const taskForm = `<form class="form-row" id="taskForm">
    <div class="fld"><label>任务标题</label><input name="title" placeholder="要做什么？" required></div>
    <div class="fld" style="max-width:160px"><label>截止日期</label><input name="due" type="date"></div>
    <div class="fld" style="max-width:120px"><label>优先级</label>
      <select name="priority"><option value="">-</option><option>P0</option><option>P1</option><option>P2</option></select></div>
    <div class="fld" style="max-width:140px"><label>标签</label><input name="tags" placeholder="逗号分隔"></div>
    <button class="addbtn" type="submit" style="--sc:${s.color}">${UI_ICONS.plus} 添加</button>
  </form>`;

  const tagFilterHTML = `<div class="form-row" style="margin-bottom:10px"><div class="fld" style="max-width:240px"><label>按标签筛选（留空=全部）</label>
    <input id="tagFilter" placeholder="如 周报 / urgent"></div></div>`;

  // T4.2：看板无任务时显示 no-tasks 空状态（替代每列「空」提示），保留表单引导创建
  let kanban, filterHtml;
  if(tasksAll.length === 0){
    kanban = renderEmpty("no-tasks");
    filterHtml = "";
  }else{
    const cols=["todo","doing","done"];
    const colName={todo:"待办",doing:"进行中",done:"已完成"};
    kanban = `<div class="kanban">` + cols.map(st=>{
      const list = tasks.filter(x=>x.status===st);
      const cards = list.length? list.map(x=>{
        const od = x.due && x.due < todayStr();
        const pri = x.priority? `<span class="pri ${x.priority}">${x.priority}</span>`:"";
        const due = x.due? `<span class="due ${od?"od":""}">${od?"逾期 ":""}${x.due}</span>`:"";
        const tags=(x.tags&&x.tags.length)?` <span class="tag">${x.tags.map(t=>esc(t)).join('</span> <span class="tag">')}</span>`:"";
        let btns="";
        if(st==="todo") btns=`<button data-move="${x.id}:doing">→ 进行中</button>`;
        if(st==="doing") btns=`<button data-move="${x.id}:todo">← 待办</button><button data-move="${x.id}:done">→ 完成</button>`;
        if(st==="done") btns=`<button data-move="${x.id}:doing">← 进行中</button>`;
        return `<div class="kcard" data-tags="${(x.tags||[]).join(" ")}"><div class="t">${esc(x.title)}</div>
          <div class="m">${pri} ${due}${tags}</div><div class="kbtns">${btns}
          <button data-del="${x.id}" style="margin-left:auto;color:var(--danger)">删除</button></div></div>`;
      }).join("") : `<div class="empty" style="margin:4px">空</div>`;
      return `<div class="kcol"><h4>${colName[st]} <span class="n">${list.length}</span></h4>${cards}</div>`;
    }).join("") + `</div>`;
    filterHtml = tagFilterHTML;
  }

  const recFields = rec.fields.map(f=>{
    const inp = f.type==="textarea" ? `<textarea name="${f.k}" placeholder="${f.label}"></textarea>`
      : `<input name="${f.k}" type="${f.type==="number"?"number":"text"}" placeholder="${f.label}">`;
    return `<div class="fld"><label>${f.label}</label>${inp}</div>`;
  }).join("");
  const recForm = `<form class="form-row" id="recForm">${recFields}
    <button class="addbtn" type="submit" style="--sc:${s.color}">${UI_ICONS.plus} 添加</button></form>`;
  const recList = recs.length? `<ul class="list">` + recs.map(r=>{
    // 区分 textarea 字段（长文本，Markdown 渲染）与 text 字段（短文本，tag span）
    const metaParts = [];
    const mdParts = [];
    rec.fields.forEach(f=>{
      if(f.k==="title"||f.k==="code") return;
      const v=r[f.k]; if(v===null||v===undefined||v==="") return;
      if(f.type==="textarea"){
        mdParts.push('<div class="md md-body">'+mdToHtml(v)+'</div>');
      } else {
        metaParts.push('<span class="tag">'+esc(f.label)+": "+esc(v)+'</span>');
      }
    });
    const meta = metaParts.join("");
    const mdContent = mdParts.join("");
    const codeF = rec.fields.find(f=>f.k==="code");
    const codeBlock = (codeF && r.code)? `<code class="snip">${esc(r.code)}</code>
      <button class="copy" data-val="${esc(r.code)}">${UI_ICONS.copy} 复制</button>` : "";
    const titleF = rec.fields.find(f=>f.k==="title") || {k:"title"};
    return `<li><div class="body"><div class="t">${esc(r[titleF.k])}</div>
      <div class="m">${meta}</div>${mdContent}${codeBlock}</div>
      <button class="del" data-rdel="${r.id}" title="删除" aria-label="删除">${UI_ICONS.trash}</button></li>`;
  }).join("") + `</ul>` : renderEmpty("no-records");

  let chatCard = `<div class="card"><h2>${UI_ICONS.chat} ${s.name} · AI 助手</h2>`;
  if(!cfg.enabled){
    chatCard += `<p class="sub">尚未启用 AI：点击右上角「设置」填入 API Key，subagent 即可对话并调用工具修改数据。</p>`;
  }else{
    chatCard += `<div class="chat" id="chat"></div>
      <div class="chat-toolbar">
        <span class="chat-thinking" id="chatThinking" style="display:none">思考中…</span>
        <button class="chat-cancel" id="chatCancel" type="button" style="display:none">取消</button>
      </div>
      <form class="chat-form" id="chatForm">
        <input name="msg" placeholder="问 ${s.name} 助手，或让它「建个任务/查总览」…" autocomplete="off">
        <button class="addbtn" type="submit" style="--sc:${s.color}">发送</button></form>`;
  }
  chatCard += `</div>`;

  return `<div class="card"><h2>${SCENARIOS[active].icon || ""} ${s.name} · 任务看板</h2>
      <p class="sub">${open.length} 项待办 · 带截止日期的任务会汇总到顶部「今天要处理」</p>
      ${taskForm}${filterHtml}${kanban}</div>
     <div class="card"><h2>${s.name} · ${rec.label}</h2>
      <p class="sub">场景专属资料库，本地保存、随时检索</p>${recForm}${recList}</div>
     ${renderExtra(active)}
     ${chatCard}
     <div class="foot">快捷键：<span class="kbd">1-4</span>切换场景 <span class="kbd">G</span>总览 <span class="kbd">N</span>新建任务 <span class="kbd">Ctrl+K</span>命令面板 · Agent 工作台 · 数据存于本机 · v${VERSION}</div>`;
}

