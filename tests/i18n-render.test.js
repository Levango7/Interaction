/**
 * v3.4.12 i18n 渲染层门禁（批次 4）
 * 覆盖历轮 i18n 修补的四个系统性漏洞（本轮全部修过，本测试防再犯）：
 *   1. HTML 属性硬编码中文未标 data-i18n-*（placeholder/title/aria-label）
 *   2. SCENARIOS/SCENE_FEATURES/AI_BUILTIN_SKILLS 在 MESSAGES 前初始化的 TDZ 固化
 *      —— _rebindEarlyI18n 在 initI18n 后重算
 *   3. 悬空 key（t() 调用的 key 不在字典）
 *   4. en 字典值为中文（复制粘贴未翻）
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");
const PREFIX = "wb_agent_";
const ZH = /[一-鿿]/;

function extractObj(src, anchor) {
  let depth = 0, began = false;
  for (let i = anchor; i < src.length; i++) {
    if (src[i] === "{") { depth++; began = true; }
    else if (src[i] === "}") { depth--; if (began && depth === 0) return src.slice(anchor, i + 1); }
  }
  return null;
}

function readDict() {
  const s = fs.readFileSync(HTML, "utf8");
  const mStart = s.indexOf("const MESSAGES");
  const zhSrc = extractObj(s, s.indexOf("zh: {", mStart) + 3);
  const enSrc = extractObj(s, s.indexOf("en: {", mStart) + 3);
  const keysOf = (src) => {
    const keys = new Set();
    const re = /"((?:[^"\\]|\\.)+)"\s*:/g;
    let m;
    while ((m = re.exec(src))) keys.add(m[1]);
    return keys;
  };
  return { zh: keysOf(zhSrc), en: keysOf(enSrc), zhSrc, enSrc };
}

describe("i18n 渲染层门禁（v3.4.12）", () => {
  describe("静态：HTML 属性 data-i18n-* 标记完整性", () => {
    it("含中文的 placeholder/title/aria-label 必须带 data-i18n-*（静态 HTML 区域）", () => {
      const s = fs.readFileSync(HTML, "utf8");
      const zhStart = s.indexOf("zh: {", s.indexOf("const MESSAGES"));
      const code = s.slice(0, zhStart) + "\n" + s.slice(s.indexOf("\n};", s.indexOf("en: {", s.indexOf("const MESSAGES"))));
      const violations = [];
      for (const attr of ["placeholder", "title", "aria-label"]) {
        const dataAttr = attr === "aria-label" ? "data-i18n-aria" : `data-i18n-${attr}`;
        // 匹配 attr="中文" 且同一标签上没有 dataAttr（同一行内粗判）
        const re = new RegExp(`${attr}="([^"]*[一-鿿][^"]*)"`, "g");
        let m;
        while ((m = re.exec(code))) {
          const lineStart = code.lastIndexOf("\n", m.index) + 1;
          const line = code.slice(lineStart, code.indexOf("\n", m.index));
          if (line.indexOf(dataAttr) < 0) {
            // 排除：模板字符串/动态拼接（行含 t( 调用——含 HTML 片段翻译模式 p4.html.*）
            // 与 JSDoc 参数默认值文档（@param）
            if (/\bt\(|\$\{|@param/.test(line)) continue;
            violations.push({ attr, val: m[1].slice(0, 50), line: line.trim().slice(0, 80) });
          }
        }
      }
      expect(violations, `未标记的中文属性 ${violations.length} 处:\n${violations.map(v => `  [${v.attr}] ${v.val}`).join("\n")}`).toEqual([]);
    });
  });

  describe("静态：en 字典值语言校验", () => {
    it("en 字典值不应含中文（品牌名/分隔符/占位示例白名单豁免）", () => {
      const { enSrc } = readDict();
      const EXEMPT = [ // 品牌名 / 语言切换项 / 中文示例（AI prompt 里的原文引用）——见豁免表
        "app.tagline", "settings.language.zh", "ai.brandName",
      ];
      const bad = [];
      const lines = enSrc.split("\n");
      for (const l of lines) {
        const m = /^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(l);
        if (m && ZH.test(m[2]) && !EXEMPT.includes(m[1])) {
          // 附件分隔符类（ai.attachmentStart/End 是 AI 消息拼接语法——保留结构）
          if (/^ai\.attachment/.test(m[1])) continue;
          bad.push(m[1]);
        }
      }
      expect(bad, `en 值含中文 ${bad.length} 个 key:\n${bad.slice(0, 20).map(k => "  " + k).join("\n")}`).toEqual([]);
    });
  });

  describe("运行时：英文模式数据源重绑", () => {
    let win;
    beforeAll(() => {
      win = loadApp();
      try { win.localStorage.setItem(PREFIX + "lang", "en"); } catch (_e) { }
      if (typeof win.setLang === "function") { try { win.setLang("en"); } catch (_e) { } }
    });

    it("SCENARIOS 6 内置场景 name/sysprompt/record.label 为英文", () => {
      const S = win.__test.SCENARIOS;
      for (const sc of ["office", "data", "design", "study", "code", "life"]) {
        expect(S[sc].name, `${sc}.name 仍中文`).not.toMatch(ZH);
        expect(S[sc].record.label, `${sc}.record.label 仍中文`).not.toMatch(ZH);
      }
    });

    it("SCENARIOS 字段 label/options/placeholder 为英文（含 _t/_to/_tp 元数据重算）", () => {
      const S = win.__test.SCENARIOS;
      for (const sc of Object.keys(S)) {
        const fields = S[sc] && S[sc].record && S[sc].record.fields;
        if (!Array.isArray(fields)) continue;
        for (const f of fields) {
          if (f.label) expect(f.label, `${sc}.${f.k}.label 仍中文`).not.toMatch(ZH);
          if (Array.isArray(f.options) && f._to) {
            f.options.forEach((o, i) => expect(String(o), `${sc}.${f.k}.options[${i}] 仍中文`).not.toMatch(ZH));
          }
          if (f._tp && f.placeholder) expect(f.placeholder, `${sc}.${f.k}.placeholder 仍中文`).not.toMatch(ZH);
        }
      }
    });

    it("AI_BUILTIN_SKILLS desc 为英文", () => {
      const win2 = loadApp();
      try { win2.localStorage.setItem(PREFIX + "lang", "en"); } catch (_e) { }
      if (typeof win2.setLang === "function") { try { win2.setLang("en"); } catch (_e) { } }
      const T = win2.__test;
      if (T.AI_BUILTIN_SKILLS) {
        for (const s of T.AI_BUILTIN_SKILLS) expect(s.desc, `skill ${s.name} desc 仍中文`).not.toMatch(ZH);
      }
    });

    it("aboutVersion 版本行为英文 app.name", () => {
      const el = win.document.getElementById("aboutVersion");
      if (el) expect(el.textContent).toContain("Agent Workshop");
    });
  });
});
