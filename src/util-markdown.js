// ===== Util Layer (Markdown 解析·T3.5) =====
/**
 * 安全 URL 协议过滤：仅允许 http/https/mailto 与无协议（相对路径/锚点），
 * 拒绝 javascript:/data:/vbscript: 等可执行协议。输入为已 escapeHtml 的 url。
 * @param {string} url - 已转义的 url 字符串
 * @returns {string} 安全则原样返回，否则返回空串
 */
function safeUrl(url){
  const decoded = String(url).replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'");
  const trimmed = decoded.trim().toLowerCase();
  const protoMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/);
  if(protoMatch){
    const proto = protoMatch[1];
    if(proto==="http"||proto==="https"||proto==="mailto") return url;
    return "";
  }
  return url;
}
/**
 * 行内 Markdown 解析：行内代码 / 链接 / 粗体 / 斜体。
 * 输入必须已被 escapeHtml，故 < > & " 已转义，不会产生 XSS。
 * @param {string} s - 已转义的行内文本
 * @returns {string} 解析后的行内 HTML
 */
function inlineMd(s){
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => {
    const placeholder = "\uE000IC"+codes.length+"\uE000";
    codes.push("<code>"+c+"</code>");
    return placeholder;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
    const safe = safeUrl(url);
    if(!safe) return text;
    return '<a href="'+safe+'" target="_blank" rel="noopener noreferrer">'+text+'</a>';
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/\uE000IC(\d+)\uE000/g, (m, idx) => codes[+idx]);
  return s;
}
/** 表格行切分（输入已过 esc）：支持 `\|` 字面竖线；去掉首尾管道 */
function _mdSplitRow(line){
  const s = String(line).trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cur = "", escp = false;
  for(let k = 0; k < s.length; k++){
    const ch = s[k];
    if(escp){ cur += ch === "|" ? "|" : "\\" + ch; escp = false; continue; }
    if(ch === "\\"){ escp = true; continue; }
    if(ch === "|"){ cells.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if(escp) cur += "\\";
  cells.push(cur.trim());
  return cells;
}
/**
 * 简单 Markdown 解析器（手写，无外部依赖）。
 * 支持：标题(#/##/###)、粗体(**)、斜体(*)、行内代码(`)、代码块(```)、
 * 无序列表(-/*)、有序列表(1.)、链接([text](url))、表格（含对齐）、引用块(>)、
 * 换行（双换行=段落，单换行=<br>）。
 * XSS 防护：先 escapeHtml 再解析 Markdown，代码块内容原样显示不解析。
 * @param {string} str - 原始 Markdown 文本
 * @returns {string} 解析后的 HTML 字符串
 */
function mdToHtml(str){
  if(str===null||str===undefined) return "";
  str = String(str);
  if(str==="") return "";
  const s = esc(str);
  const lines = s.split(/\r?\n/);
  /** @type {Array<{type:string, html?:string, lines?:string[]}>} */
  const blocks = [];
  let paraLines = [];
  function flushPara(){
    if(paraLines.length){
      blocks.push({type:"para", lines: paraLines});
      paraLines = [];
    }
  }
  let i = 0;
  while(i < lines.length){
    const line = lines[i];
    const fence = line.match(/^```(.*)$/);
    if(fence){
      flushPara();
      const lang = fence[1] ? fence[1].trim() : "";
      const buf = [];
      i++;
      while(i < lines.length && !/^```/.test(lines[i])){
        buf.push(lines[i]); i++;
      }
      i++;
      blocks.push({type:"block", html:'<pre><code class="block'+(lang?" lang-"+lang:"")+'">'+buf.join("\n")+'</code></pre>'});
      continue;
    }
    /* 表格：当前行含 |，下一行是分隔行（--- / :---: / ---:）。必须在段落之前判。 */
    if(line.indexOf("|") >= 0 && i + 1 < lines.length
       && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])){
      flushPara();
      const header = _mdSplitRow(line);
      const aligns = _mdSplitRow(lines[i + 1]).map(function(c){
        if(/^:-+:$/.test(c)) return "center";
        if(/^-+:$/.test(c)) return "right";
        return "left";
      });
      i += 2;
      const rows = [];
      while(i < lines.length && lines[i].indexOf("|") >= 0 && lines[i].trim() !== ""){
        rows.push(_mdSplitRow(lines[i])); i++;
      }
      const pad = function(cells){
        const out = cells.slice(0, header.length);
        while(out.length < header.length) out.push("");
        return out;
      };
      const th = header.map(function(c, idx){
        return '<th class="md-' + (aligns[idx] || "left") + '">' + inlineMd(c) + "</th>";
      }).join("");
      const tb = rows.map(function(r){
        return "<tr>" + pad(r).map(function(c, idx){
          return '<td class="md-' + (aligns[idx] || "left") + '">' + inlineMd(c) + "</td>";
        }).join("") + "</tr>";
      }).join("");
      blocks.push({type:"block", html:'<div class="md-table-wrap"><table><thead><tr>' + th + "</tr></thead>"
        + (tb ? "<tbody>" + tb + "</tbody>" : "") + "</table></div>"});
      continue;
    }
    /* 引用块：esc 之后 `>` 变成 `&gt;`，两种都认；连续行合并为一段 */
    const bq = line.match(/^(?:&gt;|>)\s?(.*)$/);
    if(bq){
      flushPara();
      const quoted = [];
      while(i < lines.length){
        const m = lines[i].match(/^(?:&gt;|>)\s?(.*)$/);
        if(!m) break;
        quoted.push(inlineMd(m[1]));
        i++;
      }
      blocks.push({type:"block", html:"<blockquote>" + quoted.join("<br>") + "</blockquote>"});
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if(h){
      flushPara();
      const level = h[1].length;
      blocks.push({type:"block", html:"<h"+level+">"+inlineMd(h[2])+"</h"+level+">"});
      i++; continue;
    }
    if(/^[-*]\s+/.test(line)){
      flushPara();
      const items = [];
      while(i < lines.length && /^[-*]\s+/.test(lines[i])){
        items.push("<li>"+inlineMd(lines[i].replace(/^[-*]\s+/,""))+"</li>");
        i++;
      }
      blocks.push({type:"block", html:"<ul>"+items.join("")+"</ul>"});
      continue;
    }
    if(/^\d+\.\s+/.test(line)){
      flushPara();
      const items = [];
      while(i < lines.length && /^\d+\.\s+/.test(lines[i])){
        items.push("<li>"+inlineMd(lines[i].replace(/^\d+\.\s+/,""))+"</li>");
        i++;
      }
      blocks.push({type:"block", html:"<ol>"+items.join("")+"</ol>"});
      continue;
    }
    if(line.trim()===""){
      flushPara();
      i++; continue;
    }
    paraLines.push(line);
    i++;
  }
  flushPara();
  return blocks.map(b => b.type==="block" ? b.html : "<p>"+b.lines.map(inlineMd).join("<br>")+"</p>").join("");
}
/**
 * 轻量 HTML 消毒器（零依赖）。
 * 移除危险标签和属性，保留安全 HTML。
 * @param {string} html - 原始 HTML 字符串
 * @returns {string} 消毒后的安全 HTML
 */
/* emoji→矢量统一入口：模板字符串/innerHTML 用 ${ic("name")} 注入 */
function ic(name){ const v=(UI_ICONS&&UI_ICONS[name])||""; return v?'<span class="ic-inline">'+v+"</span>":""; }
// SECURITY NOTE [M2]: 自实现 sanitizeHtml，零依赖轻量消毒。已知限制：
// 仅 URL 属性（href/src/xlink:href）做实体解码后判协议，其余上下文不做实体二次解析，
// 可能遗漏嵌套注入。生产环境如需更强保障可引 DOMPurify。
// v3.1.1 [S1]：href/src 协议判断前增加实体解码（_isDangerousUrlValue）——修复
// 协议名被 HTML 实体编码（十进制/十六进制/命名字符引用）的绕过，浏览器渲染时会解码执行。
function _decodeUrlEntities(v){
  // 解码 URL 属性值中的 HTML 实体：十六进制字符引用 / 十进制字符引用 / 与协议判断相关的命名实体
  return String(v)
    .replace(/&#x([0-9a-f]+);?/gi, function(_, h){ try{ return String.fromCodePoint(parseInt(h, 16)); }catch(e){ return ""; } })
    .replace(/&#(\d+);?/g, function(_, d){ try{ return String.fromCodePoint(parseInt(d, 10)); }catch(e){ return ""; } })
    .replace(/&(tab|newline|colon|semi|sol|bsol|num|percnt|quest|excl|amp|lt|gt|quot|apos|lpar|rpar);?/gi, function(_, n){
      const map = { tab:"\t", newline:"\n", colon:":", semi:";", sol:"/", bsol:"\\", num:"#", percnt:"%", quest:"?", excl:"!", amp:"&", lt:"<", gt:">", quot:'"', apos:"'", lpar:"(", rpar:")" };
      const k = map[n.toLowerCase()];
      return k === undefined ? "" : k;
    });
}
function _isDangerousUrlValue(raw){
  // 浏览器解析 URL 时会忽略 ASCII 控制字符/空白（\t \r \n \0 等），故解码后先剥离再判协议
  // eslint-disable-next-line no-control-regex -- 有意匹配 ASCII 控制字符区间：URL 消毒必须显式剥离它们
  const v = _decodeUrlEntities(raw).replace(/[\u0000-\u0020]+/g, "");
  return /^(javascript|vbscript|data):/i.test(v);
}
/**
 * 消毒 `style` 属性的**值**（v3.7.90 新增）。
 *
 * 背景：本消毒器此前只处理标签、`on*` 事件与 URL 类属性，**不看 style 的值**。
 * 而全仓有约 25 处把动态值直接拼进内联 style（形如把 `s.color` 写进 style 的 color 值），
 * 其中 `s.color` 来自场景定义 —— 自定义场景 / 插件 JSON / **导入的备份与云快照**都能写入任意值。
 * 于是可注入 CSS。危害不是执行 JS（现代浏览器 CSS 里做不到），而是：
 *   · `url(...)` → 渲染即向外部发起请求（信标/追踪，且能证明"某条数据被渲染过"）；
 *   · `@import` / `behavior:` / `-moz-binding` → 加载外部样式或历史 JS 绑定；
 *   · `position:fixed|absolute` + `inset` + `z-index` → 造出全屏覆盖层做界面伪装（钓鱼）。
 *
 * **刻意不拦 `top/left/right/bottom`**：全仓有合法内联用法
 *   （`render-widgets.js:526` 画布卡片 `style="left:${it.x}px;top:${it.y}px;…"`、
 *    `render-scene-main.js:47` 虚拟滚动 `style="top:${range.offsetY}px"`）。
 *   而 `\btop\s*:` 这种写法还会误伤 `margin-top:` / `border-top:` —— 一并避免。
 *   只拦 position/inset/z-index 三者，已足以阻断「从未定位元素造出全屏覆盖层」这条路
 *   （z-index 对未定位元素无效）。
 * 实测（2026-10-05）：src 与 HTML 骨架的内联 style 里 position / inset / z-index **零命中**，
 * 故无副作用。
 * @param {string} v
 * @returns {string}
 */
function _sanitizeStyleValue(v){
  let out = String(v == null ? "" : v);
  out = out.replace(/url\s*\([^)]*\)/gi, "");        // 外部资源 / 信标
  out = out.replace(/@import/gi, "");
  out = out.replace(/-moz-binding\s*:/gi, "");
  out = out.replace(/\bbehavior\s*:/gi, "");
  out = out.replace(/\b(javascript|vbscript)\s*:/gi, "");
  out = out.replace(/expression\s*\(/gi, "");        // 与步骤 5 双保险（此处针对 style 值）
  // 定位/层级：以「声明起始或分号后」为界，避免误伤 background-position 之类
  out = out.replace(/(^|;)([^;]*?)\b(position|inset|inset-[a-z]+|z-index)\s*:[^;]*/gi, "$1");
  return out;
}
function sanitizeHtml(html){
  if (!html || typeof html !== "string") return "";
  let s = html;
  // 0. 移除 HTML 注释、CDATA、IE 条件注释（这些可被用于绕过正则消毒）
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  s = s.replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, "");
  // 迭代消毒：循环执行替换直到结果不再变化（最多 5 次），防止嵌套标签绕过
  for (let _iter = 0; _iter < 5; _iter++) {
    const prev = s;
    // 1. 移除危险标签（script/style/link/meta/title/base/head）
    s = s.replace(/<\s*(script|style|link|meta|title|base|head)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
    s = s.replace(/<\s*(script|style|link|meta|title|base|head)\b[^>]*\/?\s*>/gi, "");
    // 2. 移除 iframe/object/embed/applet
    s = s.replace(/<\s*(iframe|object|embed|applet)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
    s = s.replace(/<\s*(iframe|object|embed|applet)\b[^>]*\/?\s*>/gi, "");
    // 3. 移除所有 on* 事件属性
    //    v3.7.59：分两遍。① 常规（空白分隔）；② **斜杠分隔**——`<svg/onload=…>`、
    //    `<img/src=x/onerror=…>` 这类写法里 `/` 在 HTML 解析器中同样充当属性分隔符
    //    （before attribute name → after attribute name → 新属性），故浏览器照样触发事件，
    //    而旧的 `\s+on\w+` 要求前置空白，**拦不住**。
    //    第 ② 遍刻意限定在「标签内部」（<…>）做替换，而不是全局——避免误伤
    //    href="https://x/one=1" 这类含 `/on…=` 的普通 URL 值。
    //    且第 ② 遍是**引号感知**的逐字符扫描：只剥离引号外的 `/on…=`，属性值里的原样保留。
    //    （纯正则做不到这点：`/one=` 与 `/onerror=` 的前置字符都是普通字母，无法区分。）
    s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    s = s.replace(/<[^>]*>/g, function (tag) {
      let out = "", i = 0, quote = "";
      while (i < tag.length) {
        const ch = tag[i];
        if (quote) { out += ch; if (ch === quote) quote = ""; i++; continue; }
        if (ch === '"' || ch === "'") { quote = ch; out += ch; i++; continue; }
        if (ch === "/") {
          const mm = tag.slice(i + 1).match(/^\s*on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i);
          if (mm) { i += 1 + mm[0].length; continue; } // 丢弃这段（斜杠充当属性分隔符的事件属性）
        }
        out += ch; i++;
      }
      return out;
    });
    // 4. 移除「URL 属性」里的危险协议（javascript:/vbscript:/data:）——属性值先经实体解码 +
    //    控制字符剥离再判协议（_isDangerousUrlValue），封堵以实体编码或控制字符隐藏协议名的绕过。
    //    v3.7.59：属性清单由 href|src 扩到 formaction/action/poster/background/dynsrc/lowsrc +
    //    xlink:href。此前 `<button formaction="javascript:…">` 与 `<form action="javascript:…">`
    //    都原样保留（实测见 _audit_evidence/xss-probe.mjs），点击即执行。原 6b 段（xlink:href）
    //    随之合并到此处，不再单列。
    s = s.replace(/(href|src|xlink:href|formaction|action|poster|background|dynsrc|lowsrc)\s*=\s*("([^"]*)"|'([^']*)')/gi, function(m, attr, _q, dq, sq){
      const val = dq !== undefined ? dq : (sq !== undefined ? sq : "");
      return _isDangerousUrlValue(val) ? attr + '=""' : m;
    });
    // 4b. 无引号情况
    s = s.replace(/(href|src|xlink:href|formaction|action|poster|background|dynsrc|lowsrc)\s*=\s*([^\s>"']+)/gi, function(m, attr, val){
      return _isDangerousUrlValue(val) ? attr + '=""' : m;
    });
    // 4c. 消毒 style 属性的**值**（v3.7.90，见 _sanitizeStyleValue 的说明）。
    //     此前的 URL 属性清单里没有 style —— 而全仓约 25 处把动态值拼进内联 style。
    //     统一重写为双引号形式，顺带消除无引号写法带来的解析歧义。
    s = s.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, function(m, _q, dq, sq){
      const val = dq !== undefined ? dq : (sq !== undefined ? sq : "");
      return ' style="' + _sanitizeStyleValue(val) + '"';
    });
    s = s.replace(/\sstyle\s*=\s*([^\s>"']+)/gi, function(m, val){
      return ' style="' + _sanitizeStyleValue(val) + '"';
    });
    // 5. 移除 CSS expression() 及其编码变体（\28 / \x28 等编码括号）
    s = s.replace(/expression\s*\(/gi, "");
    s = s.replace(/expression\s*\\28/gi, "");
    s = s.replace(/expression\s*\\x28/gi, "");
    s = s.replace(/expression\s*\\00028/gi, "");
    // 6. 移除 math 标签及其内容（XSS 载荷常见载体）；保留 SVG 用于装饰性图标
    //    SVG 内的危险内容已由步骤 1-5 消毒（script 标签、on* 事件、javascript:/data: 协议等）
    s = s.replace(/<\s*math\b[^>]*>[\s\S]*?<\s*\/\s*math\s*>/gi, "");
    s = s.replace(/<\s*math\b[^>]*\/?\s*>/gi, "");
    // 6b. （v3.7.59 已合并至步骤 4/4b 的属性清单，此处不再单列 xlink:href）
    // 6c. 移除 SVG 动画标签 animate/animateTransform/animateMotion/set。
    //     它们能在**运行期**把某个属性改成 javascript: —— 例如
    //       <svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>
    //     此时源码里根本没有 `href=` 可供步骤 4 判协议，消毒器看不见、浏览器却会执行。
    //     实测（_audit_evidence/xss-probe.mjs）修复前 animate/set 两种写法均原样通过。
    //     本应用的图标/图表（UI_ICONS、_dgmSvgHtml、萌宠 SVG）均不含这四个标签（全仓 0 命中），
    //     故整体移除不影响任何现有渲染。
    s = s.replace(/<\s*\/?\s*(animate|animateTransform|animateMotion|set)\b[^>]*>/gi, "");
    // 7. 移除其他危险标签：template/noscript/noembed/noframes
    s = s.replace(/<\s*\/?\s*(template|noscript|noembed|noframes)\b[^>]*>/gi, "");
    // 8. 防御 HTML 实体编码绕过（&#x...; / &#...; 形式的 < > " '）
    //    覆盖前导零变体、大写 hex 变体、无分号变体（具体正则见下方）
    s = s.replace(/&#x?0*(?:3[ce]|6[02c]|7[2-9a-f]|1[06]|2[02-7])\b/gi, "");
    s = s.replace(/&#x0*3[ce];?/gi, "");
    s = s.replace(/&#x0*6[02c];?/gi, "");
    s = s.replace(/&#0*60;?/gi, "");
    s = s.replace(/&#0*62;?/gi, "");
    s = s.replace(/&#0*34;?/gi, "");
    s = s.replace(/&#0*39;?/gi, "");
    if (s === prev) break; // 已收敛，提前退出
  }
  return s;
}

/* ---------- Mermaid（2026-10-23）：只在出现 ```mermaid 时按需加载 vendor ----------
 * 10.x UMD（11.x 只发 ESM，file:// 会被 CORS 拦）；securityLevel:'strict' 只让标签走文本，
 * 渲染后仍做一次 SVG 消毒（script/foreignObject/on-事件/外链），失败保留源码并提示。 */
let _mermaidPromise = null;
let _mermaidSeq = 0;
let _mermaidQueue = Promise.resolve();
function _mermaidUrl(){
  try{ return new URL("vendor/mermaid/mermaid.min.js", document.baseURI).href; }catch(_e){ return "vendor/mermaid/mermaid.min.js"; }
}
function _loadMermaid(){
  if(window.mermaid) return Promise.resolve(window.mermaid);
  if(_mermaidPromise) return _mermaidPromise;
  _mermaidPromise = new Promise(function(resolve, reject){
    const s = document.createElement("script");
    s.src = _mermaidUrl();
    s.async = true;
    s.onload = function(){
      if(!window.mermaid){ reject(new Error("mermaid not found")); return; }
      try{ window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" }); }catch(_e){ /* 配置失败交给 render 报错 */ }
      resolve(window.mermaid);
    };
    s.onerror = function(){ reject(new Error("mermaid load failed")); };
    document.head.appendChild(s);
  }).catch(function(e){ _mermaidPromise = null; throw e; });
  return _mermaidPromise;
}
/** 渲染产物二次消毒：script、foreignObject、on- 事件属性、javascript: 一律剥离；保留图表所需的内联 <style>，但去掉外链 */
function _sanitizeMermaidSvg(svg){
  let doc = null;
  try{ doc = new DOMParser().parseFromString(String(svg || ""), "image/svg+xml"); }catch(_e){ return ""; }
  const root = doc && doc.documentElement;
  if(!root) return "";
  Array.prototype.slice.call(root.querySelectorAll("script, foreignObject")).forEach(function(n){ n.remove(); });
  Array.prototype.slice.call(root.querySelectorAll("*")).forEach(function(n){
    Array.prototype.slice.call(n.attributes || []).forEach(function(a){
      const name = String(a.name || "").toLowerCase();
      if(name.indexOf("on") === 0) n.removeAttribute(a.name);
      else if((name === "href" || name === "xlink:href") && /^\s*(javascript|data):/i.test(a.value)) n.removeAttribute(a.name);
    });
    if(String(n.tagName || "").toLowerCase() === "style"){
      n.textContent = String(n.textContent || "")
        .replace(/@import[^;]*;?/gi, "")
        .replace(/url\(\s*["']?https?:[^)]*\)/gi, "none");
    }
  });
  try{ return new XMLSerializer().serializeToString(root); }catch(_e){ return ""; }
}
/* 首图冷加载要十几秒（3.3MB）：先挂一个"正在加载"的中间态，别让人对着源码块干等。
   成功/失败都会把它摘掉 —— 失败时接 _mermaidFail 的提示。 */
function _mermaidLoading(pre){
  if(!pre || !pre.parentNode) return null;
  const next = pre.nextSibling;
  if(next && next.classList && next.classList.contains("mermaid-loading")) return next;
  const el = document.createElement("div");
  el.className = "mermaid-loading";
  el.textContent = t("mermaid.loading", "正在加载图表引擎（首次约需十余秒）…");
  pre.parentNode.insertBefore(el, pre.nextSibling);
  return el;
}
function _mermaidDropLoading(list){
  (list || []).forEach(function(el){ if(el && el.parentNode) el.parentNode.removeChild(el); });
}
function _mermaidFail(pre, msg){
  if(!pre || !pre.parentNode) return;
  if(!pre.nextSibling || !pre.nextSibling.classList || !pre.nextSibling.classList.contains("mermaid-fail")){
    const hint = document.createElement("div");
    hint.className = "mermaid-fail";
    hint.textContent = msg;
    pre.parentNode.insertBefore(hint, pre.nextSibling);
  }
}
/**
 * 把 root 里的 ```mermaid 代码块渲染为 SVG（异步、串行、幂等）。
 * 跳过流式消息；失败保留源码 + 提示，不静默吞图。
 * @param {HTMLElement} root
 * @returns {Promise<void>}
 */
function renderMermaidBlocks(root){
  if(!root) return Promise.resolve();
  const codes = Array.prototype.slice.call(root.querySelectorAll("pre > code.lang-mermaid, pre > code.language-mermaid"))
    .filter(function(c){ return !c.closest(".streaming") && !c.hasAttribute("data-mermaid-state"); });
  if(!codes.length) return _mermaidQueue;
  codes.forEach(function(c){ c.setAttribute("data-mermaid-state", "pending"); });
  /* 只在真的要拉文件时才显示加载态（库已在内存里时是同步替换，不需要中间态） */
  const loading = [];
  if(!window.mermaid){
    codes.forEach(function(c){ const el = _mermaidLoading(c.parentNode); if(el) loading.push(el); });
  }
  _mermaidQueue = _mermaidQueue.then(async function(){
    let lib = null;
    try{ lib = await _loadMermaid(); }
    catch(e){
      _mermaidDropLoading(loading);
      codes.forEach(function(c){ _mermaidFail(c.parentNode, t("mermaid.needVendor", "Mermaid 需要完整发行版（vendor/mermaid）才能渲染")); c.setAttribute("data-mermaid-state", "fail"); });
      return;
    }
    _mermaidDropLoading(loading);
    for(const code of codes){
      const pre = code.parentNode;
      if(!pre || !pre.parentNode) continue;
      try{
        const out = await lib.render("mmd-" + (++_mermaidSeq), code.textContent || "");
        const svg = _sanitizeMermaidSvg(out && out.svg);
        if(!svg) throw new Error("empty svg");
        const fig = document.createElement("div");
        fig.className = "mermaid-figure";
        fig.innerHTML = svg; // lint-xss-ok: 已过 _sanitizeMermaidSvg（script/事件/外链已剥离）
        pre.parentNode.replaceChild(fig, pre);
      }catch(e){
        code.setAttribute("data-mermaid-state", "fail");
        _mermaidFail(pre, t("mermaid.renderFail", "Mermaid 渲染失败，已保留源码"));
        try{ pushDiag("warn", "mermaid render failed: " + ((e && e.message) || e), { where: "renderMermaidBlocks" }); }catch(_e){ /* 诊断不可用不影响回退 */ }
      }
    }
  }).catch(function(e){
    try{ pushDiag("error", "mermaid queue: " + ((e && e.message) || e), { where: "renderMermaidBlocks" }); }catch(_e){ /* 诊断不可用不影响主流程 */ }
  });
  return _mermaidQueue;
}
