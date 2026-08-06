// ===== Data Layer (数据层·联动规则与全局状态) =====
/* ---------- 场景联动规则（任务完成时触发，跨场景生成任务） ---------- */
const DEFAULT_LINKS = [
  {id:"l1", name:"交付完成 → 学习充电", fromSc:"office", kw:"交付", toSc:"study",  taskTitle:"奖励：看一集技术分享视频", priority:"P2", enabled:true},
  {id:"l2", name:"复习完成 → 编程实践", fromSc:"study",  kw:"复习", toSc:"code",  taskTitle:"奖励：写个有趣的小项目 30 分钟", priority:"P2", enabled:true},
  {id:"l3", name:"项目上线 → 生活犒劳", fromSc:"code",   kw:"上线", toSc:"life",  taskTitle:"犒劳：吃顿好的 / 看部想看的片",     priority:"P2", enabled:true}
];

