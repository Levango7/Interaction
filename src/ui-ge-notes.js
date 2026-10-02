// ===== UI Layer (交互层·全局事件绑定·笔记与知识库) =====
/* ---------- 笔记系统 + 知识库：Markdown 笔记 CRUD + 标签分类 + 任务关联 ----------
 * 能力：
 *   1) getNotes() / saveNotes(notes)              — 存储访问器（localStorage）
 *   2) createNote(title, content, tags, category) — 创建笔记，返回新笔记对象
 *   3) updateNote(id, updates)                    — 更新笔记字段，刷新 updatedAt
 *   4) deleteNote(id)                             — 删除笔记
 *   5) getNoteById(id)                            — 按 ID 查找
 *   6) getNotesByTag(tag) / getNotesByCategory(c) — 按标签 / 分类筛选
 *   7) getAllTags() / getAllCategories()          — 标签 / 分类聚合（含计数）
 *   8) linkNoteToTask / unlinkNoteFromTask        — 任务关联管理
 *   9) getNotesLinkedToTask(taskId)               — 查询任务关联的笔记
 *  10) renderNoteEditor(note) / renderNoteList()  — 编辑器 / 列表渲染
 *  11) openNotesModal / closeNotesModal           — 笔记管理弹窗
 *  12) openNoteEditorModal / closeNoteEditorModal — 笔记编辑弹窗
 *  13) saveNoteFromEditor()                       — 从编辑器表单保存笔记
 *  14) 知识库：renderKnowledgeBase / openKnowledgeBaseModal / closeKnowledgeBaseModal
 *
 * 笔记结构：{id, title, content(markdown), tags[], category, createdAt, updatedAt, linkedTaskIds[]}
 *
 * 设计约定：
 *   - 存储键：PREFIX + "notes"
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 *   - Markdown 渲染复用 mdToHtml（03-util-markdown.js，03 < 47，可直接引用）
 *   - esc / PREFIX / $ / $$ 在更早模块定义，可直接引用
 */
/* v3.7.75 解耦：NOTES_STORAGE_KEY / getNotes / saveNotes 已下沉到 data-rw（纯存取归数据层，
   消除 ai-tools / render-* 对本块的逆层引用）；本块保留 CRUD 与全部 UI。 */

/**
 * 创建新笔记
 * @param {string} title - 标题
 * @param {string} content - Markdown 内容
 * @param {string[]} tags - 标签数组
 * @param {string} category - 分类
 * @returns {Object} 新建的笔记对象
 */
/* v3.7.75 解耦：createNote 亦下沉 data-rw —— 它是纯模型工厂且被 AI 工具直接调用，
   留在本块就是 ai-tools→ui-ge-notes 的最后一条逆层边。 */

/**
 * 更新笔记字段
 * @param {string} id - 笔记 ID
 * @param {Object} updates - 要更新的字段对象
 * @returns {boolean} 是否更新成功
 */
function updateNote(id, updates){
  if(!id || !updates) return false;
  const notes = getNotes();
  let note = null;
  for(let i = 0; i < notes.length; i++){
    if(notes[i].id === id){ note = notes[i]; break; }
  }
  if(!note) return false;
  const keys = Object.keys(updates);
  for(let k = 0; k < keys.length; k++){
    note[keys[k]] = updates[keys[k]];
  }
  note.updatedAt = Date.now();
  saveNotes(notes);
  return true;
}
/**
 * 删除笔记
 * @param {string} id - 笔记 ID
 * @returns {boolean} 是否删除成功
 */
function deleteNote(id){
  if(!id) return false;
  const notes = getNotes();
  const filtered = notes.filter(function(n){ return n.id !== id; });
  if(filtered.length === notes.length) return false;
  // v3.1：接入回收站——保存被删除的笔记快照
  const removed = notes.find(function(n){ return n.id === id; });
  if(removed){
    try{
      addToRecycleBin("file",
        t("p5.recordPrefix", "记录：「")+(removed.title||removed.id||t("p5.unnamed", "未命名"))+"」",
        (removed.sc||"")+(removed.tags?(t("p5.tagsSuffix", " · 标签：")+removed.tags):""),
        { note: removed },
        t("p5.studyRecord", "学习资料/记录"));
    }catch(_){ /* 回收站写入失败不影响删除 */ }
  }
  saveNotes(filtered);
  return true;
}
/**
 * 按 ID 查找笔记
 * @param {string} id - 笔记 ID
 * @returns {Object|null} 笔记对象或 null
 */
function getNoteById(id){
  if(!id) return null;
  const notes = getNotes();
  for(let i = 0; i < notes.length; i++){
    if(notes[i].id === id) return notes[i];
  }
  return null;
}
/**
 * 按标签筛选笔记
 * @param {string} tag - 标签
 * @returns {Array<Object>} 匹配的笔记数组
 */
function getNotesByTag(tag){
  if(!tag) return [];
  return getNotes().filter(function(n){
    return n.tags && n.tags.indexOf(tag) >= 0;
  });
}
/**
 * 按分类筛选笔记
 * @param {string} category - 分类
 * @returns {Array<Object>} 匹配的笔记数组
 */
function getNotesByCategory(category){
  return getNotes().filter(function(n){
    return n.category === category;
  });
}
/**
 * 获取所有标签及其计数
 * @returns {Object<string, number>} 标签→计数映射
 */
function getAllTags(){
  const tags = {};
  getNotes().forEach(function(n){
    if(n.tags){
      n.tags.forEach(function(t){
        tags[t] = (tags[t] || 0) + 1;
      });
    }
  });
  return tags;
}
/**
 * 获取所有分类及其计数
 * @returns {Object<string, number>} 分类→计数映射
 */
function getAllCategories(){
  const cats = {};
  getNotes().forEach(function(n){
    const c = n.category || t("p5.default", "默认");
    cats[c] = (cats[c] || 0) + 1;
  });
  return cats;
}
/**
 * 关联笔记到任务
 * @param {string} noteId - 笔记 ID
 * @param {string} taskId - 任务 ID
 * @returns {boolean} 是否关联成功
 */
function linkNoteToTask(noteId, taskId){
  if(!noteId || !taskId) return false;
  const notes = getNotes();
  let note = null;
  for(let i = 0; i < notes.length; i++){
    if(notes[i].id === noteId){ note = notes[i]; break; }
  }
  if(!note) return false;
  if(!note.linkedTaskIds) note.linkedTaskIds = [];
  if(note.linkedTaskIds.indexOf(taskId) < 0) note.linkedTaskIds.push(taskId);
  saveNotes(notes);
  return true;
}
/**
 * 取消笔记与任务的关联
 * @param {string} noteId - 笔记 ID
 * @param {string} taskId - 任务 ID
 * @returns {boolean} 是否取消成功
 */
function unlinkNoteFromTask(noteId, taskId){
  if(!noteId || !taskId) return false;
  const notes = getNotes();
  let note = null;
  for(let i = 0; i < notes.length; i++){
    if(notes[i].id === noteId){ note = notes[i]; break; }
  }
  if(!note || !note.linkedTaskIds) return false;
  const before = note.linkedTaskIds.length;
  note.linkedTaskIds = note.linkedTaskIds.filter(function(id){ return id !== taskId; });
  if(note.linkedTaskIds.length === before) return false;
  saveNotes(notes);
  return true;
}
/**
 * 查询任务关联的所有笔记
 * @param {string} taskId - 任务 ID
 * @returns {Array<Object>} 关联的笔记数组
 */
function getNotesLinkedToTask(taskId){
  if(!taskId) return [];
  return getNotes().filter(function(n){
    return n.linkedTaskIds && n.linkedTaskIds.indexOf(taskId) >= 0;
  });
}
/**
 * 渲染笔记编辑器表单
 * @param {Object} note - 笔记对象（空则渲染空白表单）
 * @returns {string} 编辑器 HTML
 */
function renderNoteEditor(note){
  const n = note || {id:"", title:"", content:"", tags:[], category:t("profile.default", "默认")};
  let html = '<div class="note-editor" data-note-id="' + esc(n.id || "") + '">';
  html += '<input class="note-title" value="' + esc(n.title || "") + '" placeholder="' + t("p5.noteTitle", "笔记标题") + '" maxlength="200">';
  html += '<input class="note-tags" value="' + esc((n.tags || []).join(", ")) + '" placeholder="' + t("p5.tagsPlaceholder", "标签（逗号分隔）") + '" maxlength="200">';
  html += '<input class="note-category" value="' + esc(n.category || t("p5.default", "默认")) + '" placeholder="' + t("p5.categoryPlaceholder", "分类（如：知识库/工作笔记/学习笔记）") + '" maxlength="100">';
  html += '<textarea class="note-content" placeholder="' + t("p5.markdownPlaceholder", "输入 Markdown 内容...") + '" maxlength="10000">' + esc(n.content || "") + '</textarea>';
  html += '<div class="note-preview">' + (typeof mdToHtml === "function" ? mdToHtml(n.content || "") : "") + '</div>';
  html += '</div>';
  return html;
}
/**
 * 渲染笔记列表
 * @param {Array<Object>} notes - 笔记数组（空则读取全部）
 * @returns {string} 列表 HTML
 */
function renderNoteList(notes){
  const list = notes || getNotes();
  let html = '<div class="note-list">';
  if(!list.length){
    html += t('p5.noNotes', '<p class="empty-hint">暂无笔记，点击「新建笔记」开始记录</p>');
  }
  list.forEach(function(n){
    html += '<div class="note-item" data-note-id="' + esc(n.id || "") + '">';
    html += '<h4 class="note-item-title">' + esc(n.title || t("p5.untitled", "无标题")) + '</h4>';
    const tags = n.tags || [];
    if(tags.length){
      html += '<div class="note-tags">';
      tags.forEach(function(t){
        html += '<span class="note-tag">' + esc(t) + '</span>';
      });
      html += '</div>';
    }
    html += '<p class="note-excerpt">' + esc((n.content || "").substring(0, 100)) + '</p>';
    html += '<div class="note-meta">';
    html += '<span class="note-cat">' + esc(n.category || t("p5.default", "默认")) + '</span>';
    if(n.linkedTaskIds && n.linkedTaskIds.length){
      html += '<span class="note-link-count">' + t('p5.linkedPrefix', '关联 ') + n.linkedTaskIds.length + t('p5.linkedSuffix', ' 个任务</span>');
    }
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}
/**
 * 打开笔记管理弹窗（渲染列表到 #notesModalBody）
 * @returns {void}
 */
function openNotesModal(){
  const modal = $("#notesModal");
  if(!modal) return;
  const body = $("#notesModalBody");
  if(body){
    let html = '<div class="notes-toolbar">';
    html += '<button type="button" class="addbtn note-new-btn" id="btnNoteNew" data-sc="accent">+ ' + t('p5.newNote', '新建笔记') + '</button>';
    html += '<input class="note-filter-input" id="noteFilterInput" placeholder="' + t("p5.filterPlaceholder", "按标题/标签筛选...") + '" maxlength="200">';
    html += '</div>';
    html += renderNoteList();
    body.innerHTML = sanitizeHtml(html);
    _bindNotesModalEvents();
  }
  modal.classList.add("show");
}
/**
 * 关闭笔记管理弹窗
 * @returns {void}
 */
function closeNotesModal(){
  const modal = $("#notesModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 打开笔记编辑弹窗
 * @param {Object} note - 要编辑的笔记（空则新建）
 * @returns {void}
 */
function openNoteEditorModal(note){
  const modal = $("#noteEditorModal");
  if(!modal) return;
  const body = $("#noteEditorModalBody");
  if(body){
    const n = note || null;
    let html = renderNoteEditor(n);
    html += '<div class="note-editor-actions">';
    html += '<button type="button" class="addbtn sm" id="btnNoteSave" >' + t('common.save', '保存') + '</button>';
    html += '<button type="button" class="addbtn sm" id="btnNoteCancel"  data-sc="muted">' + t('common.cancel', '取消') + '</button>';
    if(n && n.id){
      html += '<button type="button" class="addbtn" id="btnNoteDelete" data-sc="danger-muted">' + t('common.delete', '删除') + '</button>';
    }
    html += '</div>';
    body.innerHTML = sanitizeHtml(html);
    _bindNoteEditorEvents(n);
  }
  modal.classList.add("show");
}
/**
 * 关闭笔记编辑弹窗
 * @returns {void}
 */
function closeNoteEditorModal(){
  const modal = $("#noteEditorModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 从编辑器表单保存笔记（新建或更新）
 * @returns {Object|null} 保存后的笔记对象，失败返回 null
 */
function saveNoteFromEditor(){
  const editor = $(".note-editor");
  if(!editor) return null;
  const editId = editor.getAttribute("data-note-id") || "";
  const title = $(".note-title", editor).value || "";
  const tagsStr = $(".note-tags", editor).value || "";
  const category = $(".note-category", editor).value || t("p5.default", "默认");
  const content = $(".note-content", editor).value || "";
  const tags = tagsStr.split(",").map(function(t){ return t.trim(); }).filter(function(t){ return t; });
  if(!title.trim()){ try{ toast(t("p5.noteTitleRequired", "请输入笔记标题"), "warn"); }catch(e){} return null; }
  if(editId){
    updateNote(editId, {title: title, tags: tags, category: category, content: content});
    try{ toast(t("p5.noteUpdated", "笔记已更新"), "ok"); }catch(e){}
    return getNoteById(editId);
  } else {
    const note = createNote(title, content, tags, category);
    try{ toast(t("p5.noteCreated", "笔记已创建"), "ok"); }catch(e){}
    return note;
  }
}
/**
 * 绑定笔记管理弹窗事件（新建按钮 / 列表项点击 / 筛选）
 * @returns {void}
 */
function _bindNotesModalEvents(){
  const newBtn = $("#btnNoteNew");
  if(newBtn){
    newBtn.onclick = function(){ openNoteEditorModal(null); };
  }
  const filterInput = $("#noteFilterInput");
  if(filterInput){
    filterInput.oninput = function(){
      const q = (filterInput.value || "").toLowerCase().trim();
      const notes = getNotes();
      const filtered = !q ? notes : notes.filter(function(n){
        return (n.title || "").toLowerCase().indexOf(q) >= 0 ||
               (n.tags || []).some(function(t){ return t.toLowerCase().indexOf(q) >= 0; }) ||
               (n.category || "").toLowerCase().indexOf(q) >= 0;
      });
      const listEl = $(".note-list");
      if(listEl) listEl.outerHTML = sanitizeHtml(renderNoteList(filtered));
    };
  }
  const list = $(".note-list");
  if(list){
    list.addEventListener("click", function(e){
      const item = e.target.closest(".note-item");
      if(!item) return;
      const id = item.getAttribute("data-note-id");
      const note = getNoteById(id);
      if(note) openNoteEditorModal(note);
    });
  }
}
/**
 * 绑定笔记编辑器事件（保存 / 取消 / 删除 / 实时预览）
 * @param {Object} note - 正在编辑的笔记（null 表示新建）
 * @returns {void}
 */
function _bindNoteEditorEvents(note){
  const saveBtn = $("#btnNoteSave");
  if(saveBtn){
    saveBtn.onclick = function(){
      const saved = saveNoteFromEditor();
      if(saved){
        closeNoteEditorModal();
        openNotesModal();
      }
    };
  }
  const cancelBtn = $("#btnNoteCancel");
  if(cancelBtn){
    cancelBtn.onclick = function(){ closeNoteEditorModal(); };
  }
  const delBtn = $("#btnNoteDelete");
  if(delBtn && note && note.id){
    delBtn.onclick = function(){
      if(!confirm(t("p5.confirmDeleteNote", "确定删除此笔记？"))) return;
      deleteNote(note.id);
      try{ toast(t("p5.noteDeleted", "笔记已删除"), "ok"); }catch(e){}
      closeNoteEditorModal();
      openNotesModal();
    };
  }
  const contentTa = $(".note-content");
  const preview = $(".note-preview");
  if(contentTa && preview){
    contentTa.oninput = function(){
      if(typeof mdToHtml === "function"){
        preview.innerHTML = sanitizeHtml(mdToHtml(contentTa.value || ""));
      }
    };
  }
}
/* ---------- 知识库：按主题分类的结构化知识视图 ----------
 * 知识库复用笔记系统，通过 category 字段实现按主题分类。
 * renderKnowledgeBase() 按分类分组渲染，提供主题导航。
 */
/**
 * 渲染知识库视图（按分类/主题分组）
 * @returns {string} 知识库 HTML
 */
function renderKnowledgeBase(){
  const notes = getNotes();
  const cats = getAllCategories();
  const catKeys = Object.keys(cats).sort();
  let html = '<div class="kb-container">';
  html += '<div class="kb-summary">';
  html += '<span class="kb-stat">' + t('p5.totalPrefix', '共 ') + notes.length + t('p5.notesSuffix', ' 条笔记</span>');
  html += '<span class="kb-stat">' + catKeys.length + t('p5.catSuffix', ' 个分类</span>');
  const tagMap = getAllTags();
  const tagCount = Object.keys(tagMap).length;
  html += '<span class="kb-stat">' + tagCount + t('p5.tagSuffix', ' 个标签</span>');
  html += '</div>';
  /* v3.7.76：文件知识（RAG 文件导入）—— 列表 + 导入入口，随知识库弹窗一起渲染 */
  const ragFiles = (typeof getRagFiles === "function") ? getRagFiles() : [];
  html += '<div class="kb-files" id="kbFiles">';
  html += '<div class="kb-files-head"><h3 class="kb-cloud-title">' + esc(t('p5.kbFilesTitle', '文件知识（进 AI 检索索引）')) + '</h3>'
    + '<label class="addbtn sm" for="kbFileInput" style="cursor:pointer">' + esc(t('p5.kbFilesImport', '导入文件'))
    + '<input type="file" id="kbFileInput" multiple accept="' + esc(t('p5.kbFilesAccept', '.txt,.md,.markdown,.html,.htm,.csv,.json,.log')) + '" style="display:none"></label></div>';
  if(!ragFiles.length){
    html += '<p class="empty-hint">' + esc(t('p5.kbFilesEmpty', '尚未导入文件。支持 .txt / .md / .html 等纯文本，导入后按段落切块进检索索引，可随时删除。')) + '</p>';
  } else {
    html += '<div class="kb-files-list" style="margin-top:8px">';
    ragFiles.forEach(function(f){
      html += '<div class="kb-file-item" style="display:flex;align-items:center;gap:8px;padding:4px 0" data-file-id="' + esc(f.id) + '">'
        + '<span class="kb-file-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.name) + '</span>'
        + '<span class="kb-file-meta">' + ((f.chunks || []).length) + esc(t('p5.kbFilesChunkCount', ' 块')) + '</span>'
        + '<button type="button" class="addbtn sm kb-file-del" data-file-del="' + esc(f.id) + '">' + esc(t('p5.kbFilesDelete', '删除')) + '</button>'
        + '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  if(!notes.length){
    html += t('p5.kbEmpty', '<p class="empty-hint">知识库为空，到「笔记管理」创建第一条笔记吧</p>');
  } else {
    html += '<div class="kb-categories">';
    catKeys.forEach(function(cat){
      const catNotes = getNotesByCategory(cat);
      html += '<div class="kb-category" data-category="' + esc(cat) + '">';
      html += '<h3 class="kb-cat-title">' + esc(cat) + ' <span class="kb-cat-count">(' + catNotes.length + ')</span></h3>';
      html += '<div class="kb-cat-notes">';
      catNotes.forEach(function(n){
        html += '<div class="kb-note-item" data-note-id="' + esc(n.id || "") + '">';
        html += '<h4 class="kb-note-title">' + esc(n.title || t("p5.untitled", "无标题")) + '</h4>';
        const tags = n.tags || [];
        if(tags.length){
          html += '<div class="note-tags">';
          tags.forEach(function(t){
            html += '<span class="note-tag">' + esc(t) + '</span>';
          });
          html += '</div>';
        }
        html += '<p class="note-excerpt">' + esc((n.content || "").substring(0, 120)) + '</p>';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    if(tagCount > 0){
      html += '<div class="kb-tag-cloud">';
      html += t('p5.tagCloud', '<h3 class="kb-cloud-title">标签云</h3>');
      Object.keys(tagMap).sort().forEach(function(t){
        html += '<span class="note-tag kb-tag" data-tag="' + esc(t) + '">' + esc(t) + ' <em>(' + tagMap[t] + ')</em></span>';
      });
      html += '</div>';
    }
  }
  html += '</div>';
  return html;
}
/**
 * 打开知识库弹窗
 * @returns {void}
 */
function openKnowledgeBaseModal(){
  const modal = $("#knowledgeBaseModal");
  if(!modal) return;
  const body = $("#knowledgeBaseModalBody");
  if(body){
    body.innerHTML = sanitizeHtml(renderKnowledgeBase());
    _bindKnowledgeBaseEvents();
  }
  modal.classList.add("show");
}
/**
 * 关闭知识库弹窗
 * @returns {void}
 */
function closeKnowledgeBaseModal(){
  const modal = $("#knowledgeBaseModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 绑定知识库事件（点击笔记项打开编辑器）
 * @returns {void}
 */
function _bindKnowledgeBaseEvents(){
  const container = $(".kb-container");
  if(!container) return;
  container.addEventListener("click", function(e){
    const noteItem = e.target.closest(".kb-note-item");
    if(noteItem){
      const id = noteItem.getAttribute("data-note-id");
      const note = getNoteById(id);
      if(note) openNoteEditorModal(note);
      return;
    }
    /* v3.7.76：删除文件条目（其索引块由增量同步随 diff 移除） */
    const delBtn = e.target.closest(".kb-file-del");
    if(delBtn){
      const fid = delBtn.getAttribute("data-file-del");
      if(fid && confirm(t('p5.kbFilesConfirmDelete', '删除该文件？其已建立的检索索引块会一并移除。'))){
        ragDeleteFile(fid);
        try{ toast(t('p5.kbFilesDeleted', '文件已删除，其索引块将随之移除'), "ok"); }catch(e2){}
        openKnowledgeBaseModal();   /* 重渲染列表 */
      }
      return;
    }
    const tagEl = e.target.closest(".kb-tag");
    if(tagEl){
      const tag = tagEl.getAttribute("data-tag");
      const tagged = getNotesByTag(tag);
      try{ toast(t("p5.tagPrefix", "标签「") + tag + t("p5.tagCountMid", "」共 ") + tagged.length + t("p5.tagCountSuffix", " 条笔记"), "ok"); }catch(e){}
    }
  });
  /* v3.7.76：文件选择器 —— 选完即导入并重渲染列表 */
  const fileInput = $("#kbFileInput");
  if(fileInput){
    fileInput.addEventListener("change", async function(){
      const fls = Array.prototype.slice.call(fileInput.files || []);
      fileInput.value = "";                        /* 允许重选同一文件 */
      if(!fls.length) return;
      await ragImportFiles(fls);
      openKnowledgeBaseModal();
    });
  }
}


/* ============================================================
 * v3.7.76：知识库文件导入（RAG 文件知识）
 * 分层：切块与导入动作在本块（UI 动作），存储 getRagFiles/saveRagFiles 在 data-rw，
 * 内容哈希 fnv1aHex 在 core —— 全部正向边。导入只写存储 + emitDataMutate 广播，
 * 建索引由 ai-tools 的 ragSyncIncremental（4s 防抖）完成：本块不发网络请求。
 * ============================================================ */
const RAG_FILE_TEXT_EXT = ["txt", "md", "markdown", "html", "htm", "csv", "json", "log"];
/** 按扩展名准入并预清洗（html 剥 script/style/标签取正文）；不支持返回 null */
function _ragFileText(name, raw){
  const ext = (String(name || "").split(".").pop() || "").toLowerCase();
  if(RAG_FILE_TEXT_EXT.indexOf(ext) < 0) return null;
  let text = String(raw || "");
  if(ext === "html" || ext === "htm"){
    try{
      const doc = new DOMParser().parseFromString(text, "text/html");
      doc.querySelectorAll("script,style,noscript").forEach(function(n){ n.remove(); });
      text = (doc.body && doc.body.textContent) || "";
    }catch(e){ /* 解析失败按原文处理 */ }
  }
  return text.replace(/\r\n/g, "\n").trim();
}
/** 段落聚合切块：目标 ≤1000 字符，单段 >1600 按句读硬切。返回块数组 */
function _ragChunkText(text){
  const paras = String(text || "").split(/\n\s*\n+/).map(function(s){ return s.trim(); }).filter(Boolean);
  const chunks = [];
  let cur = "";
  const flush = function(){ if(cur.trim()){ chunks.push(cur.trim()); cur = ""; } };
  for(const p of paras){
    if(p.length > 1600){
      flush();
      let buf = "";
      const pieces = p.split(/(?<=[。！？.!?;；])\s*/);
      for(const piece of pieces){
        if((buf + piece).length > 1000 && buf){ chunks.push(buf.trim()); buf = piece; }
        else buf += piece;
        while(buf.length > 1600){ chunks.push(buf.slice(0, 1600)); buf = buf.slice(1600); }
      }
      cur = buf;
      continue;
    }
    if((cur + "\n\n" + p).length > 1000 && cur){ flush(); cur = p; }
    else cur = cur ? (cur + "\n\n" + p) : p;
  }
  flush();
  return chunks;
}
/** 导入纯文本（File 选择与测试共用的核心路径）。返回 {added, replaced} 或 null（被拒） */
async function ragImportText(name, rawText){
  const text = _ragFileText(name, rawText);
  if(text === null){ try{ toast(t('p5.kbFilesUnsupported', '暂不支持该类型（二进制如 PDF/DOCX 请先转成纯文本）'), "warn"); }catch(e){} return null; }
  if(text.length > RAG_FILE_MAX_CHARS){ try{ toast(t('p5.kbFilesTooBig', '文件过大（上限 256KB 文本），请拆分后导入'), "warn"); }catch(e){} return null; }
  const files = getRagFiles();
  const replaced = files.some(function(f){ return f.name === name; });
  const kept = files.filter(function(f){ return f.name !== name; });
  if(!replaced && kept.length >= RAG_FILES_MAX_COUNT){ try{ toast(t('p5.kbFilesTooBig', '文件数已达上限'), "warn"); }catch(e){} return null; }
  const fid = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const chunks = _ragChunkText(text).map(function(ct){
    /* docId 不含 fid（每次导入都会换）：由 <文件名>+<块内容> 派生 —— 同名同内容重导入
       docId 不变 → 哈希 diff 零重嵌；改名或改内容才重嵌。 */
    return { docId: "file:" + fnv1aHex(name + "\\n" + ct) + ":" + fnv1aHex(ct), text: ct };
  });
  kept.push({ id: fid, name: String(name), size: text.length, ts: Date.now(), chunks: chunks });
  if(!saveRagFiles(kept)){ return null; }   /* 配额耗尽等：如实失败，不留半截状态 */
  try{ if(typeof emitDataMutate === "function") emitDataMutate("import"); }catch(e){ /* 索引不阻塞导入 */ }
  return { added: chunks.length, replaced: replaced };
}
/** File 对象入口（真实选择器）：逐个读文本后走 ragImportText */
async function ragImportFiles(fileList){
  const arr = Array.prototype.slice.call(fileList || []);
  let ok = 0, total = 0, replaced = false;
  for(const f of arr){
    const text = await new Promise(function(res){
      try{
        const fr = new FileReader();
        fr.onload = function(){ res(String(fr.result || "")); };
        fr.onerror = function(){ res(""); };
        fr.readAsText(f);
      }catch(e){ res(""); }
    });
    const r = await ragImportText(f.name, text);
    if(r){ ok++; total += r.added; if(r.replaced) replaced = true; }
  }
  if(ok){
    try{ toast(t('p5.kbFilesImported', '已入库：') + ok + t('p5.kbFilesCount', '个文件 · ') + total + t('p5.kbFilesChunkSuffix', ' 块（后台数秒内自动进检索索引，失败会进诊断面板）') + (replaced ? t('p5.kbFilesReplaced', '（同名旧文件已替换）') : ""), "ok"); }catch(e){}
  }
  return { files: ok, chunks: total };
}
/** 删除文件条目（其索引块由增量同步随 diff 移除） */
function ragDeleteFile(id){
  const kept = getRagFiles().filter(function(f){ return f.id !== id; });
  const ok = saveRagFiles(kept);
  try{ if(typeof emitDataMutate === "function") emitDataMutate("import"); }catch(e){ /* 索引不阻塞 */ }
  return ok;
}

/* v3.7.59：v1.7-A 的「笔记变更钩子 → 重建 RAG 索引」已移除。
 * 它维护的是 v1.7-A 自己的旧 TF-IDF 索引 _ragIndex（buildIndex/indexFromNotes/saveRagIndex），
 * 而 v3.7.57 起真正被检索的是 ai-tools.js 里的 getRagDocs/ragIndexAdd 一套 —— 旧索引没有任何读取方，
 * 所以这个挂在笔记 CRUD 上的钩子只是在刷一份死表。
 * v3.7.67：增量索引已落地 —— saveNotes（上方）经 core 的 emitDataMutate 广播，
 * ai-tools 的 ragSyncIncremental 按内容哈希 diff 只落变更文档，笔记改动即时进真 RAG，
 * 任务/记录/对话历史同理（写路径各自广播）。手动「重建索引」（ragReindex）保留作全量兜底。 */// ===== Full-Text Search (v1.6-D 知识管理) =====
/* ---------- 全文搜索：跨任务 / 记录 / 笔记搜索 + 关键词高亮 ----------
 * 能力：
 *   1) searchAll(query, options)           — 跨任务/记录/笔记全文搜索
 *   2) highlightSearchResult(text, query)  — 关键词高亮（<mark> 包裹）
 *   3) renderSearchResults(results, query) — 渲染搜索结果列表
 *   4) openSearchModal / closeSearchModal  — 搜索弹窗控制
 *   5) executeSearch(query)               — 执行搜索并渲染结果
 *
 * 设计约定：
 *   - 搜索范围：任务（title/note/tags）、记录（title/note）、笔记（title/content/tags）
 *   - 大小写不敏感，子串匹配
 *   - 高亮用 <mark class="search-highlight">，CSS 令牌着色
 *   - getActiveTasks / ORDER / getRec 在更早模块定义（11/05 < 48），可直接引用
 *   - getNotes 在 47-notes.js 定义（47 < 48），可直接引用
 *   - esc / $ / $$ 在更早模块定义，可直接引用
 */
/**
 * 文本匹配辅助（大小写不敏感子串匹配）
 * @param {string} text - 待匹配文本
 * @param {string} query - 查询串（已小写化）
 * @returns {boolean} 是否匹配
 */
function _matchText(text, query){
  if(!text) return false;
  return String(text).toLowerCase().indexOf(query) >= 0;
}
/**
 * 查找任务匹配字段
 * @param {Object} item - 任务对象
 * @param {string} query - 查询串（已小写化）
 * @returns {string[]} 匹配字段名数组
 */
function _findMatches(item, query){
  const matches = [];
  if(_matchText(item.title, query)) matches.push("title");
  if(_matchText(item.note, query)) matches.push("note");
  if(item.tags && item.tags.some(function(tag){ return _matchText(tag, query); })) matches.push("tags");
  return matches;
}
/**
 * 跨任务 / 记录 / 笔记全文搜索
 * @param {string} query - 查询关键词
 * @param {Object} options - 搜索选项（{tasks:false, records:false, notes:false} 可禁用对应类型）
 * @returns {{tasks:Array, records:Array, notes:Array, total:number}} 搜索结果
 */
function searchAll(query, options){
  if(!query || !query.trim()){
    return { tasks: [], records: [], notes: [], total: 0 };
  }
  const q = query.toLowerCase().trim();
  const opt = options || {};
  const results = { tasks: [], records: [], notes: [], features: [], total: 0 };

  // 搜索任务
  if(opt.tasks !== false){
    let tasks = [];
    try{ tasks = getActiveTasks() || []; }catch(e){ tasks = []; }
    results.tasks = tasks.filter(function(t){
      return _matchText(t.title, q) || _matchText(t.note, q) ||
             (t.tags && t.tags.some(function(tag){ return _matchText(tag, q); }));
    }).map(function(t){
      return { item: t, type: "task", matches: _findMatches(t, q) };
    });
  }

  // 搜索记录
  if(opt.records !== false){
    let recs = [];
    try{
      ORDER.forEach(function(sc){
        const r = getRec(sc) || [];
        r.forEach(function(item){
          recs.push(Object.assign({}, item, { _sc: sc }));
        });
      });
    }catch(e){ recs = []; }
    results.records = recs.filter(function(r){
      // v3.1.2 A-档：全字段匹配——此前只搜 title/note，参会人(who)/数值(value)/语言(lang)/代码(code)全搜不到
      const RECSYS = ["_sc","id","created","deletedAt","nextReview","reps","ease","_verified","_lastVerifiedAt"];
      return Object.keys(r).some(function(k){
        if(RECSYS.indexOf(k) >= 0) return false;
        return _matchText(r[k], q);
      });
    }).map(function(r){
      return { item: r, type: "record" };
    });
  }

  // 搜索笔记
  if(opt.notes !== false && typeof getNotes === "function"){
    let notes = [];
    try{ notes = getNotes() || []; }catch(e){ notes = []; }
    results.notes = notes.filter(function(n){
      return _matchText(n.title, q) || _matchText(n.content, q) ||
             (n.tags && n.tags.some(function(tag){ return _matchText(tag, q); }));
    }).map(function(n){
      return { item: n, type: "note" };
    });
  }

  // 搜索场景功能卡数据（v3.0：会议/项目/考勤/报销/知识库/阅读/练习/考试/报表/图表/前端/SQL/UI/3D/计划）
  if(opt.features !== false){
    try{
      Object.keys(SCENE_FEATURE_BIND).forEach(function(sc){
        const feats = SCENE_FEATURE_BIND[sc] || {};
        Object.keys(feats).forEach(function(fid){
          const cfg = feats[fid];
          const arr = load(PREFIX + cfg.key, []);
          arr.forEach(function(item){
            const haystack = Object.keys(item).map(function(k){ return String(item[k] || ""); }).join(" ");
            if(_matchText(haystack, q)){
              results.features.push({ item: item, type: "feature", sc: sc, fid: fid });
            }
          });
        });
      });
      // v3.1.2 A-档：工具箱数据纳入搜索——此前 tool_* 键（生活缴费/采购/运动/外卖/出行等台账）
      // 完全不被搜索覆盖，工具里记的账单/外卖全局搜索一概搜不到
      if(typeof TOOL_APPS === "object" && TOOL_APPS){
        Object.keys(TOOL_APPS).forEach(function(tid){
          const arr = load(PREFIX + "tool_" + tid, []);
          (Array.isArray(arr) ? arr : []).forEach(function(item){
            const haystack = Object.keys(item).map(function(k){ return String(item[k] || ""); }).join(" ");
            if(_matchText(haystack, q)){
              results.features.push({ item: item, type: "tool", sc: tid, fid: "tool" });
            }
          });
        });
      }
    }catch(e){ /* 搜索异常不阻断 */ }
  }

  results.total = results.tasks.length + results.records.length + results.notes.length + results.features.length;
  return results;
}
/**
 * 高亮搜索关键词（先转义 HTML，再用 <mark> 包裹匹配项）
 * @param {string} text - 原始文本
 * @param {string} query - 查询关键词
 * @returns {string} 高亮后的安全 HTML
 */
function highlightSearchResult(text, query){
  if(!text) return "";
  const escaped = esc(text);
  if(!query || !query.trim()) return escaped;
  const escapedQuery = esc(query);
  if(!escapedQuery) return escaped;
  // 转义正则特殊字符
  const regexSafe = escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try{
    const regex = new RegExp("(" + regexSafe + ")", "gi");
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
  }catch(e){
    return escaped;
  }
}
/**
 * 渲染搜索结果列表
 * @param {Object} results - searchAll 返回的结果对象
 * @param {string} query - 查询关键词（用于高亮）
 * @returns {string} 结果列表 HTML
 */
function renderSearchResults(results, query){
  let html = '<div class="search-results">';
  if(!results || results.total === 0){
    html += t('p5.noMatch', '<p class="empty-hint">未找到匹配结果</p>');
  } else {
    html += '<p class="search-summary">' + t('p5.foundPrefix', '找到 ') + results.total + t('p5.resultSuffix', ' 条结果');
    const parts = [];
    if(results.tasks.length) parts.push(t("p5.taskPrefix", "任务 ") + results.tasks.length);
    if(results.records.length) parts.push(t("p5.recordPrefix2", "记录 ") + results.records.length);
    if(results.notes.length) parts.push(t("p5.notePrefix", "笔记 ") + results.notes.length);
    if(results.features && results.features.length) parts.push(t("p5.featurePrefix", "功能 ") + results.features.length);
    if(parts.length) html += "（" + parts.join(" / ") + "）";
    html += '</p>';
    results.tasks.forEach(function(r){
      html += '<div class="search-item search-item-task" data-type="task">';
      html += t('p5.badgeTask', '<span class="type-badge type-badge-task">任务</span>');
      html += '<span class="search-item-title">' + highlightSearchResult(r.item.title, query) + '</span>';
      if(r.item.note){
        html += '<span class="search-item-desc">' + highlightSearchResult((r.item.note || "").substring(0, 80), query) + '</span>';
      }
      html += '</div>';
    });
    results.records.forEach(function(r){
      html += '<div class="search-item search-item-record" data-type="record">';
      html += t('p5.badgeRecord', '<span class="type-badge type-badge-record">记录</span>');
      html += '<span class="search-item-title">' + highlightSearchResult(r.item.title, query) + '</span>';
      if(r.item.note){
        html += '<span class="search-item-desc">' + highlightSearchResult((r.item.note || "").substring(0, 80), query) + '</span>';
      }
      html += '</div>';
    });
    results.notes.forEach(function(r){
      html += '<div class="search-item search-item-note" data-type="note">';
      html += t('p5.badgeNote', '<span class="type-badge type-badge-note">笔记</span>');
      html += '<span class="search-item-title">' + highlightSearchResult(r.item.title, query) + '</span>';
      if(r.item.content){
        html += '<span class="search-item-desc">' + highlightSearchResult((r.item.content || "").substring(0, 80), query) + '</span>';
      }
      html += '</div>';
    });
    // v3.0：场景功能卡搜索结果（会议/项目/知识库/报表/SQL 等）
    (results.features || []).forEach(function(r){
      const fname = (SCENE_FEATURES[r.sc] || []).find(function(f){ return f.id === r.fid; });
      const label = fname ? fname.label : r.fid;
      const title = r.item.title || r.item.book || r.item.name || r.item.question || r.item.sql || Object.values(r.item).join(" ");
      html += '<div class="search-item search-item-note" data-type="feature">';
      html += '<span class="type-badge type-badge-note">' + esc(label) + '</span>';
      html += '<span class="search-item-title">' + highlightSearchResult(String(title).substring(0, 60), query) + '</span>';
      html += '</div>';
    });
  }
  html += '</div>';
  return html;
}
/**
 * 打开搜索弹窗
 * @returns {void}
 */
function openSearchModal(){
  const modal = $("#searchModal");
  if(!modal) return;
  modal.classList.add("show");
  const input = $("#searchInput");
  if(input){
    input.value = "";
    setTimeout(function(){ try{ input.focus(); }catch(e){} }, 50);
  }
  const body = $("#searchModalBody");
  if(body){
    body.innerHTML = sanitizeHtml(t('p5.searchHint', '<p class="empty-hint">输入关键词搜索任务 / 记录 / 笔记</p>'));
  }
}
/**
 * 关闭搜索弹窗
 * @returns {void}
 */
function closeSearchModal(){
  const modal = $("#searchModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 执行搜索并渲染结果到弹窗
 * @param {string} query - 查询关键词
 * @returns {Object} 搜索结果对象
 */
function executeSearch(query){
  const results = searchAll(query, {});
  const body = $("#searchModalBody");
  if(body){
    body.innerHTML = sanitizeHtml(renderSearchResults(results, query));
  }
  return results;
}// ===== Automation Workflow (v1.6-E 自动化工作流) [DEPRECATED v1.14.1：入口已冻结] =====

/* v3.7.77 解耦：注册 AppBridge 槽（知识库/笔记弹窗）—— render 块经桥调用，
   不再直接引用本块符号（逆层边消除）。注册在加载时执行，晚于 core 定义、早于任何用户交互。 */
try{ AppBridge.openKnowledgeBaseModal = openKnowledgeBaseModal; }catch(e){}
try{ AppBridge.openNotesModal = openNotesModal; }catch(e){}
