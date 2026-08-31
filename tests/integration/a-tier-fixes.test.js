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
    // SCENE_FEATURES 顶层 const 不挂 window；用源码契约兜底
    // 锚定 const SCENE_FEATURES={ 起点，data 属性下的 id:"sql" 间距约 966 字符
    expect(S).toMatch(/const SCENE_FEATURES\s*=\s*\{[\s\S]{0,2000}\bdata:\s*\[[\s\S]{0,200}id:"sql"/);
  });
});
