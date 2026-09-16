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
/**
 * 简单 Markdown 解析器（手写，无外部依赖）。
 * 支持：标题(#/##/###)、粗体(**)、斜体(*)、行内代码(`)、代码块(```)、
 * 无序列表(-/*)、有序列表(1.)、链接([text](url))、换行（双换行=段落，单换行=<br>）。
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
    s = s.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    // 4. 移除 href/src 的危险协议（javascript:/vbscript:/data:）——属性值先经实体解码+控制字符剥离
    //    再判协议（_isDangerousUrlValue），封堵以实体编码或控制字符插值隐藏协议名的绕过
    s = s.replace(/(href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi, function(m, attr, _q, dq, sq){
      const val = dq !== undefined ? dq : (sq !== undefined ? sq : "");
      return _isDangerousUrlValue(val) ? attr + '=""' : m;
    });
    // 4b. 无引号情况
    s = s.replace(/(href|src)\s*=\s*([^\s>"']+)/gi, function(m, attr, val){
      return _isDangerousUrlValue(val) ? attr + '=""' : m;
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
    // 6b. 移除 SVG 中 xlink:href 的危险协议（javascript:/vbscript:/data:），防御 <use xlink:href="javascript:..."> 载荷
    //     与步骤 4 同口径：实体解码+控制字符剥离后判协议
    s = s.replace(/(xlink:href)\s*=\s*("([^"]*)"|'([^']*)')/gi, function(m, attr, _q, dq, sq){
      const val = dq !== undefined ? dq : (sq !== undefined ? sq : "");
      return _isDangerousUrlValue(val) ? attr + '=""' : m;
    });
    s = s.replace(/(xlink:href)\s*=\s*([^\s>"']+)/gi, function(m, attr, val){
      return _isDangerousUrlValue(val) ? attr + '=""' : m;
    });
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
