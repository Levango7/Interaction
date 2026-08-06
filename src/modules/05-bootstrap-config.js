// ===== Bootstrap (配置常量) =====
/* ---------- 场景配置（单一真相源：A-P2-7 收编 icon / sysprompt / extraCard） ---------- */
const SCENARIOS = {
  office:{ name:"办公", color:"#0067c0",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4h4a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3V6a2 2 0 0 1 2-2zm0 2v1h4V6h-4z"/></svg>',
    sysprompt:"你是一个专业的办公效率助手，帮用户梳理任务、写会议纪要、润色邮件与文档。回答简洁、可执行。",
    extraCard:"report",
    record:{ label:"会议纪要",
      fields:[{k:"title",label:"会议主题",type:"text"},{k:"who",label:"参会人",type:"text"},{k:"note",label:"结论 / 跟进",type:"textarea"}] } },

  code:{ name:"编程", color:"#107c10",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
    sysprompt:"你是一个资深全栈工程师，擅长代码实现、调试与架构建议。给出可直接运行的代码并解释关键点。",
    extraCard:"report",
    record:{ label:"代码片段",
      fields:[{k:"lang",label:"语言",type:"text"},{k:"title",label:"标题",type:"text"},{k:"code",label:"代码",type:"textarea"}] } },

  study:{ name:"学习", color:"#ca5010",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h6v16H6a2 2 0 0 0-2 2V5zm16 0a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2V5z"/></svg>',
    sysprompt:"你是一个学习方法教练，擅长制定学习计划、拆解知识点、记忆与复习策略。",
    extraCard:"review",
    record:{ label:"学习资料",
      fields:[{k:"title",label:"主题",type:"text"},{k:"type",label:"类型",type:"text"},{k:"status",label:"状态",type:"text"},{k:"note",label:"笔记",type:"textarea"}] } },

  life:{ name:"生活", color:"#7b61ff",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    sysprompt:"你是一个生活事务管家，帮用户打理日常待办、购物清单、缴费与提醒、家庭与个人事务。回答实用、贴心、有条理。",
    extraCard:"none",
    record:{ label:"生活备忘",
      fields:[{k:"title",label:"事项",type:"text"},{k:"cat",label:"分类",type:"text"},{k:"note",label:"备注",type:"textarea"}] } }
};
const ORDER = ["office","code","study","life"];

