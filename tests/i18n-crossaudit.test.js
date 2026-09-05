/**
 * i18n 调用面 vs 字典交叉门禁（v3.4.6）
 * 背景：历轮 i18n 修补"扫中文→包 t()"，但从不校验 t() 的 key 是否真的进了字典——
 * 222+16 个 key 长期存在于调用面而字典缺失，英文模式全部回退中文 fallback（漏网之鱼根源）。
 * 本门禁扫描所有 t()/data-i18n 调用 key，与 MESSAGES.zh 交叉——缺一个即 FAIL。
 * 已知误报（querySelector 等非 i18n 调用被正则扫到）维护在豁免清单里。
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");

// 形如 namespace.word 的合法 i18n key（至少一段点分；排除选择器/URL/纯单词）
const PLAUSIBLE = /^[a-zA-Z][\w-]*(\.[\w-]+)+$/;

// 已确认的非 i18n 调用误报（querySelector/动态前缀等）
const EXEMPT = new Set(["tool.cat.", "store.cat.", "life.bills.", "health.weight.", "health.water."]);

function extractAll() {
  const s = fs.readFileSync(HTML, "utf8");
  const mStart = s.indexOf("const MESSAGES");
  function extractObj(start) {
    let depth = 0, began = false;
    for (let i = start; i < s.length; i++) {
      if (s[i] === "{") { depth++; began = true; }
      else if (s[i] === "}") { depth--; if (began && depth === 0) return s.slice(start, i + 1); }
    }
    return null;
  }
  const zhSrc = extractObj(s.indexOf("zh: {", mStart) + 3);
  const enSrc = extractObj(s.indexOf("en: {", mStart) + 3);
  const keysOf = (src) => {
    const keys = new Set();
    const re = /"((?:[^"\\]|\\.)+)"\s*:/g;
    let m;
    while ((m = re.exec(src))) keys.add(m[1]);
    return keys;
  };
  // 调用面：字典区以外的代码
  const zhAnchor = s.indexOf("zh: {", mStart);
  const enEnd = s.indexOf("};", s.indexOf("en: {", mStart));
  const code = s.slice(0, zhAnchor) + "\n" + s.slice(enEnd);
  const called = new Map();
  const patterns = [
    /t\(\s*"((?:[^"\\]|\\.)+)"/g,
    /t\(\s*'((?:[^'\\]|\\.)+)'/g,
    /data-i18n(?:-aria|-placeholder|-title)?\s*=\s*"((?:[^"\\]|\\.)+)"/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code))) {
      const k = m[1];
      if (!PLAUSIBLE.test(k) || EXEMPT.has(k)) continue;
      called.set(k, (called.get(k) || 0) + 1);
    }
  }
  return { zh: keysOf(zhSrc), en: keysOf(enSrc), called };
}

describe("i18n 调用面 vs 字典交叉门禁", () => {
  let zh, en, called;
  beforeAll(() => {
    const r = extractAll();
    zh = r.zh; en = r.en; called = r.called;
  });

  it("zh/en 字典 key 数一致（对称性）", () => {
    const missEn = [...zh].filter((k) => !en.has(k));
    const missZh = [...en].filter((k) => !zh.has(k));
    expect(missEn, `en 缺 ${missEn.length} 个: ${missEn.slice(0, 10).join(", ")}`).toEqual([]);
    expect(missZh, `zh 缺 ${missZh.length} 个: ${missZh.slice(0, 10).join(", ")}`).toEqual([]);
  });

  it("所有 t()/data-i18n 调用 key 都存在于 zh 字典（缺失即英文模式冒中文）", () => {
    const missing = [...called.keys()].filter((k) => !zh.has(k));
    expect(missing, `调用面 ${missing.length} 个 key 不在字典（英文模式将回退中文）:\n${missing.map((k) => "  " + k + " (×" + called.get(k) + ")").join("\n")}`).toEqual([]);
  });
});
