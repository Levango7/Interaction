/**
 * i18n-completeness.test.js —— 消息字典完整性守护（v3.7.53 新增）
 * ----------------------------------------------------------------------------
 * 源码里写着契约：`MESSAGES = { zh: {...}, en: {...} }`，**两套 key 完全对齐**。
 * 但此前没有任何测试守着它 —— 漏加一条的后果是**静默**的：英文界面回落到中文默认值
 * （`t()` 的兜底），或直接显示 key，用户看到的是"半截翻译"，而门禁全绿。
 *
 * 三条断言：
 *   ① zh / en 的 key 集合必须**完全一致**（多、少都红）
 *   ② 值必须是非空字符串（`"k": ""` 会让界面显示空白）
 *   ③ 源码里 `t("字面量 key")` 用到的 key 必须存在于字典（拼串的 key 无法静态判定，跳过）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/* v3.7.53：字典原本在 src/ui-global-events.js（UI 层）里，被 i18n-hoist 移进了 core。
   这里改成"扫 src/ 找到 `const MESSAGES = {` 所在的那个文件"，字典以后再搬家测试不用再改。 */
const dictFile = readdirSync(join(root, "src")).filter((x) => x.endsWith(".js"))
  .find((x) => readFileSync(join(root, "src", x), "utf8").includes("const MESSAGES = {"));
expect(dictFile, "src/ 下找不到含 `const MESSAGES = {` 的文件").toBeTruthy();
const src = readFileSync(join(root, "src", dictFile), "utf8");

/**
 * 切出 MESSAGES 里某一语言块。
 * ⚠️ 用**结构边界**（`en: {` / 结尾 `};`）而不是大括号计数：字典值里含有花括号
 * （模板占位符、正则片段等），计数法会被带偏，把后面的 JS 代码也当成字典体
 * （实测踩到：误报 `chai` 这种代码里的字符串为空值 key）。
 */
function langBlock(lang) {
  const marker = "\n  " + lang + ": {";
  const start = src.indexOf(marker);
  expect(start, `未找到 MESSAGES.${lang} 块`).toBeGreaterThan(-1);
  const bodyStart = start + marker.length;
  const end = lang === "zh"
    ? src.indexOf("\n  },\n  en: {", bodyStart)
    : src.indexOf("\n  }\n};", bodyStart);
  expect(end, `未找到 MESSAGES.${lang} 块的结束边界`).toBeGreaterThan(bodyStart);
  return src.slice(bodyStart, end);
}
/* 只认「行首（含缩进）的 "key":」—— 否则值里出现的 `":` 会把后面半截误判成 key（实测踩到） */
const keysOf = (body) => new Set([...body.matchAll(/^\s*"([^"\n]+)"\s*:/gm)].map((m) => m[1]));

const zh = langBlock("zh");
const en = langBlock("en");
const zhKeys = keysOf(zh);
const enKeys = keysOf(en);

describe("① zh / en 两套 key 完全对齐", () => {
  it("key 数量一致且互不缺失", () => {
    const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k)).sort();
    const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k)).sort();
    expect(onlyZh, "只缺英文（en）的 key：" + onlyZh.join(", ")).toEqual([]);
    expect(onlyEn, "只缺中文（zh）的 key：" + onlyEn.join(", ")).toEqual([]);
  });
});

describe("② 值不得为空 / 英文侧不得残留中文", () => {
  it("en 字典的值不得含中文（语言名等白名单除外）", () => {
    /* v3.7.53：这是**第三类** i18n 债 —— key 在、值没翻。实测 en 字典里曾有 191 条值本身就是中文
       （上一轮"逐步替换"的遗留），英文界面在这些位置直接显示中文。
       白名单只放行「按设计就该显示中文」的条目（语言名）。 */
    const ALLOW = new Set(["settings.language.zh", "settings.language.label"]);
    /* ⚠️ 值必须用「转义感知」的模式：旧写法 "([^"\n]*)" 会在 `\"` 处截断，
       于是 `<div class=\"msg assistant\">你好，我是` 这种 HTML 片段型条目只被截到 `<div class=`，
       不含中文 → 43 条漏判、门禁长期假绿（v3.7.53 实测）。 */
    const ENTRY = /^\s{4}"([^"\n]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm;
    const offenders = [...en.matchAll(ENTRY)]
      .filter(([, k, v]) => /[\u4e00-\u9fff]/.test(v) && !ALLOW.has(k))
      .map(([, k, v]) => `${k} = ${v.slice(0, 24)}`);
    expect(offenders, "以下 en 条目的值仍是中文（英文界面会显示中文）：" + offenders.slice(0, 12).join(" | ")).toEqual([]);
    /* 模式必须真能解析出条目，否则"0 违规"只是解析失败的假象 */
    expect(offenders.length + [...en.matchAll(ENTRY)].length).toBeGreaterThan(3000);
  });

  it("同一个 key 不得在两种语言里都为空（那会在任何语言下都渲染成空白）", () => {
    /* 单语言为空是**合法**的：例如 alarm.weekPrefix / datepicker.monthSuffix 这类
       「中文需要后缀、英文不需要」的拼接片段，英文侧留空是设计。故只拦"两边都空"。 */
    const emptiesOf = (body) => new Set([...body.matchAll(/^\s*"([^"\n]+)"\s*:\s*""\s*,?\s*$/gm)].map((m) => m[1]));
    const zhEmpty = emptiesOf(zh), enEmpty = emptiesOf(en);
    const both = [...zhEmpty].filter((k) => enEmpty.has(k));
    expect(both, "以下 key 在 zh 与 en 里都是空值（界面会渲染空白）：" + both.join(", ")).toEqual([]);
    /* 单语言空值仅登记数量，防止悄悄变多 */
    expect(zhEmpty.size, "zh 空值条目异常增多：" + [...zhEmpty].join(", ")).toBeLessThanOrEqual(1);
    expect(enEmpty.size, "en 空值条目异常增多：" + [...enEmpty].join(", ")).toBeLessThanOrEqual(4);
  });
});

describe("③ 字典覆盖", () => {
  it("无默认值的 t(\"key\") 必须查得到（否则界面直接显示 key 本身）", () => {
    const offenders = [];
    for (const f of readdirSync(join(root, "src")).filter((x) => x.endsWith(".js"))) {
      const code = readFileSync(join(root, "src", f), "utf8");
      /* 只匹配无第二参数的调用：t("key") */
      for (const m of code.matchAll(/\bt\(\s*"([A-Za-z][\w.]*)"\s*\)/g)) {
        if (!zhKeys.has(m[1])) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect([...new Set(offenders)], "无默认值且字典缺失（界面会显示 key）：" + offenders.join(", ")).toEqual([]);
  });

  it("带默认值的写法：不得再有未进字典的 key（v3.7.53 积压已清零）", () => {
    /* 历史：字典头部曾写明「不修改既有模块的硬编码中文，后续版本逐步替换」——那时 `t("key","中文")`
       里未进字典的 key 属已登记技术债（实测 255 条，英文界面在这些位置显示中文）。
       v3.7.53 已把 255 条**全部补齐**（zh 取调用点默认值、en 逐条翻译），故基线收紧为 0：
       新增字面量 key 请顺手补字典，否则英文界面会显示中文 —— 现在会直接判红。 */
    const used = new Set();
    for (const f of readdirSync(join(root, "src")).filter((x) => x.endsWith(".js"))) {
      const code = readFileSync(join(root, "src", f), "utf8");
      for (const m of code.matchAll(/\bt\(\s*"([A-Za-z][\w.]*)"\s*,/g)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !zhKeys.has(k)).sort();
    expect(missing, "以下 key 有默认值但未进字典（英文界面会显示中文）：" + missing.join(", ")).toEqual([]);
  });
});

describe("④ 加载顺序（v3.7.53 根因锁）", () => {
  /* 这一组断言守的是"字典必须在模块级常量之前"：
     SCENARIOS / SCENE_FEATURES / TOOL_APPS 都写成 name:t("scenario.office","办公")，
     一旦 MESSAGES 或 _currentLang 排在它们之后求值，t() 只会拿到中文兜底，
     英文模式下这些文案被永久冻结成中文（v3.7.52 实测：SCENARIOS 105/219、TOOL_APPS 45/69、
     SCENE_FEATURES 30/111 条）。字典曾被放在最末层的 ui-global-events 里，正是这个 bug。 */
  const dictSrc = src;
  const coreSrc = readFileSync(join(root, "src", "core.js"), "utf8");

  it("MESSAGES 与 _currentLang 必须和消费它们的常量同块、且更早", () => {
    const at = (re) => coreSrc.search(re);
    const dictAt = at(/^const MESSAGES = \{/m);
    expect(dictAt, "core.js 里找不到 const MESSAGES（被搬走了？）").toBeGreaterThan(-1);
    for (const [name, re] of [["SCENARIOS", /^const SCENARIOS = \{/m], ["SCENE_FEATURES", /^const SCENE_FEATURES = \{/m], ["ORDER", /^const ORDER = \[/m]]) {
      const useAt = at(re);
      expect(useAt, `core.js 里找不到 const ${name}`).toBeGreaterThan(-1);
      expect(dictAt, `const MESSAGES 必须排在 ${name} 之前`).toBeLessThan(useAt);
    }
    expect(at(/^let _currentLang/m), "_currentLang 也必须先于这些常量").toBeLessThan(at(/^const SCENARIOS = \{/m));
  });

  it("字典在全部 src 块里只能有一份", () => {
    const owners = readdirSync(join(root, "src")).filter((x) => x.endsWith(".js"))
      .filter((x) => readFileSync(join(root, "src", x), "utf8").includes("const MESSAGES = {"));
    expect(owners, "MESSAGES 出现在多个块里会让两份字典互相覆盖：" + owners.join(", ")).toEqual([dictFile]);
  });

  it("render() 的 i18n 收口必须挂在 finally 上", () => {
    /* 放 try 尾部只能覆盖场景页：overview/stats/recycle/tasks/toolbox/store/chainpage/
       auth×3/timeline 都在到达那行之前就 return 了（实测只有 office 触发）。 */
    const renderSrc = readFileSync(join(root, "src", "render-entry.js"), "utf8");
    const i = renderSrc.indexOf("AppBridge.applyI18n");
    expect(i, "render-entry.js 里找不到 applyI18n 收口调用").toBeGreaterThan(-1);
    expect(renderSrc.slice(0, i), "applyI18n 必须位于 }finally{ 之后").toContain("}finally{");
  });
});
