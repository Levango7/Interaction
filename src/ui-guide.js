// ===== UI Layer (交互层·使用指南) =====
/* ---------- 渲染：使用指南 modal ---------- */
// helpSection(id, title, content) — 生成一个可折叠章节；id==="快速上手" 时默认展开
function helpSection(id, title, content){
  return `<details class="help-section"${id==="快速上手"?" open":""}><summary>${title}</summary><div class="help-content">${content}</div></details>`;
}

// renderHelp() — 渲染使用指南页面（10 章节，内联内容，details 原生折叠）
// v1.9：从 modal 改为页面渲染到 #main（撑满主内容区），保留折叠面板交互与 a11y focus 管理
// v1.8.4：新增「性能优化 / 企业级功能 / AI 工作流」3 章节
AppBridge.renderHelp = renderHelp;
function renderHelp(){
  // v1.9.3：若设置页(drawer-page)正在显示，先移回并恢复 #main，避免指南渲染到隐藏的 #main
  const _drawer = $("#drawer");
  if(_drawer && _drawer.classList.contains("drawer-page")){
    _moveDrawerHome();
    _drawer.classList.remove("open");
    delete _drawer.dataset.page; // v1.9.6：清掉子页标记（settings/ai/plugin）
  }
  const html = `<div class="help-page-wrap" id="helpPageWrap">
    <div class="card page-head-card"><header class="page-head sc-page-head">
      <span class="ph-ic" aria-hidden="true">${SIDE_MENU_ICONS.doc}</span>
      <div class="ph-tx">
        <h2 data-i18n="nav.help">说明</h2>
        <p class="sub" data-i18n="help.subTitle">快速上手 · 场景说明 · AI 技巧 · 数据安全</p>
      </div>
      <button class="page-back help-back" id="helpBack" aria-label="返回上一视图" data-i18n-aria="a11y.returnPrevView" type="button" data-i18n="help.backBtnText">← 返回</button>
    </header></div>
    <div class="help-page" id="helpPage">
      <div class="help-body">
        ${helpSection("quickStart", t("help.quickStart", "快速上手"), `
          <p data-i18n="help.stepStart">3 步开始使用：</p>
          <ol>
            <li><b data-i18n="help.step1Build">建任务</b>：点左侧场景（办公/编程/学习），在任务看板点「+」添加任务</li>
            <li><b data-i18n="help.step1Complete">完成任务</b>：点任务卡片的「完成」按钮，可能触发联动自动生成后续任务</li>
            <li><b data-i18n="help.step1Ai">用 AI</b>：在场景底部的聊天框输入「建个任务：明天写周报」「查总览」「搜索 跑步」</li>
          </ol>
        `)}
        ${helpSection("scenes", t("help.scenes", "场景说明"), `
          <p><b data-i18n="help.scenesTitle">6 场景</b>：办公 / 数据 / 设计 / 学习 / 编程 / 生活</p>
          <p><b data-i18n="help.sceneOffice">办公</b>（蓝色）：会议纪要、工作任务、周报。AI 帮你梳理任务、润色邮件。</p>
          <p><b data-i18n="help.sceneData">数据</b>（青色）：数据记录、指标快照、分析结论。AI 帮数据清洗与洞察提炼。</p>
          <p><b data-i18n="help.sceneDesign">设计</b>（粉色）：作品记录、灵感板、视觉设计。AI 帮配色构图与创意激发。</p>
          <p><b data-i18n="help.sceneLearning">学习</b>（橙色）：学习资料 + SM-2 间隔复习。AI 帮制定学习计划。</p>
          <p><b data-i18n="help.sceneCoding">编程</b>（绿色）：代码片段、工程任务。AI 给可运行代码和架构建议。</p>
          <p><b data-i18n="help.sceneLife">生活</b>（紫色）：日常事务、运动/体重/睡眠/喝水记录。AI 帮打理健康与琐事。</p>
        `)}
        ${helpSection("chain", t("help.chain", "场景联动"), `
          <p data-i18n="help.chainIntro">完成任务可以自动触发跨场景的奖励/后续任务，形成正反馈闭环：</p>
          <div class="help-chain-demo">
            <span class="u-text-accent" data-i18n="help.chainOffice">办公</span> 交付 → <span class="u-text-warn">学习</span> 充电<br>
            <span class="u-text-warn" data-i18n="help.chainStudy">学习</span> 复习 → <span class="u-text-accent">编程</span> 实践<br>
            <span class="u-text-accent" data-i18n="help.chainCoding">编程</span> 上线 → <span style="color:var(--sc-life)">生活</span> 犒劳
          </div>
          <p data-i18n="help.chainEdit">在设置 → 联动规则中可编辑跨场景自动规则（关键词、目标场景、启用/禁用）。</p>
        `)}
        ${helpSection("aiTips", t("help.aiTips", "AI 使用技巧"), `
          <p data-i18n="help.aiIntro">每个场景有专属 AI 助手（不同 system prompt）。在聊天框输入：</p>
          <ul>
            <li data-i18n="help.aiCmd1">「建个任务：明天写周报」→ AI 调用 create_task 工具</li>
            <li data-i18n="help.aiCmd2">「查总览」→ AI 调用 query_overview 工具</li>
            <li data-i18n="help.aiCmd3">「搜索 跑步」→ AI 调用 search 工具</li>
            <li data-i18n="help.aiCmd4">「完成任务 xxx」→ AI 调用 complete_task 工具</li>
            <li data-i18n="help.aiCmd5">开启 Agent 模式后还可「记住：我喜欢简洁回复」「帮我规划：本周清理办公待办」等多步任务</li>
          </ul>
          <p data-i18n="help.aiTools">AI 可以调用多种工具管理你的工坊数据（含 Agent 记忆/目标工具）。在设置中配置 API Key 后启用。</p>
        `)}
        ${helpSection("sm2", t("help.sm2", "SM-2 间隔复习"), `
          <p data-i18n="help.reviewIntro">学习场景的资料支持间隔复习（SM-2 算法）。复习时选 4 个评分：</p>
          <ul>
            <li><b>Again</b>（重试）：忘了，明天再复习</li>
            <li><b>Hard</b>（困难）：勉强记得，缩短间隔</li>
            <li><b>Good</b>（良好）：正常记住，按计划推进</li>
            <li><b>Easy</b>（简单）：轻松记住，拉长间隔</li>
          </ul>
          <p data-i18n="help.reviewAuto">系统自动计算下次复习日期和 ease factor，今日待复习的会在学习场景高亮。</p>
        `)}
        ${helpSection("shortcuts", t("help.shortcuts", "快捷键"), `
          <table class="help-keys">
            <tr><td><kbd>1</kbd>-<kbd>6</kbd></td><td data-i18n="help.kbdScenes">切换场景（办公/数据/设计/学习/编程/生活）</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td data-i18n="help.kbdCmd">命令面板（搜索任务、切换场景）</td></tr>
            <tr><td><kbd>N</kbd></td><td data-i18n="help.kbdNew">新建任务并聚焦标题输入</td></tr>
            <tr><td><kbd>?</kbd></td><td data-i18n="help.kbdHelp">打开本快捷键帮助面板</td></tr>
            <tr><td><kbd>Esc</kbd></td><td data-i18n="help.kbdClose">关闭弹窗/抽屉</td></tr>
          </table>
        `)}
        ${helpSection("perf", t("help.perf", "性能优化"), `
          <p data-i18n="help.perfIntro">本工坊在渲染与存储层做了多项优化，保证大量任务下依然流畅：</p>
          <ul>
            <li><b data-i18n="help.perfRaf">RAF 批量更新</b>：高频操作（拖拽、连续勾选、滚动统计）自动合并到同一帧执行，避免布局抖动。</li>
            <li><b data-i18n="help.perfLazy">懒初始化</b>：重模块（图表 / 知识库）在浏览器空闲时初始化，不阻塞首屏渲染。</li>
            <li><b data-i18n="help.perfLs">localStorage 批量写入</b>：多次写入合并为一次 flush，降低 I/O 抖动，延长存储寿命。</li>
            <li><b data-i18n="help.perfBuild">生产构建压缩</b>：<code>npm run build:prod</code> 生成压缩版（剥离注释 + 合并空行），体积节省约 32.8%。</li>
          </ul>
          <p data-i18n="help.perfNote">上述优化对用户透明（自动备份为防抖快照；频率固定、不可调）。</p>
        `)}
        ${helpSection("trouble", t("help.trouble", "故障排查"), `
          <p><b data-i18n="help.troubleTitle">遇到问题先看这里</b>，覆盖最常见的「数据丢了」「功能没反应」「版本没生效」：</p>
          <ul>
            <li><b data-i18n="help.troubleDataLoss">数据意外丢失/异常</b>：① 打开设置抽屉「数据管理」→ 点「从自动备份恢复」还原最近一次操作前的快照（每次写操作前自动拍的，最近一次成功快照）；② 仍异常时「本地库恢复」（从 IDB 全量镜像回滚）；③ 仍异常时用「导入恢复」上传此前导出的 JSON 备份文件</li>
            <li><b data-i18n="help.troubleCors">AI 报 CORS/网络错误</b>：浏览器直接调第三方 API 受 CORS 限制时——用 <code>启动本地服务.bat</code>（<code>http://localhost:8123</code>）打开工坊而非 <code>file://</code>；Electron 版无此限制</li>
            <li><b data-i18n="help.troublePwa">新版 PWA 没生效/看到旧版</b>：清浏览器缓存 + 强制刷新（<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> / Mac: <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>）；页脚形如 <code>v3.1.x · b{BUILD_TAG}</code> 即当前生效版本</li>
            <li><b data-i18n="help.troubleMigrate">换浏览器/换设备/移动 HTML 文件数据没跟过来</b>：数据存于浏览器 localStorage 不跨浏览器/设备迁移——需在原设备「数据管理 → 导出 JSON」拿到备份，再到新环境「导入恢复」</li>
            <li><b data-i18n="help.troubleWasm">SQL Playground 报错「WASM 加载失败」</b>：首次使用需联网从 CDN 加载 sql.js（~1MB），断网时无法使用，其他功能不受影响</li>
            <li><b data-i18n="help.troubleNotify">通知/桌面提醒不弹出</b>：检查浏览器「站点权限」是否授予通知；PWA 安装版系统级通知需在系统设置开启</li>
            <li><b data-i18n="help.troubleRestore">恢复误删任务</b>：设置抽屉「数据管理」下方「清空回收站」上方有回收站页入口（v3.1 起多类型：任务/配置/文件/插件，软删/卸载均入回收站）</li>
          </ul>
        `)}
        ${helpSection("integration", t("help.integration", "集成与扩展"), `
          <p><b data-i18n="help.featIntegrations">集成中心</b>：设置抽屉「集成」Tab 列出 7 个外部集成（Notion/Linear/Jira/Slack/飞书/钉钉/日历）+ OpenAPI Key 管理。每个集成可配置凭据后连接。</p>
          <p><b data-i18n="help.featOauth">OAuth 授权</b>（日历）：v3.1.2 起日历集成支持 OAuth 授权——在凭据弹窗填入服务商控制台注册的 Client ID，<code>点击 OAuth 授权</code> 自动获取 Access Token。redirect_uri 需登记 <code>http://127.0.0.1:8124/oauth/callback</code>（仅 Electron 版支持）。</p>
          <p><b>SQL Playground</b>：编程场景 SQL 标签，sql.js WASM 本地 SQLite 沙箱执行（无服务端）。</p>
          <p><b data-i18n="help.featPluginMarket">插件市场</b>：侧栏「商店」内置插件（pomodoro/reading/finance/budget/health/habit-tracker/weather/quote/focus-timer/mindmap），其中 reading/finance 启用后会在侧栏新增「阅读」「理财」场景，health/budget 挂专属卡片——见插件卡片描述。</p>
          <p><b data-i18n="help.featRecycle">回收站多类型</b>（v3.1 起）：软删任务与卸载/重置的配置/文件/插件均入「回收站」页（侧栏系统组），可恢复或彻底删除；自动清理策略在设置抽屉「外观」或回收站页可调（off/7/30/90 天）。</p>
        `)}
        ${helpSection("aiAdvanced", t("help.aiAdvanced", "AI 进阶"), `
          <p><b data-i18n="help.featProfile">多 Profile 供应商</b>：AI 抽屉「API Key」支持多个 Profile（OpenAI/Anthropic/DeepSeek/通义/豆包 等 OpenAI 兼容接口），一键切换不丢历史。</p>
          <p><b data-i18n="help.featAgent">Agent 三层</b>：工作记忆（场景隔离的 remember/recall/forget）、多步目标（plan + complete_step + complete_goal）、跨场景协调（list_records 查任意场景资料）。</p>
          <p><b data-i18n="help.featSession">多会话</b>：聊天面板「☰」按钮管理多个对话——新建/重命名/删除/搜索。</p>
          <p><b data-i18n="help.featWhitelist">工具白名单</b>：Agent 卡「允许调用的工具」控制 AI 能用的工具（逗号分隔，留空=全部）；扩展 Tab「技能配置」勾选同步写同一处（v3.1.2 A-档统一真相源）。</p>
        `)}
        ${helpSection("dataSecurity", t("help.dataSecurity", "数据安全"), `
          <p><b data-i18n="help.secAiKey">AI Key 加密</b>：API Key 用 AES-GCM 加密存储，设备密钥首次随机生成。明文仅在内存中。</p>
          <p><b data-i18n="help.secExport">导出备份</b>：在设置抽屉「数据管理」点「导出 JSON」下载备份。可选是否包含 AI Key 明文。</p>
          <p><b data-i18n="help.secImport">导入恢复</b>：在「数据管理」点「导入恢复」上传备份文件恢复数据。</p>
          <p><b data-i18n="help.secAutoBackup">自动备份</b>：每次修改数据后自动快照到 localStorage，数据损坏时可恢复。</p>
          <p><b data-i18n="help.secNote">注意</b>：数据存于浏览器 localStorage，清浏览器数据会丢失！请定期导出备份。</p>
        `)}
      </div>
    </div>
  </div>`;
  $("#main").innerHTML = sanitizeHtml(html);
  $("#main").classList.remove("page-recycle"); // v1.9.4：指南页不沿用回收站铺满类
  appendFoot();
  const backBtn = $("#helpBack");
  if(backBtn) backBtn.onclick = ()=>{ const _m = $("#main"); if(_m) _m.scrollTop = 0; const _mw = document.querySelector(".main-wrap"); if(_mw) _mw.scrollTop = 0; render(); };
  // a11y：打开页面时 focus 到返回按钮，避免 focus 残留在背景元素
  try{
    if(backBtn && typeof backBtn.focus === "function") backBtn.focus();
  }catch(e){ /* noop：jsdom 或异常环境下 focus 可能不可用 */ }
  uiView = "help"; // v1.9.3g：显式视图状态，侧栏高亮据此渲染（弃 DOM 嗅探）
  renderSide(); // v1.9.3：更新侧边栏高亮（指南按钮 active）
}

// ===== v1.4-E 协作/分享：任务分享链接 + 只读任务卡片 =====
/* ---------- 字符串 ↔ Base64（UTF-8 安全，支持中文） ----------
 * btoa/atob 仅支持 Latin1 范围字符，中文需先经 TextEncoder 编码为 UTF-8 字节再 base64。
 * 测试环境（jsdom）已注入 TextEncoder/TextDecoder polyfill（见 tests/helpers/loadApp.js）。
 */
function _strToB64(str){
  const bytes = new TextEncoder().encode(String(str));
  return base64Encode(bytes);
}
function _b64ToStr(b64){
  const bytes = base64Decode(String(b64));
  return new TextDecoder().decode(bytes);
}
/**
 * 生成任务分享链接：将任务关键字段编码为 base64 写入 URL hash
 * @param {Task} task - 任务对象
 * @returns {string} 分享链接 URL（含 #share=base64）
 */
function generateShareLink(task){
  if(!task || typeof task !== "object") return "";
  // 仅分享只读快照字段，剥离内部 id/created 等可选项保留以增强还原信息
  const snapshot = {
    title: task.title || "",
    sc: task.sc || "",
    status: task.status || "todo",
    priority: task.priority || "",
    due: task.due || "",
    note: task.note || "",
    tags: Array.isArray(task.tags) ? task.tags.slice(0, 10) : []
  };
  const payload = _strToB64(JSON.stringify(snapshot));
  let base;
  try{ base = location.href.split("#")[0]; }
  catch(e){ base = "https://agent-workbench.local/"; }
  return base + "#share=" + payload;
}
/**
 * 从 hash 字符串解析分享的任务快照
 * @param {string} [hash] - hash 片段（默认取 location.hash）
 * @returns {Task|null} 任务快照对象，无分享 hash 或解码失败时返回 null
 */
function parseShareLink(hash){
  try{
    if(typeof hash === "undefined") hash = location.hash || "";
    const m = String(hash).match(/#share=([A-Za-z0-9+/=]+)/);
    if(!m) return null;
    const json = _b64ToStr(m[1]);
    const obj = JSON.parse(json);
    if(!obj || typeof obj !== "object" || typeof obj.title !== "string") return null;
    return obj;
  }catch(e){ return null; }
}
/**
 * 渲染只读任务详情卡片 HTML（标题/场景/状态/优先级/到期日/备注/标签）
 * @param {Object} task - 任务快照
 * @returns {string} 卡片 HTML
 */
function renderSharedTaskCard(task){
  if(!task || typeof task !== "object") return "";
  const sm = scMeta(task.sc);
  const statusMap = { todo:t("status.todo","待办"), doing:t("status.doing","进行中"), done:t("status.done","已完成") };
  const statusLabel = statusMap[task.status] || task.status || "待办";
  const pri = task.priority ? `<span class="pri ${esc(task.priority)}">${esc(task.priority)}</span>` : '<span class="pri u-opacity-50">无</span>';
  const due = task.due ? `<span class="due">${esc(task.due)}</span>` : '<span class="due u-opacity-50">无</span>';
  const note = task.note ? `<div class="share-note">${esc(task.note)}</div>` : "";
  const tags = (Array.isArray(task.tags) && task.tags.length)
    ? `<div class="share-tags">${task.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(" ")}</div>`
    : "";
  return `<div class="share-task-card">
    <div class="share-sc-badge" style="background:${sm.color};color:var(--on-accent)">${esc(sm.name)}</div>
    <h3 class="share-title">${esc(task.title)}</h3>
    <div class="share-meta">
      <div class="share-meta-row"><span class="share-meta-label" data-i18n="share.chainLog">联动记录</span><span class="share-meta-val">${esc(statusLabel)}</span></div>
      <div class="share-meta-row"><span class="share-meta-label" data-i18n="share.priority">优先级</span><span class="share-meta-val">${pri}</span></div>
      <div class="share-meta-row"><span class="share-meta-label" data-i18n="share.dueDate">到期日</span><span class="share-meta-val">${due}</span></div>
    </div>
    ${tags}
    ${note}
    <div class="share-readonly-hint"><span class="ic-inline" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 9h6M9 13h6M9 17h4"/></svg></span>这是只读分享卡片，不可编辑</div>
  </div>`;
}
/**
 * 打开只读分享任务详情弹窗
 * @param {Object} task - 任务快照
 * @returns {void}
 */
function openSharedTaskModal(task){
  const old = document.querySelector(".share-task-modal");
  if(old) old.remove();
  const cardHtml = renderSharedTaskCard(task);
  const html = `<div class="share-task-modal" id="shareTaskModal">
    <div class="share-task-dialog">
      <div class="share-task-header">
        <h2><span class="ic-inline" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>分享的任务</h2>
        <button type="button" class="share-task-close" id="shareTaskClose" aria-label="关闭" data-i18n-aria="a11y.closeBtn">✕</button>
      </div>
      <div class="share-task-body">${cardHtml}</div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  const closeBtn = $("#shareTaskClose");
  // M1：用 AbortController 管理模态框事件生命周期，任意方式关闭均统一清理 keydown 监听器
  const _ac = new AbortController();
  const _close = ()=>{ _ac.abort(); const m = $("#shareTaskModal"); if(m) m.remove(); };
  if(closeBtn) closeBtn.onclick = _close;
  const modal = $("#shareTaskModal");
  if(modal) modal.onclick = (e)=>{ if(e.target === modal) _close(); };
  // ESC 关闭
  document.addEventListener("keydown", (e)=>{ if(e.key === "Escape") _close(); }, { signal: _ac.signal });
}
/**
 * 页面加载时检测 location.hash 含 #share=，解码显示只读任务详情弹窗
 * @returns {boolean} 是否检测到并展示了分享任务
 */
function checkSharedTaskOnLoad(){
  const task = parseShareLink();
  if(!task) return false;
  openSharedTaskModal(task);
  // 清除 hash 避免刷新重复弹出
  try{ history.replaceState(null, "", location.pathname + location.search); }catch(e){ /* noop */ }
  return true;
}

/* ---------- v1.6-C 数据可视化增强：雷达图 + 桑基图 ---------- */
/**
 * 计算雷达图数据：各场景完成度（已完成/总数）
 * @returns {Array<{sc:string,name:string,total:number,done:number,rate:number}>} rate 为 0-1 比例
 */
function getRadarData(){
  const tasks = getActiveTasks();
  return ORDER.map(function(sc){
    const s = SCENARIOS[sc] || { name: sc };
    const scTasks = tasks.filter(function(t){ return t && t.sc === sc; });
    const total = scTasks.length;
    const done = scTasks.filter(function(t){ return t.status === "done"; }).length;
    const rate = total > 0 ? done / total : 0;
    return { sc: sc, name: s.name, total: total, done: done, rate: rate };
  });
}
/**
 * 渲染雷达图 SVG（各场景完成度对比）
 * @param {Array<{sc:string,name:string,total:number,done:number,rate:number}>} [data] - 雷达图数据，默认调用 getRadarData()
 * @returns {string} HTML 字符串（svg）
 */
function radarChartSVG(data){
  const d = data || (typeof getRadarData === "function" ? getRadarData() : []);
  if(!d || d.length === 0) return "<p class='empty-hint'>暂无场景数据</p>";
  const n = d.length;
  const W = 320, H = 320, CX = W / 2, CY = H / 2, R = 110;
  let svg = '<svg class="radar-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="场景完成度雷达图" data-i18n-aria="a11y.sceneRadar">';
  // 网格圈（5 层）
  for(let g = 1; g <= 5; g++){
    const r = R * g / 5;
    const pts = [];
    for(let i = 0; i < n; i++){
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      pts.push((CX + Math.cos(a) * r).toFixed(1) + "," + (CY + Math.sin(a) * r).toFixed(1));
    }
    svg += '<polygon points="' + pts.join(" ") + '" fill="none" stroke="var(--line)" stroke-width="1"/>';
  }
  // 轴线 + 标签
  for(let i = 0; i < n; i++){
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const x = CX + Math.cos(a) * R;
    const y = CY + Math.sin(a) * R;
    svg += '<line x1="' + CX + '" y1="' + CY + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>';
    const lx = CX + Math.cos(a) * (R + 18);
    const ly = CY + Math.sin(a) * (R + 18) + 4;
    svg += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" font-size="var(--fs-2xs)" fill="var(--text)">' + esc(d[i].name) + '</text>';
  }
  // 数据多边形
  const dataPts = [];
  for(let i = 0; i < n; i++){
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = R * Math.max(0, Math.min(1, d[i].rate));
    dataPts.push((CX + Math.cos(a) * r).toFixed(1) + "," + (CY + Math.sin(a) * r).toFixed(1));
  }
  svg += '<polygon points="' + dataPts.join(" ") + '" fill="var(--accent)" fill-opacity="0.25" stroke="var(--accent)" stroke-width="2"/>';
  // 数据点 + tooltip
  for(let i = 0; i < n; i++){
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = R * Math.max(0, Math.min(1, d[i].rate));
    const x = CX + Math.cos(a) * r;
    const y = CY + Math.sin(a) * r;
    const pct = Math.round(d[i].rate * 100);
    svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="var(--accent)"><title>' + esc(d[i].name) + '：' + d[i].done + '/' + d[i].total + '（' + pct + '%）</title></circle>';
  }
  svg += '</svg>';
  return svg;
}
/**
 * 计算桑基图数据：任务从场景→状态（todo/doing/done）的流向
 * @returns {{nodes:Array<{id:string,name:string}>,links:Array<{source:number,target:number,value:number}>}}
 */
function getSankeyData(){
  const tasks = getActiveTasks();
  const nodes = [];
  const nodeIdx = {};
  // 左侧节点：各场景
  ORDER.forEach(function(sc){
    const s = SCENARIOS[sc] || { name: sc };
    nodeIdx[sc] = nodes.length;
    nodes.push({ id: sc, name: s.name });
  });
  // 右侧节点：各状态
  const statuses = [
    { id: "todo",  name: t("status.todo","待办") },
    { id: "doing", name: t("status.doing","进行中") },
    { id: "done",  name: t("status.done","已完成") }
  ];
  statuses.forEach(function(st){
    nodeIdx[st.id] = nodes.length;
    nodes.push({ id: st.id, name: st.name });
  });
  // 链路：场景→状态，value 为任务数
  const links = [];
  ORDER.forEach(function(sc){
    statuses.forEach(function(st){
      const count = tasks.filter(function(t){
        return t && t.sc === sc && t.status === st.id;
      }).length;
      if(count > 0){
        links.push({ source: nodeIdx[sc], target: nodeIdx[st.id], value: count });
      }
    });
  });
  return { nodes: nodes, links: links };
}
/**
 * 渲染桑基图 SVG（任务流向：场景→状态）
 * @param {{nodes:Array<{id:string,name:string}>,links:Array<{source:number,target:number,value:number}>}} [data] - 桑基图数据，默认调用 getSankeyData()
 * @returns {string} HTML 字符串（svg）
 */
function sankeyChartSVG(data){
  const d = data || (typeof getSankeyData === "function" ? getSankeyData() : { nodes: [], links: [] });
  if(!d || !d.nodes || d.nodes.length === 0 || !d.links || d.links.length === 0){
    return "<p class='empty-hint'>暂无任务流向数据</p>";
  }
  const nodes = d.nodes, links = d.links;
  const W = 480, H = 320;
  const leftCount = Math.ceil(nodes.length / 2);
  const rightCount = nodes.length - leftCount;
  // 节点位置：左侧 x=80，右侧 x=W-80；纵向按值总和均分
  const totalLeft = 0, totalRight = 0;
  // 计算每个节点的入度/出度总和（用于纵向高度分配）
  const nodeFlow = nodes.map(function(){ return 0; });
  links.forEach(function(l){
    nodeFlow[l.source] += l.value;
    nodeFlow[l.target] += l.value;
  });
  // 左侧节点（前 leftCount 个）
  const leftNodes = nodes.slice(0, leftCount);
  const rightNodes = nodes.slice(leftCount);
  const leftSum = leftNodes.reduce(function(s, n, i){ return s + nodeFlow[i]; }, 0) || 1;
  const rightSum = rightNodes.reduce(function(s, n, i){ return s + nodeFlow[leftCount + i]; }, 0) || 1;
  const padY = 20, barH = 16;
  const leftAreaH = H - padY * 2;
  const rightAreaH = H - padY * 2;
  // 计算每个节点 y 坐标
  const nodeY = [];
  const nodeH = [];
  let accY = padY;
  leftNodes.forEach(function(n, i){
    const h = Math.max(barH, (nodeFlow[i] / leftSum) * leftAreaH);
    nodeY[i] = accY + h / 2;
    nodeH[i] = h;
    accY += h + 4;
  });
  accY = padY;
  rightNodes.forEach(function(n, i){
    const idx = leftCount + i;
    const h = Math.max(barH, (nodeFlow[idx] / rightSum) * rightAreaH);
    nodeY[idx] = accY + h / 2;
    nodeH[idx] = h;
    accY += h + 4;
  });
  const leftX = 80, rightX = W - 80, barW = 10;
  let svg = '<svg class="sankey-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="任务流向桑基图" data-i18n-aria="a11y.taskFlowSankey">';
  // 节点矩形 + 标签
  nodes.forEach(function(n, i){
    const isLeft = i < leftCount;
    const x = isLeft ? leftX : rightX;
    const h = nodeH[i] || barH;
    const y = (nodeY[i] || padY) - h / 2;
    svg += '<rect x="' + x + '" y="' + y.toFixed(1) + '" width="' + barW + '" height="' + h.toFixed(1) + '" fill="var(--accent)"><title>' + esc(n.name) + '：' + (nodeFlow[i] || 0) + '</title></rect>';
    const labelX = isLeft ? (x - 6) : (x + barW + 6);
    const anchor = isLeft ? "end" : "start";
    svg += '<text x="' + labelX + '" y="' + ((nodeY[i] || padY) + 4).toFixed(1) + '" text-anchor="' + anchor + '" font-size="var(--fs-2xs)" fill="var(--text)">' + esc(n.name) + '</text>';
  });
  // 链路：贝塞尔曲线
  // 跟踪每个节点已分配的偏移（避免链路重叠）
  const srcOffset = nodes.map(function(){ return 0; });
  const tgtOffset = nodes.map(function(){ return 0; });
  links.forEach(function(l){
    const sIdx = l.source, tIdx = l.target;
    const sy = (nodeY[sIdx] || padY) - (nodeH[sIdx] || barH) / 2 + srcOffset[sIdx];
    const ty = (nodeY[tIdx] || padY) - (nodeH[tIdx] || barH) / 2 + tgtOffset[tIdx];
    const lh = Math.max(2, (l.value / leftSum) * leftAreaH);
    const rh = Math.max(2, (l.value / rightSum) * rightAreaH);
    srcOffset[sIdx] += lh;
    tgtOffset[tIdx] += rh;
    const sx = leftX + barW;
    const tx = rightX;
    const midX = (sx + tx) / 2;
    const path = "M" + sx + "," + sy.toFixed(1) +
      " C" + midX + "," + sy.toFixed(1) +
      " " + midX + "," + ty.toFixed(1) +
      " " + tx + "," + ty.toFixed(1) +
      " L" + tx + "," + (ty + rh).toFixed(1) +
      " C" + midX + "," + (ty + rh).toFixed(1) +
      " " + midX + "," + (sy + lh).toFixed(1) +
      " " + sx + "," + (sy + lh).toFixed(1) + " Z";
    svg += '<path d="' + path + '" fill="var(--accent)" fill-opacity="0.18"><title>' + esc(nodes[sIdx].name) + ' → ' + esc(nodes[tIdx].name) + '：' + l.value + '</title></path>';
  });
  svg += '</svg>';
  return svg;
}

/* ---------- v1.8.3 性能优化：RAF 批量渲染 ----------
 * renderBatched：用 rafBatch 包装 render()，多次调用合并到下一帧只执行一次
 * 用于高频触发 render 的场景（批量操作 / 拖拽 / 快速切换场景 / 连续状态变更）
 *
 * 设计说明：
 *   - rafBatch 在 03b-perf-utils.js 定义（03b < 15，加载顺序保证可用）
 *   - 多次调用 renderBatched() 会在下一帧只执行一次 render()
 *   - 测试环境（无 requestAnimationFrame）自动回退到 setTimeout(0)
 *   - 当前 render() 在多处直接调用，本函数作为批量版本供高频场景接入，不修改现有调用
 *
 * @returns {void}
 */
const renderBatched = (function(){
  /* rafBatch 不存在时降级为空函数，避免报错 */
  if(typeof rafBatch !== "function") return function(){ /* noop */ };
  return rafBatch(function _renderBatchedFlush(){
    try{ render(); }catch(e){ /* 静默：渲染失败不应破坏调度循环 */ }
  });
})();
