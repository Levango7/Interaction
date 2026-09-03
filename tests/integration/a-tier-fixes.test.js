// v3.1.2 A 档回归：SM-2 提醒、SQL 进 data、数据值字段、搜索全字段、健康卡快捷录入、
// code lang/project、frontend 预览、AI 测试连接、技能白名单同步、help 页章节、budget 真数据
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "../helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "..", "agent-workbench.html");
const SRC = fs.readFileSync(HTML, "utf8");
const S = SRC.replace(/^\ufeff/, ""); // v3.1.2 A 档回归：去除 UTF-8 BOM（HTML 文件以 BOM 起始，正则 ^ 锚点不能跳过它）

describe("v3.1.2 A 档：源码契约（防回归）", () => {
  it("SM-2 到期提醒接 runNotifyCheck（scheduler 调度）", () => {
    expect(S).toMatch(/runNotifyCheck[\s\S]{0,4000}notify\.sm2Due|sm2:\s*r\.id/);
  });
  it("SCENE_FEATURES.data 含 sql tab", () => {
    expect(S).toMatch(/data:\s*\[[\s\S]{0,1500}\{\s*id:"sql"/);
  });
  it("数据场景 record.fields 含 value 字段", () => {
    // 锚定 record:{ 开头（record 在 data 之前）；record→fields→value 间距约 1800 字符
    expect(S).toMatch(/record:\s*\{[\s\S]{0,3000}k:"value"/);
  });
  it("dataCard 含趋势渲染（指标聚合成序列）", () => {
    expect(S).toMatch(/metricSeries[\s\S]{0,2000}renderMiniChart/);
  });
  it("searchAll records 全字段匹配（RECSYS 排除系统字段）", () => {
    expect(S).toMatch(/records[\s\S]{0,2500}RECSYS\s*=\s*\["_sc","id","created","deletedAt"/);
  });
  it("searchAll 工具数据纳入 features 搜索（tool_* 键）", () => {
    expect(S).toMatch(/TOOL_APPS[\s\S]{0,2000}tool_/);
  });
  it("renderGlob 资料检索放宽（f.sc 可聚焦）", () => {
    expect(S).toMatch(/scList\s*=\s*f\.sc\s*\?\s*\[f\.sc\]\s*:\s*ORDER/);
  });
  it("bindHealthCard 兑现喝水 +1 按钮", () => {
    expect(S).toContain("healthWaterPlus");
    expect(S).toContain("喝水记录");
  });
  it("bindHealthCard 兑现体重快捷录入", () => {
    expect(S).toContain("healthWeightQuick");
    expect(S).toContain("healthWeightInput");
  });
  it("code 场景 lang 改 select + project 字段", () => {
    expect(S).toMatch(/代码片段[\s\S]{0,2000}\{\s*k:"lang",[\s\S]{0,100}type:"select"[\s\S]{0,1500}k:"project"/);
  });
  it("frontend 预览 rowAfter + bindCodeFrontendCard 函数存在", () => {
    expect(S).toContain("function bindCodeFrontendCard");
    expect(S).toMatch(/data-f-preview[\s\S]{0,2000}sandbox/);
  });
  it("AI 测试连接按钮 id=cfgTestConn + 实现函数", () => {
    expect(S).toContain('id="cfgTestConn"');
    expect(S).toMatch(/#cfgTestConn.*onclick[\s\S]{0,6000}max_tokens:\s*1/);
  });
  it("aiSkillsSave 写 cfgToolWhitelist（与 Agent 卡共享）", () => {
    expect(S).toMatch(/aiSkillsSave[\s\S]{0,4000}cfg\.toolWhitelist\s*=/);
  });
  it("帮助页含「故障排查」章节", () => {
    expect(S).toMatch(/helpSection\("故障排查"/);
  });
  it("帮助页含「集成与扩展」+「AI 进阶」", () => {
    expect(S).toMatch(/helpSection\("集成与扩展"/);
    expect(S).toMatch(/helpSection\("AI 进阶"/);
  });
  it("帮助页已删「快照频率可调」虚假声明", () => {
    expect(S).not.toContain("可看到快照频率可调");
  });
  it("budget 插件 render 接真数据（life_bills + life_shopping）", () => {
    expect(S).toMatch(/budget-summary[\s\S]{0,3000}life_bills[\s\S]{0,500}life_shopping/);
  });
});

describe("v3.2 A 1/2/3：白领工作日 0 风险小修（v2 报告）", () => {
  it("A 1/3：报销 sum 按分类聚合本月（白领最常问本月餐饮花了多少）", () => {
    // 找 office_expenses 的 sum 函数块，验证包含 byCat 聚合 + 本月过滤 + 取前 2
    const sumMatch = S.match(/office\s*=\s*\{[\s\S]*?expense:\s*function\(\)\{[\s\S]*?sum:function\(recs\)\{[\s\S]*?\}\s*,[\s\S]*?\}\s*\}/);
    expect(sumMatch, "office.expense.sum 函数应存在").toBeTruthy();
    expect(sumMatch[0]).toContain("byCat");
    expect(sumMatch[0]).toContain("slice(0, 2)"); // v3.2 A 1/3：取前 2 分类不挤
  });
  it("A 2/3：考勤 sum 含当月出勤天数 + 当月工时", () => {
    const sumMatch = S.match(/attendance:\s*function\(\)\{[\s\S]*?sum:function\(recs\)\{[\s\S]*?\}\s*,[\s\S]*?\}\s*\}/);
    expect(sumMatch, "attendance.sum 函数应存在").toBeTruthy();
    expect(sumMatch[0]).toContain("monthDays");
    expect(sumMatch[0]).toContain("monthHours");
  });
  it("A 3/3：缴费卡 afterList 渲染近 7 天到期列表（v3.3.0 起由 rowAfter 改挂每卡钩子 afterList）", () => {
    const billMatch = S.match(/bill:\s*function\(\)\{[\s\S]*?afterList:function\(recs\)\{[\s\S]*?upcoming-bills/);
    expect(billMatch, "bill.afterList 应渲染 upcoming-bills").toBeTruthy();
    expect(billMatch[0]).toContain("已缴"); // 已缴折叠
    expect(billMatch[0]).not.toMatch(/Notification|notifySystem/); // 不推送通知
  });
});

describe("v3.1.2 A 档：运行时行为", () => {
  let win, __test;
  beforeAll(() => { win = loadApp(); __test = win.__test; });

  it("saveRec/getRec round-trip（健康卡写入路径等价）", () => {
    // saveRec 没有独立函数（实现是直接 save(PREFIX+"rec_"+sc, …)），用底层 key 模拟
    const PREFIX = "wb_agent_";
    const recs = __test.getRec("life");
    recs.unshift({ id: "test-uid-1", type: "喝水记录", title: "喝水", value: "1 杯", note: "", created: Date.now() });
    win.localStorage.setItem(PREFIX + "rec_life", JSON.stringify(recs));
    const back = __test.getRec("life");
    expect(back[0].type).toBe("喝水记录");
    expect(back[0].value).toBe("1 杯");
    // 清理
    win.localStorage.setItem(PREFIX + "rec_life", JSON.stringify(back.filter(function(r){ return r.id !== "test-uid-1"; })));
  });

  it("data 场景可见 sql tab（与 code 同一控件）", () => {
    // SCENE_FEATURES 顶层 const 不挂 window；字面量断言最可靠（正则跨 1000+ 字符曾被 BOM/边界坑）
    expect(S).toContain('id:"sql"');
    // 且在 data 场景数组内（office/study 之后、design 之前出现即可确认归属）
    const sfStart = S.indexOf("const SCENE_FEATURES");
    const dataStart = S.indexOf("data: [", sfStart);
    const sqlPos = S.indexOf('id:"sql"', sfStart);
    expect(sfStart).toBeGreaterThan(-1);
    expect(dataStart).toBeGreaterThan(sfStart);
    expect(sqlPos).toBeGreaterThan(dataStart);
    expect(sqlPos - dataStart).toBeLessThan(1000); // data:[ 到 id:"sql" 应很近
  });
});

describe("v3.3.0 B 档：源码契约（防回归）", () => {
  it("_featureCardHtml 双钩子契约：rowAfter(r) 每行单记录、afterList(recs) 每卡全量", () => {
    expect(S).toContain("cfg.rowAfter(r)");
    expect(S).toContain("cfg.afterList(records)");
    expect(S).toContain("hint + list + afterListHtml");
  });
  it("B1：项目卡 afterList 聚合 project: 标签任务进度", () => {
    const projMatch = S.match(/project:\s*function\(\)\{[\s\S]{0,2600}?afterList:function/);
    expect(projMatch, "project.afterList 应存在").toBeTruthy();
    expect(S).toContain("proj-view-head");
    expect(S).toContain('t("proj.view.head"');
  });
  it("B2：会议行动项沿用 v3.1.2 既有实现（蓝图 B2 不重复落地）", () => {
    expect(S).toContain("data-meeting-action");
    expect(S).toContain('t("meeting.genTasks"');
  });
  it("B4：主页速览 4 卡（今日待办/本周会议/本月缴费/本周运动）", () => {
    expect(S).toContain("overview-4cards");
    expect(S).toContain('t("ov4.today"');
    expect(S).toContain('load(PREFIX + "meetings"');
    expect(S).toContain('load(PREFIX + "life_bills"');
    expect(S).toContain('r.type !== "运动记录"');
  });
});
