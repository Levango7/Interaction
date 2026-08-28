const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, safeStorage, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const os = require("os");
const http = require("http");


/* ---------- 内联生成托盘图标（零外部文件依赖） ---------- */
function crc32(buf){
  const table = [];
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function makeTrayIcon(){
  // B7：程序化绘制「圆角蓝底 + 白色 A 字标」（零外部文件依赖），替代原纯色方块
  const W = 32, H = 32;
  const px = new Array(W * H).fill(null); // 每像素 [r,g,b,a]
  const R = 8; // 圆角半径
  function sdRoundRect(x, y){
    const qx = Math.abs(x - 16) - (16 - R), qy = Math.abs(y - 16) - (16 - R);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - R;
  }
  function segDist(x, y, ax, ay, bx, by){ // 点到线段距离
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    const px2 = ax + t * dx, py2 = ay + t * dy;
    return Math.sqrt((x - px2) * (x - px2) + (y - py2) * (y - py2));
  }
  const STROKE = 3.6; // 笔画宽度
  for (let y = 0; y < H; y++){
    for (let x = 0; x < W; x++){
      const cx = x + 0.5, cy = y + 0.5;
      // 圆角蓝底（1px 抗锯齿）
      const d = sdRoundRect(cx, cy);
      if (d > 0.5) continue; // 完全透明
      const cover = Math.max(0, Math.min(1, 0.5 - d));
      px[y * W + x] = [0x0a, 0x6c, 0xbd, Math.round(255 * cover)];
      // 白色 A：左斜边 / 右斜边 / 横杠
      const dA = Math.min(
        segDist(cx, cy, 16, 6.5, 8.5, 25.5),
        segDist(cx, cy, 16, 6.5, 23.5, 25.5),
        segDist(cx, cy, 11.6, 18.5, 20.4, 18.5)
      );
      const aCover = Math.max(0, Math.min(1, (STROKE / 2 + 0.5) - dA)) * cover;
      if (aCover > 0){
        const base = px[y * W + x];
        px[y * W + x] = [
          Math.round(base[0] + (255 - base[0]) * aCover),
          Math.round(base[1] + (255 - base[1]) * aCover),
          Math.round(base[2] + (255 - base[2]) * aCover),
          Math.max(base[3], Math.round(255 * cover))
        ];
      }
    }
  }
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++){
    raw[y * (W * 4 + 1)] = 0; // 每行过滤字节
    for (let x = 0; x < W; x++){
      const o = y * (W * 4 + 1) + 1 + x * 4;
      const p = px[y * W + x];
      if (p){ raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2]; raw[o + 3] = p[3]; }
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit, RGBA
  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return nativeImage.createFromBuffer(png);
}

let win = null;
let tray = null;
let willQuit = false;

function resolveHtml(){
  // 开发：electron/ 上一级（仓库根）；打包：html 与 main.js 同目录（resources/app）
  // 用 app.isPackaged 区分，并做多候选兜底，避免打包后空白窗口。
  if (app.isPackaged){
    const packed = path.join(__dirname, "agent-workbench.html");
    if (fs.existsSync(packed)) return packed;
  }
  const dev = path.resolve(__dirname, "..", "agent-workbench.html");
  if (fs.existsSync(dev)) return dev;
  // 兜底：同目录（兼容自定义布局）
  return path.join(__dirname, "agent-workbench.html");
}

function createWindow(){
  const isMac = process.platform === "darwin";
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Agent 工坊",
    backgroundColor: "#f3f3f3",
    titleBarStyle: isMac ? "hiddenInset" : "default",
    icon: makeTrayIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(resolveHtml());

  // 关闭窗口 → 隐藏到托盘（仅托盘菜单的「退出」才真正退出）
  win.on("close", (e) => {
    if (!willQuit){ e.preventDefault(); win.hide(); }
  });
}

/* ---------- 应用菜单栏：视图 + 帮助，macOS 加 app 菜单 ---------- */
function buildAppMenu(){
  const isMac = process.platform === "darwin";
  const template = [];

  if (isMac){
    template.push({
      label: app.name || "Agent 工坊",
      submenu: [
        { role: "about", label: "关于 Agent 工坊" },
        { type: "separator" },
        { role: "services", label: "服务" },
        { type: "separator" },
        { role: "hide", label: "隐藏" },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "显示全部" },
        { type: "separator" },
        { role: "quit", label: "退出" }
      ]
    });
  }

  // 视图菜单：重载 / 强制重载 / 全屏（v1.11.1 [L7]：开发者工具仅开发态保留，
  // 生产构建不再经 Alt 菜单暴露 devtools 入口）
  const viewSubmenu = [
    { role: "reload", label: "重载" },
    { role: "forceReload", label: "强制重载" }
  ];
  if (!app.isPackaged) viewSubmenu.push({ role: "toggleDevTools", label: "开发者工具" });
  viewSubmenu.push(
    { type: "separator" },
    { role: "resetZoom", label: "重置缩放" },
    { role: "zoomIn", label: "放大" },
    { role: "zoomOut", label: "缩小" },
    { type: "separator" },
    { role: "togglefullscreen", label: "全屏" }
  );
  template.push({ label: "视图", submenu: viewSubmenu });

  // 帮助菜单：关于（showAboutPanel 带 app 名/版本/描述）
  template.push({
    label: "帮助",
    submenu: [
      {
        label: "关于",
        click: () => {
          try { app.showAboutPanel(); }
          catch (e) { /* 旧版 Electron 兜底 */ }
        }
      }
    ]
  });

  return Menu.buildFromTemplate(template);
}

function applyAppMenu(){
  // dev 模式显示完整菜单；prod 模式保留菜单（autoHideMenuBar 已让默认隐藏，Alt 唤出）
  // 守卫：测试 mock 的 Menu 无 setApplicationMenu，避免破坏 IPC 单测
  if (typeof Menu.setApplicationMenu === "function"){
    try { Menu.setApplicationMenu(buildAppMenu()); }
    catch (e) { /* 菜单构造失败不阻塞启动 */ }
  }
}

function createTray(){
  tray = new Tray(makeTrayIcon());
  tray.setToolTip("Agent 工坊");
  const menu = Menu.buildFromTemplate([
    { label: "显示窗口", click: () => { if (win){ win.show(); win.focus(); } } },
    { label: "隐藏窗口", click: () => { if (win) win.hide(); } },
    { type: "separator" },
    { label: "退出", click: () => { willQuit = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else { win.show(); win.focus(); }
  });
}

/* ---------- AI 配置（仅主进程持有，Key 不进渲染进程/localStorage） ----------
 * 优先用 Electron safeStorage（Windows 走 DPAPI，密钥由操作系统托管，真实保护）。
 * 旧版为“机器绑定派生 AES 密钥”的伪加密，仅保留用于一次性迁移读取。
 */
function aiConfigPath(){ return path.join(app.getPath("userData"), "ai-config.enc"); }

// 旧版派生密钥（仅用于迁移旧文件，不再写入）
function legacyAiConfigKey(){
  return crypto.createHash("sha256").update("agent-workbench::ai::" + os.hostname() + "::" + (process.env.USERNAME || process.env.USER || "")).digest();
}
function legacyDecrypt(buf){
  const d = crypto.createDecipheriv("aes-256-gcm", legacyAiConfigKey(), buf.subarray(0,12), { authTagLength: 16 });
  d.setAuthTag(buf.subarray(12,28));
  return JSON.parse(d.update(buf.subarray(28), "utf8", "utf8") + d.final("utf8"));
}

/* F3：ai-config 结构归一化——新版为 { enabled, profiles: { id: {base, model, key} } }；
 * 旧版单配置 { base, model, key, enabled } 自动迁移到 profiles.__legacy__。 */
function normalizeAiConfig(raw){
  if(!raw || typeof raw !== "object") return null;
  if(raw.profiles && typeof raw.profiles === "object"){
    return { enabled: !!raw.enabled, profiles: raw.profiles };
  }
  if(typeof raw.base === "string" || typeof raw.key === "string" || typeof raw.model === "string"){
    return {
      enabled: !!raw.enabled,
      profiles: { __legacy__: { base: raw.base || "", model: raw.model || "", key: raw.key || "" } }
    };
  }
  return null;
}
function loadAiConfig(){
  try{
    const p = aiConfigPath();
    if(!fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    let raw = null;
    // 优先 safeStorage（真实加密）
    if(safeStorage && safeStorage.isEncryptionAvailable()){
      try{ raw = JSON.parse(safeStorage.decryptString(buf)); }
      catch(e){ /* 可能是旧格式或文件损坏 → 尝试迁移 */ }
    }
    if(!raw) raw = legacyDecrypt(buf); // 旧版派生密钥格式（一次性迁移读取）
    const norm = normalizeAiConfig(raw);
    if(!norm) return null;
    if(!raw.profiles) saveAiConfig(norm); // 旧单配置 → 迁移为新结构并重写
    return norm;
  }catch(e){ return null; }
}
function saveAiConfig(cfg){
  const payload = JSON.stringify(cfg);
  if(safeStorage && safeStorage.isEncryptionAvailable()){
    fs.writeFileSync(aiConfigPath(), safeStorage.encryptString(payload));
    return;
  }
  // 兜底：理论上 Windows 下始终可用 DPAPI，此处仅防御性保留旧方案
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", legacyAiConfigKey(), iv);
  const enc = Buffer.concat([c.update(payload, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  fs.writeFileSync(aiConfigPath(), Buffer.concat([iv, tag, enc]));
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/* ---------- F1：base URL 安全校验（与浏览器端 validateBaseUrl 对齐） ----------
 * 只允许 https:// 与 http://localhost / http://127.0.0.1（供本地代理/开发）。
 * 防止配置损坏或恶意配置导致 API Key 明文发往 http:// 公网端点。 */
function isSafeBaseUrl(base){
  if(!base || typeof base !== "string") return false;
  try{
    const u = new URL(base);
    if(u.protocol === "https:") return true;
    if(u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return false;
  }catch(e){ return false; }
}

/* ---------- B8/R3：轻量滚动日志（userData/logs/app.log，JSON Lines，上限约 1MB 自动截断） ---------- */
function formatLogLine(scope, msg){
  return JSON.stringify({ ts: new Date().toISOString(), scope, msg }) + "\n";
}
function logLine(scope, msg){
  try{
    const dir = path.join(app.getPath("userData"), "logs");
    if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
    const file = path.join(dir, "app.log");
    // R3：结构化 JSON Lines，便于机器解析（每行一个 {ts, scope, msg}）
    fs.appendFileSync(file, formatLogLine(scope, msg));
    // 滚动：超过 1MB 保留后 512KB
    const st = fs.statSync(file);
    if(st.size > 1024*1024){
      const buf = fs.readFileSync(file);
      fs.writeFileSync(file, buf.slice(buf.length - 512*1024));
    }
  }catch(e){ /* 日志失败绝不阻塞业务 */ }
}

/* ---------- 开机自启（由设置抽屉开关控制） ---------- */
/* v1.11.1 [M4]：IPC sender 信任校验——仅接受来自本应用 file:// 页面的调用，
 * 远程/未知来源（如被导航守卫拦下之前曾可能创建的远程窗口）一律拒绝。
 * senderFrame 在 ipcMain 事件上始终存在；缺失或非 file:// 视为不可信（fail-closed）。 */
function assertTrustedSender(e){
  let url = "";
  try{ url = (e && e.senderFrame && e.senderFrame.url) || ""; }catch(err){ url = ""; }
  if(url.startsWith("file://")) return;
  throw new Error("IPC 拒绝：不受信任的调用来源");
}
ipcMain.handle("get-auto-launch", (e) => {
  try {
    assertTrustedSender(e);
    const s = app.getLoginItemSettings();
    // v1.11.1 [L2]：portable exe 被移动/改名后旧注册路径静默失效——发现路径不一致时按当前 exe 重新注册自愈
    if (s && s.openAtLogin && s.path && path.resolve(s.path) !== path.resolve(app.getPath("exe"))){
      try { app.setLoginItemSettings({ openAtLogin: true, path: app.getPath("exe"), args: [] }); } catch (e2){ /* 忽略权限错误 */ }
    }
    return !!s.openAtLogin;
  } catch (e) { return false; }
});
ipcMain.on("set-auto-launch", (e, on) => {
  try { assertTrustedSender(e); } catch (err) { return; }
  try {
    app.setLoginItemSettings({ openAtLogin: !!on, path: app.getPath("exe"), args: [] });
  } catch (e) { /* 忽略权限错误 */ }
});

// Windows 下确保任务栏分组 / 通知正确归属
app.setAppUserModelId("com.agent.workbench");

/* v1.11.1 [M1]：全局导航守卫——此前 setWindowOpenHandler / will-navigate 均为 0 命中，
 * 新窗口继承 webPreferences（含 preload），远程页面理论上可获 window.electronAPI。
 * 现策略：远程 URL 一律转系统浏览器打开并拒绝应用内加载；file://（本应用页面）与
 * about:blank（报表打印窗口 window.open("")+document.write 使用）放行。
 * 挂在 web-contents-created 上，覆盖主窗口与所有子窗口。 */
function _isInternalUrl(url){
  try{
    const u = new URL(url);
    return u.protocol === "file:" || u.protocol === "about:";
  }catch(e){ return false; }
}
app.on("web-contents-created", (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (_isInternalUrl(url)) return { action: "allow" };
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  contents.on("will-navigate", (e, url) => {
    if (!_isInternalUrl(url)){
      e.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });
});

// 单实例锁：避免重复双击 exe 打开多个窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock){
  app.quit();
} else {
  app.on("second-instance", () => { if (win){ win.show(); win.focus(); } });
  app.whenReady().then(() => {
    // SECURITY [C3+]: CSP 深度防御——HTML meta CSP（agent-workbench.html Line 16）已存在，
    // 此处再于主进程注入 HTTP 响应头形成双层防护：即便未来有子窗口/远程页面绕过 meta，
    // 主进程层 CSP 仍生效。内容与 HTML meta CSP 完全一致，避免策略漂移。
    // 注意：script-src 'unsafe-inline' 因单文件内联 JS 架构暂需保留（详见 HTML 中 [C3] TODO）。
    const cspValue = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [cspValue]
        }
      });
    });

    createWindow();
    createTray();
    applyAppMenu();
    startSyncServer();  // P0-8：局域网同步 server

    // AI 配置与代理（P0-3）：Key 由主进程保管，渲染进程经 IPC 委托请求
    // P1-1 取消链路：按 sender 维护活跃 chat 请求的 AbortController，供 abort-chat IPC 中止
    const chatAborters = new Map(); // webContentsId -> Set<AbortController>
    const pendingCancelBySender = new Map(); // F2：webContentsId -> 取消标记（退避 sleep 窗口内也生效）
    function trackChatAborter(webContentsId, ctrl){
      let set = chatAborters.get(webContentsId);
      if(!set){ set = new Set(); chatAborters.set(webContentsId, set); }
      set.add(ctrl);
    }
    function untrackChatAborter(webContentsId, ctrl){
      const set = chatAborters.get(webContentsId);
      if(!set) return;
      set.delete(ctrl);
      if(set.size === 0) chatAborters.delete(webContentsId);
    }
    ipcMain.handle("set-ai-config", (e, incoming) => {
      assertTrustedSender(e); // v1.11.1 [M4]
      if(!incoming || typeof incoming !== "object") return { ok:false };
      const cur = loadAiConfig() || { enabled:false, profiles:{} };
      const next = {
        enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : !!cur.enabled,
        profiles: {}
      };
      // 先复制既有 profiles（未提及的 profile 保留 base/model/key）
      if(cur.profiles && typeof cur.profiles === "object"){
        for(const id of Object.keys(cur.profiles)) next.profiles[id] = Object.assign({}, cur.profiles[id]);
      }
      const applyEntry = (id, p, prev) => {
        const entry = {
          base:  typeof p.base  === "string" ? p.base  : (prev.base  || ""),
          model: typeof p.model === "string" ? p.model : (prev.model || "")
        };
        if(p.key === null) entry.key = "";                    // F4：显式清除
        else if(typeof p.key === "string" && p.key.length) entry.key = p.key; // 新 Key
        else if(typeof prev.key === "string") entry.key = prev.key;           // 省略/空串 → 保留既有
        next.profiles[id] = entry;
      };
      if(Array.isArray(incoming.profiles)){
        for(const p of incoming.profiles){
          if(!p || typeof p !== "object" || typeof p.id !== "string" || !p.id) continue;
          applyEntry(p.id, p, next.profiles[p.id] || {});
        }
      } else {
        // 旧单配置兼容：写入 __legacy__
        applyEntry("__legacy__", incoming, next.profiles.__legacy__ || {});
      }
      saveAiConfig(next);
      return { ok:true };
    });
    ipcMain.handle("get-ai-config", (e) => {
      assertTrustedSender(e); // v1.11.1 [M4]
      const c = loadAiConfig() || { enabled:false, profiles:{} };
      const profiles = [];
      if(c.profiles && typeof c.profiles === "object"){
        for(const id of Object.keys(c.profiles)){
          const p = c.profiles[id] || {};
          profiles.push({ id, base: p.base || "", model: p.model || "", keySet: !!(p.key && p.key.length) });
        }
      }
      return { enabled: !!c.enabled, profiles };
    });
    ipcMain.handle("chat", async (e, arg) => {
      assertTrustedSender(e); // v1.11.1 [M4]
      // v1.11.1 [镜像警示]：本重试矩阵与真相源内联 chatOnce 为跨进程双实现（无共享构建管线），
      // 修改前必读：① 先更新 tests/electron-ipc.test.js F2 与 tests/ai-retry-contract.test.js 契约用例；
      // ② 同步修改对侧（agent-workbench.html chatOnce）重试/钳制/错误文案；③ 完全合并依赖 H4 拆分。
      const cfg = loadAiConfig();
      if(!cfg) throw new Error("AI 未配置：请先在设置中填写 API Key");
      // F3：按 profileId 取对应 profile 的 base/model/key；缺省回退 __legacy__ → 唯一 → 第一个
      const profiles = (cfg.profiles && typeof cfg.profiles === "object") ? cfg.profiles : {};
      const pid = (arg && typeof arg.profileId === "string" && arg.profileId) ? arg.profileId : "";
      let prof = pid && profiles[pid];
      if(!prof){
        prof = profiles.__legacy__ || null;
        if(!prof){
          const ids = Object.keys(profiles);
          if(ids.length) prof = profiles[ids[0]];
        }
      }
      if(!prof || !prof.key) throw new Error("AI 未配置：请先在设置中填写 API Key");
      const base = (prof.base || "https://api.openai.com/v1").replace(/\/+$/,"");
      // F1：base URL 协议校验——非法直接拒绝，不发请求（Key 只发往 https 或本机 http）
      if(!isSafeBaseUrl(base)) throw new Error("AI base URL 不安全，已阻止请求");
      // B8：温度 / 超时由前端配置传入，带范围校验，非法值回退默认（0.7 / 30s）
      let temperature = Number(arg && arg.temperature);
      if(!isFinite(temperature)) temperature = 0.7;
      temperature = Math.min(2, Math.max(0, temperature));
      let timeoutSec = Number(arg && arg.timeoutSec);
      if(!isFinite(timeoutSec)) timeoutSec = 30;
      timeoutSec = Math.min(120, Math.max(5, Math.round(timeoutSec)));
      const body = {
        model: (arg && typeof arg.model === "string" && arg.model) ? arg.model : (prof.model || "gpt-4o-mini"),
        messages: (arg && Array.isArray(arg.messages)) ? arg.messages : [],
        temperature
      };
      if(arg && Array.isArray(arg.tools)) body.tools = arg.tools;
      if(arg && arg.tool_choice) body.tool_choice = arg.tool_choice;
      logLine("chat", "request model="+body.model+" temp="+temperature+" timeout="+timeoutSec+"s");
      let lastErr = null;
      const senderId = e.sender && e.sender.id;
      // F2：新请求先清除残留取消标记（上一次的取消不应影响本次）
      if(senderId) pendingCancelBySender.delete(senderId);
      for(let attempt = 0; attempt < 3; attempt++){
        // F2：退避 sleep 窗口内用户可能已取消——每轮发请求前复查标记
        if(senderId && pendingCancelBySender.get(senderId)){
          pendingCancelBySender.delete(senderId);
          throw new Error("__USER_CANCEL__");
        }
        const ctrl = new AbortController();
        let cancelledByUser = false;
        if(senderId) trackChatAborter(senderId, ctrl);
        // P1-1：用户取消经 abort-chat IPC 触发（signal.reason 标记 user-cancel）
        const finish = () => { if(senderId) untrackChatAborter(senderId, ctrl); };
        ctrl.signal.addEventListener("abort", () => {
          if(ctrl.signal.reason && ctrl.signal.reason.__userCancel) cancelledByUser = true;
        });
        const timer = setTimeout(() => ctrl.abort(), timeoutSec * 1000);
        try{
          const r = await fetch(base + "/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + prof.key },
            body: JSON.stringify(body),
            signal: ctrl.signal
          });
          clearTimeout(timer);
          finish();
          if(!r.ok){
            if(r.status === 401) throw new Error("API Key 无效，请检查设置中的 Key");
            if(r.status === 429){ finish(); lastErr = new Error("请求过于频繁，稍后重试"); await sleep(1000 * (attempt + 1)); continue; }
            if(r.status >= 500){ finish(); lastErr = new Error("服务异常，请稍后重试"); await sleep(1000 * (attempt + 1)); continue; }
            throw new Error("API 返回错误：" + r.status);
          }
          logLine("chat", "ok status="+r.status);
          return await r.json();
        }catch(err){
          clearTimeout(timer);
          finish();
          if(err && err.name === "AbortError"){
            if(cancelledByUser) throw new Error("__USER_CANCEL__"); // P1-1：取消特殊标记，前端识别为"已取消"
            throw new Error("请求超时（"+timeoutSec+" 秒），请检查网络或上游服务");
          }
          if(err && err.message && (err.message.indexOf("API Key") >= 0 || err.message.indexOf("服务异常") >= 0 || err.message.indexOf("API 返回错误") >= 0)) throw err;
          if(attempt < 2){ await sleep(1000 * (attempt + 1)); continue; }
          logLine("chat", "error "+(err && err.message ? err.message : String(err)));
          throw new Error("请求失败：" + (err && err.message ? err.message : String(err)));
        }
      }
      throw lastErr || new Error("请求失败");
    });
    // P1-1：渲染进程主动取消进行中的 chat 请求（Electron 版取消按钮）
    ipcMain.on("abort-chat", (e) => {
      try { assertTrustedSender(e); } catch (err) { return; } // v1.11.1 [M4]
      if(!e.sender || !e.sender.id) return;
      // F2：先置取消标记——即使请求正处于退避 sleep 窗口（无活跃 controller），
      // 下一轮循环也会在发请求前捕获该标记并抛 __USER_CANCEL__
      pendingCancelBySender.set(e.sender.id, true);
      const set = chatAborters.get(e.sender.id);
      if(!set) return;
      set.forEach((ctrl) => {
        try{
          const reason = new Error("user-cancel");
          reason.__userCancel = true;
          ctrl.abort(reason);
        }catch(err2){ /* noop */ }
      });
    });

    // P0-8 局域网同步 IPC——v3.1.1 重写：主进程无 localStorage，数据真相源在渲染进程。
    // sync-get 返回最近一次渲染进程推送的快照（启动/每60s/点同步按钮时经 sync-push 更新）；
    // sync-upload 不再伪装落盘，改为同 HTTP /sync/upload 一致的中转语义（渲染进程确认后走 doImport）。
    ipcMain.handle("sync-get", (e) => {
      assertTrustedSender(e);
      try {
        return JSON.parse(JSON.stringify(syncSnapshot || {}));
      } catch(e2) { return { error: e2 && e2.message ? e2.message : String(e2) }; }
    });
    ipcMain.handle("sync-upload", (e, data) => {
      assertTrustedSender(e);
      if (!data || typeof data !== "object") return { ok: false, error: "invalid data" };
      try {
        // 中转给渲染进程弹确认框；实际合并落库由渲染进程 doImport 完成
        win.webContents.send("sync-upload-request", data);
        return { ok: true, relayed: true };
      } catch(e2) { return { ok: false, error: e2.message }; }
    });

    /* v1.11.1 [M5]：electron-updater 更新链路已整体移除——三处断点（portable 目标不支持
     * 自动更新 / 无 publish 配置 / 渲染端 preload 无 update-available 监听）使其从未可用。
     * 分发形态维持 portable + 手动下载：更新 = 从 GitHub Releases 重新下载。 */
  });
}

// 保留托盘存活：关掉所有窗口不退出
app.on("window-all-closed", () => { /* 不退出，托盘常驻 */ });

/* ---------- P0-8：局域网同步 HTTP server（仅 Electron 环境） ----------
 * v3.1.1 重写（修复三处链路断裂）：
 *   原实现直接读主进程 localStorage（Electron 主进程无此全局对象，恒得空对象），
 *   导致 /sync/download 与 sync-get 永远返回 {}；sync-upload 写主进程 localStorage 同样无效。
 * 现架构：数据快照由渲染进程经 IPC「sync-push」推送给主进程（渲染进程才是 localStorage 真相源）：
 *   - 渲染进程启动时、每 60s、点击同步按钮时各推送一次最新快照
 *   - GET /sync/download → 返回最近一次推送的快照（含稳定 deviceId）
 *   - POST /sync/upload → 仅中转给渲染进程弹确认框（复用 doImport 的合并逻辑），主进程不落盘
 * 安全边界不变：仅绑定 127.0.0.1 且拒绝非本机来源——跨设备同步走设置抽屉的导出/导入 JSON。
 * 服务器在 app.ready 时启动，before-quit 时关闭。
 */
let syncServer = null;
let syncSnapshot = {};          // 最近一次渲染进程推送的数据快照
let syncDeviceId = null;        // 本次会话稳定的设备 id
let syncPort = 8124;            // B3：OAuth redirect_uri 端口（随 INTERACTION_SYNC_PORT 覆写）
function startSyncServer(){
  // 端口默认 8124（生产）；测试环境经 INTERACTION_SYNC_PORT 覆写为空闲端口，
  // 避免多 vitest worker 并发加载 main.js 时对同一回环端口的双重绑定（Windows 下表现为 ECONNRESET）。
  const PORT = Number(process.env.INTERACTION_SYNC_PORT) || 8124;
  syncPort = PORT; // B3：OAuth 回调 redirect_uri 与此端口一致
  const MAX_BODY_BYTES = 8 * 1024 * 1024; // 上传体上限 8MB，防异常大包拖垮进程

  // 渲染进程推送快照（IPC：sync-push）。key 白名单与旧逻辑一致。
  ipcMain.handle("sync-push", (e, data) => {
    assertTrustedSender(e);
    if (!data || typeof data !== "object" || Array.isArray(data)) return { ok:false, error:"invalid data" };
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if ((k.startsWith("wb_agent_") || k === "wb_custom_links") && typeof v === "string") out[k] = v;
    }
    syncSnapshot = out;
    return { ok:true, keys:Object.keys(out).length };
  });

  syncServer = http.createServer((req, res) => {
    // 仅允许 localhost 请求（防跨网络滥用）
    const clientIp = req.socket && req.socket.remoteAddress;
    if (clientIp && clientIp !== "::1" && clientIp !== "127.0.0.1") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    if (req.method === "GET" && req.url === "/sync/download") {
      if (!syncDeviceId) syncDeviceId = require("crypto").randomUUID();
      const data = { ...syncSnapshot };
      data._deviceMeta = { deviceId: syncDeviceId, syncedAt: Date.now(), empty: !syncSnapshot || Object.keys(syncSnapshot).length === 0 };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } else if (req.method === "POST" && req.url === "/sync/upload") {
      let body = "";
      let oversize = false;
      req.on("data", chunk => {
        body += chunk;
        if (body.length > MAX_BODY_BYTES) { oversize = true; req.destroy(); }
      });
      req.on("end", () => {
        if (oversize) return; // 连接已被销毁
        try {
          const incoming = JSON.parse(body);
          if (!incoming || typeof incoming !== "object") throw new Error("invalid");
          // 广播给渲染进程：有同步数据待确认（确认后由渲染进程走 doImport 合并落库）
          if (win && !win.isDestroyed()) {
            win.webContents.send("sync-upload-request", incoming);
            res.writeHead(202, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ accepted: true }));
          } else {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "window unavailable" }));
          }
        } catch(e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "bad request" }));
        }
      });
    } else if (req.method === "GET" && req.url && req.url.startsWith("/oauth/callback")) {
      /* B3：OAuth 授权回调（仅 127.0.0.1 可达；state 一次性 + TTL 10min，防 CSRF/重放） */
      const q = new URL(req.url, "http://127.0.0.1").searchParams;
      const state = q.get("state") || "";
      const code = q.get("code") || "";
      const errParam = q.get("error");
      const rec = oauthStates.get(state);
      oauthStates.delete(state); // 一次性：无论成败都不允许重放
      const finishHtml = (ok, msg) => {
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!doctype html><meta charset='utf-8'><title>授权回调</title>"
          + "<body style='font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>"
          + "<div style='text-align:center'><div style='font-size:40px;font-weight:600;color:' + (ok ? '#34a853' : '#d83b3b') + '>' + (ok ? '\u2713' : '\u2715') + '</div>"
          + "<p>" + msg + "</p><p style='color:#888'>授权完成，可关闭此窗口并回到应用</p></div>");
      };
      if (errParam){
        oauthNotify({ ok:false, error: errParam });
        finishHtml(false, "授权被拒绝或失败：" + errParam);
        return;
      }
      if (!rec){ finishHtml(false, "state 无效或已过期，请回到应用重新发起授权"); return; }
      oauthExchangeCode(rec, code).then((token) => {
        oauthUpsertToken(rec.provider, token);
        oauthNotify({ provider: rec.provider, ok:true });
        finishHtml(true, "已授权 " + rec.provider);
      }).catch((err) => {
        logLine("oauth", "callback exchange: " + ((err && err.message) || err));
        oauthNotify({ provider: rec.provider, ok:false, error:((err && err.message) || String(err)) });
        finishHtml(false, "令牌交换失败：" + ((err && err.message) || err));
      });
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    }
  });
  syncServer.listen(PORT, "127.0.0.1", () => {
    console.log(`[sync] LAN sync server listening on http://127.0.0.1:${PORT}`);
  });
  syncServer.on("error", err => {
    console.error(`[sync] server error: ${err.message}`);
  });
  startOAuthRefresher(); // B3：token 过期前自动刷新巡检
}
function stopSyncServer(){
  if (oauthRefreshTimer){ clearInterval(oauthRefreshTimer); oauthRefreshTimer = null; }
  if (syncServer) {
    syncServer.close(() => { syncServer = null; });
  }
}

/* ---------- B3：OAuth 轻后端（token 加密落盘 + 回调端点 + 自动刷新） ----------
 * 目标：为九大集成提供真双向所需的 OAuth2 令牌生命周期管理，全部在主进程本地完成：
 *   - 授权发起：oauth-begin（PKCE S256 + 一次性 state，TTL 10min，防 CSRF/重放）
 *   - 回调闭环：GET /oauth/callback（挂在局域网同步 server 上，仍仅 127.0.0.1 可达）
 *   - 令牌落盘：userData/oauth-tokens.json.enc，safeStorage 加密（不可用则派生密钥 AES-256-GCM 兜底）
 *   - 自动刷新：每 5min 巡检，过期前 10min 内自动 refresh；失败仅记日志并通知渲染层，不阻塞
 * 安全：token 明文只存在于主进程内存与加密落盘；渲染层经 IPC 按需取单个 provider 的 access_token。
 */
const OAUTH_STATE_TTL = 10 * 60 * 1000;
const OAUTH_REFRESH_MARGIN = 10 * 60 * 1000;   // 过期前 10min 触发刷新
const OAUTH_REFRESH_INTERVAL = 5 * 60 * 1000;  // 巡检周期
let oauthStates = new Map();          // state -> { provider, tokenUrl, clientId, clientSecret, codeVerifier, scope, createdAt }
let oauthRefreshTimer = null;
let oauthTokenCache = null;           // 内存明文真相源（读多写少，避免每次解密）
function oauthStorePath(){
  return path.join(app.getPath("userData"), "oauth-tokens.json.enc");
}
function oauthCipherKey(){
  // safeStorage 不可用时的兜底密钥（机器内派生；与 AI 配置旧方案同思路，防御性保留）
  return crypto.createHash("sha256")
    .update("agent-workbench:oauth:" + (app.getPath("userData") || ""))
    .digest();
}
function oauthLoadStore(){
  if (oauthTokenCache) return oauthTokenCache;
  try{
    const p = oauthStorePath();
    if(!fs.existsSync(p)){ oauthTokenCache = {}; return oauthTokenCache; }
    const buf = fs.readFileSync(p);
    if(safeStorage && safeStorage.isEncryptionAvailable()){
      try{ oauthTokenCache = JSON.parse(safeStorage.decryptString(buf)) || {}; return oauthTokenCache; }
      catch(e){ /* 损坏/旧格式 → 兜底解密 */ }
    }
    try{
      const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), data = buf.subarray(28);
      const d = crypto.createDecipheriv("aes-256-gcm", oauthCipherKey(), iv);
      d.setAuthTag(tag);
      oauthTokenCache = JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8")) || {};
    }catch(e){ oauthTokenCache = {}; }
  }catch(e){ oauthTokenCache = {}; }
  return oauthTokenCache;
}
function oauthSaveStore(){
  try{
    const payload = JSON.stringify(oauthTokenCache || {});
    if(safeStorage && safeStorage.isEncryptionAvailable()){
      fs.writeFileSync(oauthStorePath(), safeStorage.encryptString(payload));
      return;
    }
    const iv = crypto.randomBytes(12);
    const cip = crypto.createCipheriv("aes-256-gcm", oauthCipherKey(), iv);
    const enc = Buffer.concat([cip.update(payload, "utf8"), cip.final()]);
    fs.writeFileSync(oauthStorePath(), Buffer.concat([iv, cip.getAuthTag(), enc]));
  }catch(e){ logLine("oauth", "save store failed: " + (e && e.message)); }
}
function b64url(buf){
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function oauthPruneStates(){
  const now = Date.now();
  for (const [k, v] of oauthStates){ if (now - v.createdAt > OAUTH_STATE_TTL) oauthStates.delete(k); }
}
function oauthNotify(payload){
  // 渲染层通知：win/webContents 缺失（测试/窗口关闭）时静默跳过，绝不阻塞授权主流程
  try{
    if (win && typeof win.isDestroyed === "function" && !win.isDestroyed() && win.webContents && typeof win.webContents.send === "function"){
      win.webContents.send("oauth-status", payload);
    }
  }catch(e){ /* ignore */ }
}
function oauthUpsertToken(provider, rec){
  const store = oauthLoadStore();
  store[provider] = Object.assign({}, store[provider] || {}, rec, { updatedAt: Date.now() });
  oauthTokenCache = store;
  oauthSaveStore();
}
async function oauthExchangeCode(rec, code){
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: "http://127.0.0.1:" + syncPort + "/oauth/callback",
    client_id: rec.clientId,
  });
  if (rec.codeVerifier) body.set("code_verifier", rec.codeVerifier);
  if (rec.clientSecret) body.set("client_secret", rec.clientSecret);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try{
    const r = await fetch(rec.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: body.toString(),
      signal: ac.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error("token exchange failed: HTTP " + r.status);
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token || null,
      expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : null,
      scope: j.scope || rec.scope || null,
      tokenUrl: rec.tokenUrl,
      clientId: rec.clientId,
      clientSecret: rec.clientSecret || null,
      usePkce: !!rec.codeVerifier,
    };
  } finally { clearTimeout(t); }
}
async function oauthRefreshProvider(provider){
  const store = oauthLoadStore();
  const rec = store[provider];
  if (!rec || !rec.refreshToken) return { ok:false, error:"no refresh token" };
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: rec.refreshToken,
    client_id: rec.clientId,
  });
  if (rec.clientSecret) body.set("client_secret", rec.clientSecret);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try{
    const r = await fetch(rec.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: body.toString(),
      signal: ac.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error("refresh failed: HTTP " + r.status);
    oauthUpsertToken(provider, {
      accessToken: j.access_token,
      refreshToken: j.refresh_token || rec.refreshToken,
      expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : null,
    });
    return { ok:true };
  } catch(e){
    logLine("oauth", "refresh " + provider + ": " + ((e && e.message) || e));
    oauthNotify({ provider, ok:false, error:((e && e.message) || String(e)) });
    return { ok:false, error:((e && e.message) || String(e)) };
  } finally { clearTimeout(t); }
}
async function oauthSweepRefresh(){
  try{
    const store = oauthLoadStore();
    const now = Date.now();
    for (const [provider, rec] of Object.entries(store)){
      if (rec.expiresAt && rec.refreshToken && (rec.expiresAt - now) < OAUTH_REFRESH_MARGIN){
        await oauthRefreshProvider(provider);
      }
    }
  }catch(e){ logLine("oauth", "sweep: " + ((e && e.message) || e)); }
}
function startOAuthRefresher(){
  if (oauthRefreshTimer) return;
  oauthRefreshTimer = setInterval(oauthSweepRefresh, OAUTH_REFRESH_INTERVAL);
  if (oauthRefreshTimer && typeof oauthRefreshTimer.unref === "function") oauthRefreshTimer.unref();
  const first = setTimeout(oauthSweepRefresh, 30 * 1000);
  if (first && typeof first.unref === "function") first.unref();
}
ipcMain.handle("oauth-begin", (e, cfg) => {
  assertTrustedSender(e);
  try{
    if(!cfg || typeof cfg !== "object") return { ok:false, error:"invalid cfg" };
    const { provider, authorizeUrl, tokenUrl, clientId, clientSecret, scope, usePkce } = cfg;
    if(!provider || !authorizeUrl || !tokenUrl || !clientId) return { ok:false, error:"missing fields" };
    oauthPruneStates();
    const state = crypto.randomUUID();
    const rec = { provider, tokenUrl, clientId, clientSecret: clientSecret || null, scope: scope || null, createdAt: Date.now(), codeVerifier: null };
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: "http://127.0.0.1:" + syncPort + "/oauth/callback",
      state,
    });
    if (scope) params.set("scope", scope);
    if (usePkce){
      const verifier = b64url(crypto.randomBytes(48));
      const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
      rec.codeVerifier = verifier;
      params.set("code_challenge", challenge);
      params.set("code_challenge_method", "S256");
    }
    oauthStates.set(state, rec);
    const url = authorizeUrl + (authorizeUrl.includes("?") ? "&" : "?") + params.toString();
    // 系统浏览器打开授权页；shell 缺失（测试 stub）时返回 url 由渲染层自行 window.open
    let opened = false;
    try{ if (shell && typeof shell.openExternal === "function"){ shell.openExternal(url); opened = true; } }catch(e2){}
    return { ok:true, state, url, opened };
  }catch(err){ return { ok:false, error:((err && err.message) || String(err)) }; }
});
ipcMain.handle("oauth-tokens", (e, provider) => {
  assertTrustedSender(e);
  const store = oauthLoadStore();
  const rec = store[provider];
  if (!rec || !rec.accessToken) return { ok:false, error:"not connected" };
  return { ok:true, token:{ accessToken: rec.accessToken, expiresAt: rec.expiresAt || null, scope: rec.scope || null, updatedAt: rec.updatedAt || null } };
});
ipcMain.handle("oauth-list", (e) => {
  assertTrustedSender(e);
  const store = oauthLoadStore();
  const out = {};
  for (const [k, v] of Object.entries(store)){
    out[k] = { connected: !!v.accessToken, expiresAt: v.expiresAt || null, updatedAt: v.updatedAt || null };
  }
  return { ok:true, providers: out };
});
ipcMain.handle("oauth-refresh", (e, provider) => {
  assertTrustedSender(e);
  return oauthRefreshProvider(provider);
});
ipcMain.handle("oauth-revoke", (e, provider) => {
  assertTrustedSender(e);
  const store = oauthLoadStore();
  if (store[provider]){
    delete store[provider];
    oauthTokenCache = store;
    oauthSaveStore();
  }
  return { ok:true };
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else if (win){ win.show(); win.focus(); }
});

app.on("before-quit", () => { willQuit = true; stopSyncServer(); });
