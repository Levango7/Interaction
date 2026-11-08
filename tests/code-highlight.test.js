/**
 * 代码块语法高亮（2026-11-08，零依赖手写 tokenizer）
 *
 * 契约：
 *  - 已知语言的围栏块产出 tok-k/tok-s/tok-c/tok-n span，且 span 只带固定 class；
 *  - 分词不得改变可见文本（textContent 与原文逐字相等）——复制按钮语义不变；
 *  - 代码内容里的 < > & " ' 必须保持转义（高亮器先还原→分词→逐 token 再转义，
 *    任何一步漏转义都会把代码当 HTML 执行）；
 *  - 未知语言 / 无语言标记 → 原样转义文本，不猜规则；
 *  - mermaid 块不走高亮（renderMermaidBlocks 依赖原始 pre>code 并整块替换）。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function fresh() {
  return loadApp();
}
/** 取围栏块里的 code 元素（mdToHtml 整管道，含代码卡包装） */
function codeElOf(win, lang, src) {
  const html = win.__test.mdToHtml("```" + lang + "\n" + src + "\n```");
  const doc = new win.DOMParser().parseFromString(html, "text/html");
  return { html, code: doc.querySelector(".md-code pre code") };
}

describe("语法高亮 · 各语言 token", () => {
  it("js：关键字/字符串/注释/数字四类齐全，别名 javascript 同效", () => {
    const win = fresh();
    const src = '// note\nconst x = "hi";\nlet n = 42;';
    const { code } = codeElOf(win, "js", src);
    expect(code).not.toBeNull();
    expect(code.querySelector(".tok-c").textContent).toBe("// note");
    expect(code.querySelector(".tok-k").textContent).toBe("const");
    expect(code.querySelector(".tok-s").textContent).toBe('"hi"');
    expect(code.querySelector(".tok-n").textContent).toBe("42");
    expect(code.textContent).toBe(src);
    const alias = codeElOf(win, "javascript", src);
    expect(alias.code.innerHTML).toBe(code.innerHTML);
  });

  it("json：字符串/布尔 null/数字", () => {
    const win = fresh();
    const src = '{"a": true, "b": null, "c": -3.5}';
    const { code } = codeElOf(win, "json", src);
    expect(code.querySelector(".tok-s").textContent).toBe('"a"');
    const ks = Array.from(code.querySelectorAll(".tok-k")).map((n) => n.textContent);
    expect(ks).toEqual(["true", "null"]);
    expect(code.querySelector(".tok-n").textContent).toBe("-3.5");
    expect(code.textContent).toBe(src);
  });

  it("python：# 注释/三引号串/关键字/数字；别名 py 同效", () => {
    const win = fresh();
    const src = '# c\ndef f():\n    """doc"""\n    return 7';
    const { code } = codeElOf(win, "python", src);
    expect(code.querySelector(".tok-c").textContent).toBe("# c");
    expect(code.querySelector(".tok-k").textContent).toBe("def");
    expect(code.querySelector(".tok-s").textContent).toBe('"""doc"""');
    expect(code.querySelector(".tok-n").textContent).toBe("7");
    expect(code.textContent).toBe(src);
    expect(codeElOf(win, "py", src).code.innerHTML).toBe(code.innerHTML);
  });

  it("bash：注释不误伤 ${#var}，变量/关键字着色；别名 sh 同效", () => {
    const win = fresh();
    const src = '# comment\necho ${#arr} $HOME\nfor i in 1 2; do echo $i; done';
    const { code } = codeElOf(win, "bash", src);
    expect(code.querySelector(".tok-c").textContent).toBe("# comment");
    /* ${#arr} 整体是一个 tok-k——注释规则要求 # 前有空白，不得把它截走 */
    const ks = Array.from(code.querySelectorAll(".tok-k")).map((n) => n.textContent);
    expect(ks).toContain("${#arr}");
    expect(ks).toContain("$HOME");
    expect(ks).toContain("for");
    expect(code.textContent).toBe(src);
    expect(codeElOf(win, "sh", src).code.innerHTML).toBe(code.innerHTML);
  });

  it("html：标签名/属性串/注释着色，内容仍是文本", () => {
    const win = fresh();
    const src = '<!-- c -->\n<div class="x">a &amp; b</div>';
    const { code } = codeElOf(win, "html", src);
    expect(code.querySelector(".tok-c").textContent).toBe("<!-- c -->");
    expect(code.querySelector(".tok-s").textContent).toBe('"x"');
    expect(code.querySelector(".tok-k").textContent).toBe("<div");
    expect(code.textContent).toBe(src);
  });

  it("css：属性名/值串/注释/数字单位", () => {
    const win = fresh();
    const src = '/* c */\n.a { color: #fff; width: 10px; content: "x"; }';
    const { code } = codeElOf(win, "css", src);
    expect(code.querySelector(".tok-c").textContent).toBe("/* c */");
    expect(code.querySelector(".tok-k").textContent).toBe("color");
    expect(code.querySelector(".tok-s").textContent).toBe('"x"');
    const ns = Array.from(code.querySelectorAll(".tok-n")).map((n) => n.textContent);
    expect(ns).toContain("#fff");
    expect(ns).toContain("10px");
    expect(code.textContent).toBe(src);
  });

  it("sql：关键字大小写不敏感，-- 注释与单引号串", () => {
    const win = fresh();
    const src = "-- c\nSELECT name FROM t WHERE id = 3 AND s = 'x';";
    const { code } = codeElOf(win, "sql", src);
    expect(code.querySelector(".tok-c").textContent).toBe("-- c");
    expect(code.querySelector(".tok-k").textContent).toBe("SELECT");
    expect(code.querySelector(".tok-s").textContent).toBe("'x'");
    expect(code.querySelector(".tok-n").textContent).toBe("3");
    expect(code.textContent).toBe(src);
  });

  it("yaml：键/注释/布尔/数字", () => {
    const win = fresh();
    const src = "# c\nname: app\nport: 8080\ndebug: true";
    const { code } = codeElOf(win, "yaml", src);
    expect(code.querySelector(".tok-c").textContent).toBe("# c");
    expect(code.querySelector(".tok-k").textContent).toBe("name");
    expect(code.querySelector(".tok-n").textContent).toBe("8080");
    expect(code.textContent).toBe(src);
  });

  it("go/rust/java/c/cpp 共用规则族：func/fn 等着色", () => {
    const win = fresh();
    const src = "func main() { return 1 } // c";
    const { code } = codeElOf(win, "go", src);
    expect(code.querySelector(".tok-k").textContent).toBe("func");
    expect(code.querySelector(".tok-c").textContent).toBe("// c");
    expect(code.textContent).toBe(src);
  });
});

describe("语法高亮 · 安全与保真", () => {
  it("代码里的 <script> 保持转义，不产生可执行元素", () => {
    const win = fresh();
    const src = 'const s = "<script>alert(1)</script>";';
    const { html, code } = codeElOf(win, "js", src);
    expect(html).not.toContain("<script>");
    expect(code.querySelector("script")).toBeNull();
    expect(code.textContent).toBe(src);
    /* 串内的 <script> 必须仍在 tok-s 里且已转义 */
    const strSpan = code.querySelector(".tok-s");
    expect(strSpan.textContent).toBe('"<script>alert(1)</script>"');
    expect(strSpan.innerHTML).toContain("&lt;script&gt;");
  });

  it("html 代码里的标签与 & 不逃逸：textContent 逐字相等", () => {
    const win = fresh();
    const src = '<img src=x onerror="alert(1)"> & <b>"q"</b>';
    const { html, code } = codeElOf(win, "html", src);
    expect(html).not.toContain("<img");
    expect(code.querySelector("img")).toBeNull();
    expect(code.textContent).toBe(src);
  });

  it("引号/反斜杠混合串不破坏分词（转义往返保真）", () => {
    const win = fresh();
    const src = 'const a = "he said \\"hi\\""; const b = \'it\\\'s\'; // & < > " \'';
    const { code } = codeElOf(win, "js", src);
    expect(code.textContent).toBe(src);
    expect(code.querySelector(".tok-c").textContent).toBe('// & < > " \'');
  });

  it("未知语言与无语言标记：原样转义、无 token span", () => {
    const win = fresh();
    const src = 'const x = "<i>&</i>";';
    for (const lang of ["brainfuck", ""]) {
      const { code } = codeElOf(win, lang, src);
      expect(code.querySelectorAll("span")).toHaveLength(0);
      expect(code.textContent).toBe(src);
    }
  });

  it("mermaid 块不套代码卡、不高亮（renderMermaidBlocks 依赖原始结构）", () => {
    const win = fresh();
    const src = "graph TD\n  A --> B";
    const html = win.__test.mdToHtml("```mermaid\n" + src + "\n```");
    expect(html).toContain('<pre><code class="block lang-mermaid">');
    expect(html).not.toContain("md-code");
    expect(html).not.toContain("tok-");
    const doc = new win.DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("code.lang-mermaid").textContent).toBe(src);
  });

  it("空代码块不抛异常", () => {
    const win = fresh();
    const html = win.__test.mdToHtml("```js\n```");
    expect(html).toContain("md-code");
    const doc = new win.DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector(".md-code pre code").textContent).toBe("");
  });

  it("注释优先于关键字：字符串/注释里的关键字不着第二层色", () => {
    const win = fresh();
    const src = '// const return if\nconst s = "return const";';
    const { code } = codeElOf(win, "js", src);
    const comment = code.querySelector(".tok-c");
    expect(comment.textContent).toBe("// const return if");
    expect(comment.querySelector(".tok-k")).toBeNull();
    const str = code.querySelector(".tok-s");
    expect(str.textContent).toBe('"return const"');
    expect(str.querySelector(".tok-k")).toBeNull();
    expect(code.textContent).toBe(src);
  });
});