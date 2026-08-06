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

