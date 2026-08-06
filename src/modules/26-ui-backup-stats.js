// ===== UI Layer (交互层·备份与统计) =====
/* ---------- 备份 / 统计 ---------- */
function allKeys(){ return Object.keys(localStorage).filter(k=>k.startsWith(PREFIX) || k===CUSTOM_LINKS_KEY); }
function doExport(){
  const data = {}; allKeys().forEach(k=> data[k]=localStorage.getItem(k));
  // P0-5：跨设备导出显式告警（不静默丢 Key）。安全默认：浏览器态不勾选不出明文。
  // 多 Profile：profiles 数组已随 cfg 一起导出（key 为加密对象，换机无法解密）。
  //   用户勾选「导出明文」时，额外写 _portableKeys（每个 profile 的明文 key 数组）。
  const cfg = getCfg();
  const ap = getActiveProfile();
  if(cfg && cfg.enabled){
    if(isElectron()){
      data["_meta"] = { keyExcluded:true, reason:"electron-os-store" };
      toast("AI Key 由本机安全存储保管，未随备份导出；换机后请在「设置」重新填写。", "warn");
    } else if(ap && ap.key){
      const includeKey = !!($("#exportKeyOpt") && $("#exportKeyOpt").checked);
      if(includeKey){
        // 写所有 profile 的明文 key（兼容旧导入：同时写 _portableKey = active key）
        data["_portableKeys"] = (cfg.profiles || []).map(p => p.key || "");
        data["_portableKey"] = ap.key;
        data["_meta"] = { keyExcluded:false };
      } else {
        data["_meta"] = { keyExcluded:true, reason:"device-encrypted" };
        toast("AI Key 已加密绑定本机，换机后无法解密。如需携带，请勾选「导出时包含 AI Key（明文）」后重试。", "warn");
      }
    }
  }
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "agent-workbench-backup-"+todayStr()+".json";
  a.click(); URL.revokeObjectURL(a.href);
}
function doImport(file){
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!confirm("导入将覆盖当前同名数据（含自定义习惯链）。确定继续？")) return;
      Object.keys(data).forEach(k=>{ if(k.startsWith(PREFIX) || k===CUSTOM_LINKS_KEY) localStorage.setItem(k, data[k]); });
      _cfgCache = null; _deviceKey = null;
      try{ await initCrypto(); }catch(e){ /* 忽略，降级明文 */ }

      // P0-5：解析「有效 Key」——跨设备后原密文/OS 存储可能已失效
      // 多 Profile：优先用 _portableKeys 数组恢复每个 profile 的明文 key
      let effectiveKey = "";
      const cfg = getCfg();
      const hasProfiles = cfg && Array.isArray(cfg.profiles) && cfg.profiles.length;
      if(isElectron()){
        try{ const c = await window.electronAPI.getAiConfig(); effectiveKey = (c && c.keySet) ? "__set__" : ""; }
        catch(e){ effectiveKey = ""; }
      } else {
        effectiveKey = (getActiveProfile() && getActiveProfile().key) || "";
      }
      // opt-in 明文携带：_portableKeys 数组优先，回退到旧 _portableKey 单值
      if(!effectiveKey){
        if(Array.isArray(data._portableKeys) && data._portableKeys.length && hasProfiles){
          if(isElectron()){
            try{
              const ap = getActiveProfile();
              const idx = cfg.profiles.findIndex(p => p.id === cfg.activeId);
              const k = (idx >= 0 && data._portableKeys[idx]) || data._portableKeys[0] || "";
              await window.electronAPI.setAiConfig({ base: (ap && ap.base) || "", model: (ap && ap.model) || "", enabled: !!cfg.enabled, key: k });
              effectiveKey = k ? "__set__" : "";
            }catch(e){ effectiveKey = ""; }
          } else {
            try{
              const newProfiles = cfg.profiles.map((p, i) => Object.assign({}, p, { key: data._portableKeys[i] || "" }));
              await persistCfg(Object.assign({}, cfg, { profiles: newProfiles }));
              await initCrypto();
              effectiveKey = (getActiveProfile() && getActiveProfile().key) || "";
            }catch(e){ effectiveKey = ""; }
          }
        } else if(typeof data._portableKey === "string" && data._portableKey){
          if(isElectron()){
            try{
              const ap = getActiveProfile();
              await window.electronAPI.setAiConfig({ base: (ap && ap.base) || "", model: (ap && ap.model) || "", enabled: !!cfg.enabled, key: data._portableKey });
              effectiveKey = "__set__";
            }catch(e){ effectiveKey = ""; }
          } else {
            try{
              if(hasProfiles){
                // 把 _portableKey 写入 active profile
                const newProfiles = cfg.profiles.map(p => p.id === cfg.activeId ? Object.assign({}, p, { key: data._portableKey }) : p);
                await persistCfg(Object.assign({}, cfg, { profiles: newProfiles }));
              } else {
                await persistCfg(Object.assign({}, cfg, { key: data._portableKey }));
              }
              await initCrypto();
              effectiveKey = data._portableKey;
            }catch(e){ effectiveKey = ""; }
          }
        }
      }

      // 收尾提示（替换原单一 toast）：把「静默 401」变为「显式告警 / 就绪确认」
      if(getCfg().enabled && !effectiveKey){
        toast("导入成功，但本机无 AI Key（安全存储绑定，未随备份迁移）。AI 暂不可用，请打开「设置」重新填写 Key。", "warn");
      } else if(effectiveKey){
        toast("导入成功，数据已恢复，AI Key 已就绪", "ok");
      } else {
        toast("导入成功，数据已恢复", "ok");
      }

      render();
    }catch(e){
      // 导入文件损坏：告警并中止，不让异常冒泡导致崩溃
      toast("导入文件格式错误，无法解析。", "error");
      return;
    }
  };
  reader.readAsText(file);
}
function doClear(){
  if(!confirm("确定清空全部数据？此操作不可恢复！")) return;
  allKeys().forEach(k=> localStorage.removeItem(k));
  alert("已清空，页面将重新载入示例"); location.reload();
}
function checkCount(){
  const n = allKeys().reduce((s,k)=>{
    try{ return s + (JSON.parse(localStorage.getItem(k))?.length||0); }catch(e){ return s; }
  }, 0);
  const banner=$("#banner"), bt=$("#bannerText");
  if(n>=30){ bt.textContent = "数据已积累 "+n+" 条，建议导出备份防止丢失"; banner.classList.add("show"); }
  else { banner.classList.remove("show"); }
}

/* ---------- T3：CSV / Markdown 导出（任务数据多格式） ---------- */
const TASK_STATUS_TEXT = { todo:"待办", doing:"进行中", done:"已完成" };
/* 状态文本（未知状态原样返回） */
function statusText(st){ return TASK_STATUS_TEXT[st] || (st||""); }
/* CSV 字段转义：含逗号/引号/换行时用双引号包裹并转义内部引号 */
function csvField(v){
  const s = String(v===null||v===undefined?"":v);
  return /[",\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
/**
 * 构建任务 CSV 文本（纯函数；BOM 由下载包装层添加）
 * @param {Task[]} tasks - 任务数组（默认取活跃任务）
 * @returns {string} CSV 文本
 */
function buildTasksCSV(tasks){
  const list = Array.isArray(tasks) ? tasks : getActiveTasks();
  const header = ["场景","标题","状态","优先级","截止日期","标签","创建日期","完成日期"];
  const rows = list.map(t=>[
    scMeta(t.sc).name,
    t.title||"",
    statusText(t.status),
    t.priority||"",
    t.due||"",
    (t.tags||[]).join(" "),
    t.created ? new Date(t.created).toISOString().slice(0,10) : "",
    t.doneAt ? new Date(t.doneAt).toISOString().slice(0,10) : ""
  ]);
  return [header].concat(rows).map(r=>r.map(csvField).join(",")).join("\r\n");
}
/**
 * 构建任务 Markdown 文本（纯函数；按场景分组表格）
 * @param {Task[]} tasks - 任务数组（默认取活跃任务）
 * @returns {string} Markdown 文本
 */
function buildTasksMD(tasks){
  const list = Array.isArray(tasks) ? tasks : getActiveTasks();
  const lines = ["# Agent 工作台 · 任务清单（"+todayStr()+"）", ""];
  if(!list.length){ lines.push("> 暂无任务。"); return lines.join("\n"); }
  const total = list.length, done = list.filter(t=>t.status==="done").length;
  lines.push("共 "+total+" 条，已完成 "+done+" 条，完成率 "+(total?Math.round(done/total*100):0)+"%。", "");
  ORDER.forEach(sc=>{
    const ts = list.filter(t=>t.sc===sc);
    if(!ts.length) return;
    lines.push("## "+scMeta(sc).name, "");
    lines.push("| 标题 | 状态 | 优先级 | 截止日期 | 标签 |", "| --- | --- | --- | --- | --- |");
    ts.forEach(t=>{
      lines.push("| "+String(t.title||"").replace(/\|/g,"\\|")
        +" | "+statusText(t.status)
        +" | "+(t.priority||"-")
        +" | "+(t.due||"-")
        +" | "+((t.tags||[]).join(" ")||"-")+" |");
    });
    lines.push("");
  });
  return lines.join("\n");
}
/* 通用文本下载（BOM 可选；CSV 带 BOM 保证 Excel 直接打开不乱码） */
function downloadTextFile(content, filename, mime, withBOM){
  const blob = new Blob([withBOM ? "\uFEFF"+content : content], {type:mime});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click(); URL.revokeObjectURL(a.href);
}
function doExportCSV(){
  const list = getActiveTasks();
  if(!list.length){ toast("当前没有可导出的任务","warn"); return; }
  downloadTextFile(buildTasksCSV(list), "agent-workbench-tasks-"+todayStr()+".csv", "text/csv;charset=utf-8", true);
  toast("已导出 CSV（"+list.length+" 条任务）","ok");
}
function doExportMD(){
  const list = getActiveTasks();
  if(!list.length){ toast("当前没有可导出的任务","warn"); return; }
  downloadTextFile(buildTasksMD(list), "agent-workbench-tasks-"+todayStr()+".md", "text/markdown;charset=utf-8", false);
  toast("已导出 Markdown（"+list.length+" 条任务）","ok");
}

