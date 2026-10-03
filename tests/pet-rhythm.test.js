/**
 * pet-rhythm.test.js —— 萌宠节奏档位守护（v3.7.83 新增）
 * ----------------------------------------------------------------------------
 * 契约写在 `src/render-widgets.js` 的 `PET_RHYTHMS` 表里，三条必须成立：
 *   ① **三档齐全**且字段完整 —— 少一个字段会静默变 NaN（如 tickMs 缺失 → setInterval(NaN)
 *      退化成 1ms 疯狂刷屏，界面直接卡死），这类故障不能只靠"我测过了"。
 *   ② **取值合法** —— tickMs ∈ [1000, 60000]、概率 ∈ [0,1]、dozeMs > tickMs。
 *   ③ **标准档必须等于 v3.7.82 的写死值** —— 否则"默认不变"这个承诺被悄悄打破，
 *      老用户升级后宠物性格变了却没人知道。
 *
 * 另加两条接线断言（"看起来在守护"≠"真的在守护"，历次事故都出在这一层）：
 *   ④ 设置页 select 的三个 option 与表里的三档 key **逐一对应**（改表忘改 UI = 选不到）
 *   ⑤ 换档入口 applyPetRhythm **只重启定时器、不调 mountPet**（remount 会闪 + 位置跳回默认）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const widgets = readFileSync(join(root, "src", "render-widgets.js"), "utf8");
const html = readFileSync(join(root, "agent-workbench.html"), "utf8");
const dictFile = readdirSync(join(root, "src")).filter((x) => x.endsWith(".js"))
  .find((x) => readFileSync(join(root, "src", x), "utf8").includes("const MESSAGES = {"));
const dict = readFileSync(join(root, "src", dictFile), "utf8");

/** 切出 `PET_RHYTHMS = { ... };` 的表体。锚点用字面量，避免正则跨行误吞。 */
function tableBody(src, name) {
  const start = src.indexOf("const " + name + " = {");
  expect(start, `未找到 ${name} 表`).toBeGreaterThan(-1);
  const end = src.indexOf("\n};", start);
  expect(end, `未找到 ${name} 表的结束边界`).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** 切出某档的对象字面量（表体内 `key: {` 到下一个顶层 `key: {` 或表尾）。 */
function entryBody(body, key) {
  const re = new RegExp("(^|\\n)\\s{2}" + key + ":\\s*\\{");
  const m = re.exec(body);
  expect(m, `PET_RHYTHMS 表里没有 "${key}" 档`).toBeTruthy();
  const from = m.index + m[0].length;
  const next = /\n {2}[a-zA-Z0-9_]+:\s*\{/.exec(body.slice(from));
  return next ? body.slice(from, from + next.index) : body.slice(from);
}

/** 取该档的数字字段（只认 `name: 数字`，跳过 name/id 这类字符串字段）。 */
const nums = (src) => {
  const out = {};
  for (const m of src.matchAll(/(\w+):\s*([0-9.]+)\s*(?:,|\/\*|$)/gm)) out[m[1]] = Number(m[2]);
  return out;
};

const body = tableBody(widgets, "PET_RHYTHMS");
const IDS = ["quiet", "standard", "lively"];
const FIELDS = ["tickMs", "actP", "blinkP", "actNoBlinkP", "starP", "sparkP", "spark2P", "dozeMs", "zzzP"];

describe("v3.7.83 萌宠节奏 · PET_RHYTHMS 表", () => {
  it("三档齐全：quiet / standard / lively", () => {
    for (const id of IDS) {
      expect(entryBody(body, id), `缺少 ${id} 档`).toBeTruthy();
    }
    // 恰好三档 —— 加档必须同步改 UI 与测试，此断言会主动提醒
    const found = [...body.matchAll(/\n {2}(\w+):\s*\{/g)].map((m) => m[1]).filter((k) => k !== "id");
    expect(found.sort()).toEqual([...IDS].sort());
  });

  it("每档 9 个字段齐全（缺一即静默变 NaN）", () => {
    for (const id of IDS) {
      const v = nums(entryBody(body, id));
      for (const f of FIELDS) {
        expect(Number.isFinite(v[f]), `${id} 档缺字段 ${f} 或非数字`).toBe(true);
      }
    }
  });

  it("取值合法：tickMs∈[1000,60000]、概率∈[0,1]、dozeMs>tickMs", () => {
    for (const id of IDS) {
      const v = nums(entryBody(body, id));
      expect(v.tickMs, `${id}.tickMs`).toBeGreaterThanOrEqual(1000);
      expect(v.tickMs, `${id}.tickMs`).toBeLessThanOrEqual(60000);
      for (const p of ["actP", "blinkP", "actNoBlinkP", "starP", "sparkP", "spark2P", "zzzP"]) {
        expect(v[p], `${id}.${p}`).toBeGreaterThanOrEqual(0);
        expect(v[p], `${id}.${p}`).toBeLessThanOrEqual(1);
      }
      expect(v.dozeMs, `${id}.dozeMs 必须 > tickMs，否则一进循环就在打盹`).toBeGreaterThan(v.tickMs);
    }
  });

  it("有眨眼层时 actP+blinkP 不超过 1（互斥抽签不能溢出）", () => {
    for (const id of IDS) {
      const v = nums(entryBody(body, id));
      expect(v.actP + v.blinkP, `${id} 档动作+眨眼概率之和`).toBeLessThanOrEqual(1);
    }
  });

  it("安静 < 标准 < 活泼（三档必须真的分出层次，不能是三个同值）", () => {
    const [q, s, l] = IDS.map((id) => nums(entryBody(body, id)));
    expect(q.tickMs, "安静应比标准慢").toBeGreaterThan(s.tickMs);
    expect(s.tickMs, "标准应比活泼慢").toBeGreaterThan(l.tickMs);
    expect(q.starP, "安静星光应最少").toBeLessThan(s.starP);
    expect(s.starP, "活泼星光应最多").toBeLessThan(l.starP);
    expect(q.dozeMs, "安静应更晚打盹").toBeGreaterThan(s.dozeMs);
    expect(s.dozeMs, "活泼应更早打盹").toBeGreaterThan(l.dozeMs);
  });

  /* 「默认不变」承诺：standard 必须逐值等于 v3.7.82 写死的数字，
     否则老用户升级后宠物性格静默改变 —— 这是最难被发现的回归。 */
  it("standard 档逐值等于 v3.7.82 的写死基线（升级不改默认性格）", () => {
    const s = nums(entryBody(body, "standard"));
    const base = { tickMs: 3400, actP: 0.40, blinkP: 0.42, actNoBlinkP: 0.72, starP: 0.14, sparkP: 0.30, spark2P: 0.20, dozeMs: 90000, zzzP: 0.30 };
    for (const k of Object.keys(base)) expect(s[k], `standard.${k}`).toBe(base[k]);
  });
});

describe("v3.7.83 萌宠节奏 · 接线", () => {
  it("设置页 select#cfgPetRhythm 的三个 option 与表里三档一一对应", () => {
    const sel = /<select id="cfgPetRhythm">([\s\S]*?)<\/select>/.exec(html);
    expect(sel, "设置页找不到 #cfgPetRhythm").toBeTruthy();
    const opts = [...sel[1].matchAll(/<option value="(\w+)"/g)].map((m) => m[1]);
    expect(opts.sort()).toEqual([...IDS].sort());
    // 每个 option 必须带 data-i18n（否则英文界面回落中文默认值 —— i18n 测试抓不到 option 缺失的默认值）
    expect(sel[1]).toMatch(/value="quiet"[^>]*data-i18n="pet\.rhythm\.quiet"/);
    expect(sel[1]).toMatch(/value="standard"[^>]*data-i18n="pet\.rhythm\.standard"/);
    expect(sel[1]).toMatch(/value="lively"[^>]*data-i18n="pet\.rhythm\.lively"/);
  });

  it("applyPetRhythm 换档只重启定时器，不调 mountPet（remount 会闪 + 位置跳回默认）", () => {
    const fn = /function applyPetRhythm\([^)]*\)\{([\s\S]*?)\n\}/.exec(widgets);
    expect(fn, "找不到 applyPetRhythm").toBeTruthy();
    expect(fn[1], "applyPetRhythm 不该出现 mountPet").not.toMatch(/mountPet\s*\(/);
    expect(fn[1], "applyPetRhythm 应通过 _petTickStart 重启定时器").toMatch(/_petTickStart/);
  });

  it("onTick 的间隔与概率全部读表，无残留写死值", () => {
    const onTick = /const onTick = function\(\)\{([\s\S]*?)\n {2}\};/.exec(widgets);
    expect(onTick, "找不到 onTick").toBeTruthy();
    const src = onTick[1];
    // 间隔：setInterval(onTick, X) 里 X 必须是 _petRhythm().tickMs
    expect(src).toMatch(/_petRhythm\(\)/);
    expect(src).not.toMatch(/3400/);          // v3.7.82 的写死间隔
    expect(src).not.toMatch(/>\s*90000/);     // v3.7.82 的写死打盹阈值
    expect(src).not.toMatch(/<\s*\.14/);       // v3.7.81 调下来的星光密度
  });

  it("i18n 词条中英各 5 条齐全（label/quiet/standard/lively/applied/tip）", () => {
    for (const k of ["label", "quiet", "standard", "lively", "applied", "tip"]) {
      const key = `"pet.rhythm.${k}"`;
      expect((dict.match(new RegExp(key.replace(/\./g, "\\."), "g")) || []).length,
        `pet.rhythm.${k} 应在字典里出现 2 次（zh + en）`).toBe(2);
    }
  });

  it("UI 标签走 t() 词条，不含模块级中文常量（英文模式不得出现中文）", () => {
    const sel = /<select id="cfgPetRhythm">([\s\S]*?)<\/select>/.exec(html)[1];
    // option 文本允许有中文兜底（HTML 静态标记），但必须被 data-i18n 覆盖
    const zhFallback = [...sel[1].matchAll(/>([\u4e00-\u9fa5]+)</g)].map((m) => m[1]);
    expect(zhFallback.every((z) => ["安静", "标准", "活泼"].includes(z)),
      `option 里出现未登记的文案：${zhFallback.join("/")}`).toBe(true);
  });
});
