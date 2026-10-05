const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, safeStorage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const os = require("os");


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
/* v1.11.1 [M4]：IPC sender 信任校验——仅接受来自本应用页面的调用，
 * 远程/未知来源一律拒绝。senderFrame 在 ipcMain 事件上始终存在；缺失即视为不可信（fail-closed）。
 *
 * v3.7.59：判定口径收紧为与导航守卫**同源**（复用 _isInternalUrl）。
 * 此前只校验 `file://` 前缀，而 _isInternalUrl 已因「任意本地 HTML 一旦被导航/新窗口打开，
 * 就处在带 preload 的窗口里 = 直接拿到 window.electronAPI（可读 AI 配置等）」而收紧成
 * 「本应用自己的页面 + about:blank」。两处口径不一致时，IPC 侧的宽松判定就是那条最短路径。
 * 现在两者共用一份白名单：
 *   · 本应用页面（打包：与 main.js 同目录；开发：仓库根）→ 放行
 *   · about:blank（报表打印窗口 window.open("") + document.write 依赖它）→ 放行
 *   · 其余一切（含**非本应用**的 file://）→ 拒绝
 * 注：_isInternalUrl / _APP_FILES 定义在本函数之后，但函数声明提升 + 二者仅在 IPC 运行时
 * 被调用（那时顶层已执行完毕，const 已完成初始化），故不存在 TDZ 问题。 */
function assertTrustedSender(e){
  let url = "";
  try{ url = (e && e.senderFrame && e.senderFrame.url) || ""; }catch(err){ url = ""; }
  if(typeof _isInternalUrl === "function" && _isInternalUrl(url)) return;
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
/* 本应用自己的页面文件（打包：与 main.js 同目录；开发：上一级仓库根） */
const _APP_FILES = new Set([
  path.join(__dirname, "agent-workbench.html"),
  path.resolve(__dirname, "..", "agent-workbench.html"),
  path.resolve(__dirname, "..", "index.html"),
].map(function(p){ return path.resolve(p).toLowerCase(); }));
/* v3.7.52：收紧「内部页面」判定——原实现把**任意 file:** 都当内部页面放行，而 IPC 侧
 * assertTrustedSender 也只校验 file:// 前缀（见其上方注释），两者叠加后：任意本地 HTML 一旦被
 * 导航或新窗口打开，就处在带 preload 的窗口里 = 直接拿到 window.electronAPI（可读 AI 配置等）。
 * 现只认本应用自己的页面 + about:blank（报表打印窗口 window.open("") 依赖它）。 */
function _isInternalUrl(url){
  try{
    const u = new URL(url);
    if (u.protocol === "about:") return true;
    if (u.protocol !== "file:") return false;
    let fp = decodeURIComponent(u.pathname || "");
    /* v3.7.61 跨平台修复：Windows 的 file URL 形如 /C:/...（前导斜杠须去掉才是合法盘符路径）；
     * POSIX 绝对路径必须以 / 开头——此前无条件剥掉前导斜杠，Linux 下 resolve 会把
     * "home/runner/..." 当相对路径拼到 cwd 上，本应用自己的页面都判为外部来源（CI 实测复现）。 */
    if (/^\/[A-Za-z]:/.test(fp)) fp = fp.replace(/^\/+/, "");
    return _APP_FILES.has(path.resolve(fp).toLowerCase());
  }catch(e){ return false; }
}
/* v3.7.52：外链一律走协议白名单——openExternal 会把 URL 原样交给系统处理器，不限协议即可触达
 * ms-msdt: / search-ms: / vbscript: 一类本机协议处理器。放行 http/https/file（file 交给系统浏览器打开
 * 不经过本应用的 preload，与"内部页面"是两回事），其余拒绝。 */
function _openExternalSafe(url){
  try{
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "file:") return false;
    shell.openExternal(url).catch(() => {});
    return true;
  }catch(e){ return false; }
}
app.on("web-contents-created", (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (_isInternalUrl(url)) return { action: "allow" };
    _openExternalSafe(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (e, url) => {
    if (!_isInternalUrl(url)){
      e.preventDefault();
      _openExternalSafe(url);
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
    createWindow();
    createTray();
    applyAppMenu();

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

    /* 群机器人 webhook 外发（v3.7.66）。为什么必须在主进程发：
       真实网络实测（带 Origin 头打预检与实际 POST）——
         · 钉钉 oapi.dingtalk.com：预检 200 但**不回任何 Access-Control-Allow-Origin**，POST 响应同样没有；
         · 企业微信 qyapi.weixin.qq.com：预检直接 403；
         · 飞书 open.feishu.cn：预检与 POST 都给 `ACAO: *`，浏览器可用。
       webhook 是 `Content-Type: application/json` 的 POST，必触发预检；本窗口是
       `sandbox:true` 且没关 `webSecurity`（见 createWindow 的 webPreferences），渲染进程走的就是
       Chromium 网络栈 → 钉钉在桌面版渲染进程里同样发不出去。只有 Node 侧 fetch 无 CORS 约束。
       安全边界：只放行公开 webhook 主机白名单 + 强制 https + 拒 userinfo；
       日志只记主机与状态码，**绝不记 access_token / sign / 消息正文**。 */
    const NOTIFY_WEBHOOK_HOSTS = ["oapi.dingtalk.com", "open.feishu.cn", "qyapi.weixin.qq.com", "hooks.slack.com"];
    function _notifyHostOf(raw){
      try{ return new URL(String(raw)).hostname.toLowerCase(); }catch(err){ return ""; }
    }
    function isSafeNotifyWebhookUrl(raw){
      let u;
      try{ u = new URL(String(raw)); }catch(err){ return false; }
      if(u.protocol !== "https:") return false;
      if(u.username || u.password) return false;
      return NOTIFY_WEBHOOK_HOSTS.indexOf(u.hostname.toLowerCase()) >= 0;
    }
    ipcMain.handle("notify-send", async (e, arg) => {
      assertTrustedSender(e);
      const url = arg && arg.url;
      const payload = arg && arg.payload;
      const host = _notifyHostOf(url);
      if(!isSafeNotifyWebhookUrl(url)) return { ok: false, status: 0, error: "unsafe_webhook_url" };
      if(!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, status: 0, error: "bad_payload" };
      const ctrl = new AbortController();
      const tmo = _outboundTimeout(arg && arg.timeoutMs, 8000);
      const timer = setTimeout(() => ctrl.abort(), tmo);
      try{
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        let body = null;
        try{ body = await r.json(); }catch(err2){ /* 非 JSON 响应：交回状态码判定 */ }
        logLine("notify", "host=" + host + " status=" + r.status);
        return { ok: !!r.ok, status: r.status, body: body };
      }catch(err){
        clearTimeout(timer);
        const msg = (err && err.name === "AbortError") ? ("请求超时（" + tmo + "ms）") : ((err && err.message) || String(err));
        logLine("notify", "host=" + host + " error=" + msg);
        return { ok: false, status: 0, error: msg };
      }
    });

    /* ---------- v3.7.79：Jira 请求主进程中转 ----------
       为什么必须中转：Atlassian 的 REST 端点不回 CORS 头（`_probe/cors-matrix-providers.mjs`
       实测 file:// 与 http(s) 双双被拦、主进程 Node fetch 可达）—— 浏览器形态连验证都发不出去。
       安全边界（这条 IPC = 让渲染进程驱动主进程带 Bearer token 访问网站，白名单是承重墙）：
         · 域名**精确**匹配 `<子域>.atlassian.net`（拒 evil.atlassian.net.evil.com / 裸 atlassian.net /
           拒绝任意其它主机）；路径必须 /rest/ 开头（只放 REST 面）；
         · 方法白名单 GET/POST/PUT/DELETE；body ≤ 2MB；超时钳 1–20s；
         · 日志只记主机与状态码，**绝不记 token 与正文**；
         · assertTrustedSender 与 chat / notify-send 同一道门。 */
    const JIRA_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.atlassian\.net$/;
    ipcMain.handle("jira-fetch", async (e, arg) => {
      assertTrustedSender(e);
      const domain = String((arg && arg.domain) || "").toLowerCase();
      const reqPath = String((arg && arg.path) || "");
      const method = String((arg && arg.method) || "GET").toUpperCase();
      const token = String((arg && arg.token) || "");
      const body = (arg && typeof arg.body === "string") ? arg.body : "";
      if(!JIRA_DOMAIN_RE.test(domain)) return { ok: false, status: 0, error: "bad_domain" };
      if(!/^\/rest\//.test(reqPath)) return { ok: false, status: 0, error: "bad_path" };
      if(["GET", "POST", "PUT", "DELETE"].indexOf(method) < 0) return { ok: false, status: 0, error: "bad_method" };
      if(!token) return { ok: false, status: 0, error: "no_token" };
      if(body.length > _OUTBOUND_MAX_BODY) return { ok: false, status: 0, error: "body_too_large" };
      const tmo = _outboundTimeout(arg && arg.timeoutMs, 15000);
      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), tmo);
      try{
        const r2 = await fetch("https://" + domain + reqPath, {
          method: method,
          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" },
          body: method === "GET" ? undefined : body,
          signal: ctrl2.signal
        });
        clearTimeout(timer2);
        let jb = null;
        try{ jb = await r2.json(); }catch(err3){ /* 非 JSON 响应：交回状态码判定 */ }
        logLine("jira", "host=" + domain + " status=" + r2.status);
        return { ok: !!r2.ok, status: r2.status, body: jb };
      }catch(err){
        clearTimeout(timer2);
        const msg2 = (err && err.name === "AbortError") ? ("请求超时（" + tmo + "ms）") : ((err && err.message) || String(err));
        logLine("jira", "host=" + domain + " error=" + msg2);
        return { ok: false, status: 0, error: msg2 };
      }
    });

    /* v1.11.1 [M5]：electron-updater 更新链路已整体移除——三处断点（portable 目标不支持
     * 自动更新 / 无 publish 配置 / 渲染端 preload 无 update-available 监听）使其从未可用。
     * 分发形态维持 portable + 手动下载：更新 = 从 GitHub Releases 重新下载。 */
  });
}

// 保留托盘存活：关掉所有窗口不退出
app.on("window-all-closed", () => { /* 不退出，托盘常驻 */ });

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else if (win){ win.show(); win.focus(); }
});

app.on("before-quit", () => { willQuit = true; });

/* ============================================================
 * v3.7.90：主进程「外发通道」的公共常量与助手 + 新增通道检查清单
 * ------------------------------------------------------------
 * 本文件现有 5 条具备外发能力的 IPC：
 *   chat · notify-send · jira-fetch · ics-fetch · webdav-fetch
 * 其中 notify/jira/ics/webdav 是 v3.7.66 之后陆续加的，共同特征是
 * 「目标站不回 CORS 头，渲染进程发不出去，只能由 Node 侧代发」。
 * 每条各自的校验都是齐的，但**口径分散在各处**：将来再加第六条时，
 * 很容易漏掉其中某一项 —— 而这类遗漏在测试里只覆盖被写到的那几条通道。
 *
 * 因此：① 把**完全同构**的部分（体积上限、超时钳制）收成公共常量与助手；
 *      ② 把「新通道必须逐项声明」的检查清单固定在这里。
 * **刻意不动**各通道的错误码与校验顺序 —— 它们被 57 条 IPC 测试逐字断言，
 * 重构收益（可维护性）不值当用「改坏安全路径」的风险去换。
 *
 * ⚠️ 作用域坑（2026-10-05 实测踩到）：这几个助手**必须放在模块顶层**。
 *    ics-fetch / webdav-fetch 的 handler 注册在 `app.on("before-quit")` 之后（模块顶层），
 *    而 notify-send / jira-fetch 注册在 `app.whenReady()` 回调里。首版把常量放进 whenReady 内，
 *    顶层那两个 handler 直接 ReferenceError —— 被 5 条既有 IPC 测试当场抓出。
 *    （同理 `_netHostForbidden` 也必须在顶层：它被 ics/webdav 两个顶层 handler 使用。）
 *
 * 新增一条外发通道时，逐项确认：
 *   □ 入口第一行 `assertTrustedSender(e)`（fail-closed）
 *   □ 协议：https 必；如需放行本机（如 chat 的 localhost）要显式声明并说明理由
 *   □ 拒 userinfo（`u.username || u.password`）—— 防 `https://trusted.com@evil`
 *   □ 主机白名单或拒私网：`_netHostForbidden()` 挡回环/私网/链路本地/.local
 *   □ `redirect: "error"` —— 防 302 跳内网绕过主机校验
 *   □ 体积封顶：请求体与响应体都用 `_OUTBOUND_MAX_BODY`
 *   □ 超时钳制：`_outboundTimeout(ms, 默认值)`
 *   □ 方法白名单（若支持写操作）
 *   □ 日志只记主机与状态码，**绝不记凭据与正文**
 * ============================================================ */
/** 外发请求体 / 响应体的统一体积上限（2MB） */
const _OUTBOUND_MAX_BODY = 2 * 1024 * 1024;
/** 超时钳制：下限 1s、上限 20s；未传时用调用方给的默认值 */
function _outboundTimeout(ms, defMs){
  return Math.min(Math.max(Number(ms) || defMs, 1000), 20000);
}

/* ---------- v3.7.84：ICS 订阅只读中转（主机防线与 v3.7.87 的 webdav-fetch 共享） ----------
   多数日历站不回 CORS 头（桌面特色体：sandbox + webSecurity 默认开），订阅拉取要走主进程。
   与 jira-fetch 同为「用户自填 URL」类接口，安全面按开放 SSRF 取严：
     · 只 https、拒 userinfo；
     · 拒回环 / 私网 / 链路本地 / .local / localhost（防误扫内网与云元数据）；
     · redirect:"error"（防 302 跳内网绕过校验）；
     · 不携带任何认证头（ICS 为公开只读）；URL 只由用户自己填写；
     · ≤2MB、12s 超时、日志只记主机与状态码。 */
function _netHostForbidden(host){
      const h = String(host || "").toLowerCase();
      if(!h) return true;
      if(h === "localhost" || /\.local$/.test(h) || /\.localhost$/.test(h) || /\.internal$/.test(h)) return true;
      if(/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h)) return true;
      const p2 = /^172\.(\d+)\./.exec(h);
      if(p2 && +p2[1] >= 16 && +p2[1] <= 31) return true;
      if(/^\[?::1\]?$/.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return true;
      return false;
    }
    ipcMain.handle("ics-fetch", async (e, arg) => {
      assertTrustedSender(e);
      let u;
      try{ u = new URL(String((arg && arg.url) || "")); }catch(err){ return { ok: false, status: 0, error: "bad_url" }; }
      if(u.protocol !== "https:") return { ok: false, status: 0, error: "https_only" };
      if(u.username || u.password) return { ok: false, status: 0, error: "userinfo_forbidden" };
      if(_netHostForbidden(u.hostname)) return { ok: false, status: 0, error: "forbidden_host" };
      const headers = { "Accept": "text/calendar, text/plain;q=0.9" };
      if(arg && arg.etag) headers["If-None-Match"] = String(arg.etag);
      if(arg && arg.lastModified) headers["If-Modified-Since"] = String(arg.lastModified);
      const ctrl3 = new AbortController();
      const timer3 = setTimeout(() => ctrl3.abort(), 12000);
      try{
        const r3 = await fetch(u.href, { method: "GET", headers: headers, redirect: "error", signal: ctrl3.signal });
        clearTimeout(timer3);
        const et3 = r3.headers.get("etag") || "";
        const lm3 = r3.headers.get("last-modified") || "";
        logLine("ics", "host=" + u.hostname + " status=" + r3.status);
        if(r3.status === 304) return { ok: true, status: 304, notModified: true, etag: et3, lastModified: lm3 };
        if(!r3.ok) return { ok: false, status: r3.status, error: "HTTP " + r3.status };
        const buf3 = Buffer.from(await r3.arrayBuffer());
        if(buf3.length > _OUTBOUND_MAX_BODY) return { ok: false, status: r3.status, error: "too_large" };
        return { ok: true, status: r3.status, etag: et3, lastModified: lm3, text: buf3.toString("utf8") };
      }catch(err){
        clearTimeout(timer3);
        const msg3 = (err && err.name === "AbortError") ? "请求超时（12000ms）" : ((err && err.message) || String(err));
        logLine("ics", "host=" + u.hostname + " error=" + msg3);
        return { ok: false, status: 0, error: msg3 };
      }
    });

    /* ---------- v3.7.87：WebDAV 云同步中转（坚果云等；国内直连可达） ----------
       实测（`_probe/webdav-probe.mjs`）：dav.jianguoyun.com 可达（401 + Basic realm="nutstore"）
       但**无 ACAO** → 浏览器直连被 CORS 拦，桌面版必须经主进程。与 ics-fetch 同一套防线：
         · URL https 必、拒 userinfo（Authorization 单独走参数）；
         · 拒回环/私网/链路本地/.local（共用 _netHostForbidden）；
         · redirect:"error"（防跳内网）；方法白名单 PROPFIND/GET/PUT/DELETE/MKCOL；
         · body ≤ 2MB、超时钳 1–20s；日志只记主机与方法状态码，**绝不记 Authorization**。
       ETag 原样回传（渲染层据此做 If-Match 冲突检测 —— 第一个真正的冲突信号）。 */
    ipcMain.handle("webdav-fetch", async (e, arg) => {
      assertTrustedSender(e);
      let u;
      try{ u = new URL(String((arg && arg.url) || "")); }catch(err){ return { ok: false, status: 0, error: "bad_url" }; }
      if(u.protocol !== "https:") return { ok: false, status: 0, error: "https_only" };
      if(u.username || u.password) return { ok: false, status: 0, error: "userinfo_forbidden" };
      if(_netHostForbidden(u.hostname)) return { ok: false, status: 0, error: "forbidden_host" };
      const method = String((arg && arg.method) || "GET").toUpperCase();
      if(["PROPFIND", "GET", "PUT", "DELETE", "MKCOL"].indexOf(method) < 0) return { ok: false, status: 0, error: "bad_method" };
      const body = (arg && typeof arg.body === "string") ? arg.body : "";
      if(body.length > _OUTBOUND_MAX_BODY) return { ok: false, status: 0, error: "body_too_large" };
      const headers = {};
      if(arg && arg.auth) headers["Authorization"] = String(arg.auth);      /* Basic 应用密码，仅本次调用传递 */
      if(arg && arg.depth) headers["Depth"] = String(arg.depth);
      if(arg && arg.ifNoneMatch) headers["If-None-Match"] = String(arg.ifNoneMatch);
      if(arg && arg.ifMatch) headers["If-Match"] = String(arg.ifMatch);
      if(arg && arg.range) headers["Range"] = String(arg.range);
      const ctrl4 = new AbortController();
      const timer4 = setTimeout(() => ctrl4.abort(), 15000);
      try{
        const r4 = await fetch(u.href, { method: method, headers: headers, body: (method === "GET" || method === "PROPFIND") ? undefined : body, redirect: "error", signal: ctrl4.signal });
        clearTimeout(timer4);
        const et4 = r4.headers.get("etag") || "";
        const lm4 = r4.headers.get("last-modified") || "";
        logLine("webdav", "host=" + u.hostname + " method=" + method + " status=" + r4.status);
        if(method === "PROPFIND"){
          /* 207 Multi-Status：判定可达即成功（能否读写交由真实 PUT/GET 验证） */
          if(r4.status === 207 || r4.status === 200) return { ok: true, status: r4.status, etag: et4, lastModified: lm4 };
          return { ok: false, status: r4.status, error: "HTTP " + r4.status };
        }
        let text = "";
        if(method === "GET" && r4.status === 200){ try{ text = await r4.text(); }catch(err4){ text = ""; } }
        /* 412 = ETag 冲突：早返回也要带 conflict 标记（渲染层据此不覆盖他人文件） */
        if(!r4.ok && r4.status !== 204 && r4.status !== 207) return { ok: false, status: r4.status, error: "HTTP " + r4.status, etag: et4, lastModified: lm4, conflict: r4.status === 412 };
        /* 412 = ETag 冲突（云端已被别处改过）：如实回传，交渲染层决策，不静默覆盖 */
        return { ok: true, status: r4.status, etag: et4, lastModified: lm4, text: text, conflict: r4.status === 412 };
      }catch(err){
        clearTimeout(timer4);
        const msg4 = (err && err.name === "AbortError") ? "请求超时（15000ms）" : ((err && err.message) || String(err));
        logLine("webdav", "host=" + u.hostname + " error=" + msg4);
        return { ok: false, status: 0, error: msg4 };
      }
    });
