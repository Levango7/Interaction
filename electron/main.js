const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, safeStorage } = require("electron");
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
  const W = 32, H = 32;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++){
    raw[y * (W * 4 + 1)] = 0; // 每行过滤字节
    for (let x = 0; x < W; x++){
      const o = y * (W * 4 + 1) + 1 + x * 4;
      raw[o] = 0x00; raw[o + 1] = 0x67; raw[o + 2] = 0xc0; raw[o + 3] = 255; // #0067c0
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
    title: "Agent 工作台",
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

  // 窗口就绪后注入 Electron 环境标记，供 Web 版检测运行环境（禁用 SW 注册等）
  // 守卫：测试 mock 的 BrowserWindow 实例无 webContents，避免破坏 IPC 单测
  if (win.webContents && typeof win.webContents.executeJavaScript === "function"){
    win.webContents.on("did-finish-load", () => {
      try { win.webContents.executeJavaScript("window.__ELECTRON__=true").catch(() => {}); }
      catch (e) { /* 注入失败不影响主功能 */ }
    });
  }

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
      label: app.name || "Agent 工作台",
      submenu: [
        { role: "about", label: "关于 Agent 工作台" },
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

  // 视图菜单：重载 / 强制重载 / 开发者工具 / 全屏
  template.push({
    label: "视图",
    submenu: [
      { role: "reload", label: "重载" },
      { role: "forceReload", label: "强制重载" },
      { role: "toggleDevTools", label: "开发者工具" },
      { type: "separator" },
      { role: "resetZoom", label: "重置缩放" },
      { role: "zoomIn", label: "放大" },
      { role: "zoomOut", label: "缩小" },
      { type: "separator" },
      { role: "togglefullscreen", label: "全屏" }
    ]
  });

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
  tray.setToolTip("Agent 工作台");
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

function loadAiConfig(){
  try{
    const p = aiConfigPath();
    if(!fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    // 优先 safeStorage（真实加密）
    if(safeStorage && safeStorage.isEncryptionAvailable()){
      try{ return JSON.parse(safeStorage.decryptString(buf)); }
      catch(e){ /* 可能是旧格式或文件损坏 → 尝试迁移 */ }
    }
    // 迁移旧格式（成功则用新格式重写）
    const legacy = legacyDecrypt(buf);
    saveAiConfig(legacy);
    return legacy;
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

/* ---------- 开机自启（由设置抽屉开关控制） ---------- */
ipcMain.handle("get-auto-launch", () => {
  try { return !!app.getLoginItemSettings().openAtLogin; } catch (e) { return false; }
});
ipcMain.on("set-auto-launch", (e, on) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!on, path: app.getPath("exe"), args: [] });
  } catch (e) { /* 忽略权限错误 */ }
});

// 供 preload 在 sandbox 下取元信息（sandbox:true 时 preload 无法访问 app）
ipcMain.handle("get-version", () => app.getVersion());
ipcMain.handle("get-packaged", () => app.isPackaged);

// Windows 下确保任务栏分组 / 通知正确归属
app.setAppUserModelId("com.agent.workbench");

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
    ipcMain.handle("set-ai-config", (e, incoming) => {
      if(!incoming || typeof incoming !== "object") return { ok:false };
      const cur = loadAiConfig() || {};
      const next = {
        base:    typeof incoming.base    === "string" ? incoming.base    : (cur.base    || ""),
        model:   typeof incoming.model   === "string" ? incoming.model   : (cur.model   || ""),
        enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : !!cur.enabled
      };
      if(typeof incoming.key === "string" && incoming.key) next.key = incoming.key; // 空/undefined → 保留既有
      saveAiConfig(next);
      return { ok:true };
    });
    ipcMain.handle("get-ai-config", () => {
      const c = loadAiConfig() || {};
      return { base: c.base||"", model: c.model||"", enabled: !!c.enabled, keySet: !!(c.key && c.key.length) };
    });
    ipcMain.handle("chat", async (e, arg) => {
      const cfg = loadAiConfig();
      if(!cfg || !cfg.key) throw new Error("AI 未配置：请先在设置中填写 API Key");
      const base = (cfg.base || "https://api.openai.com/v1").replace(/\/+$/,"");
      const body = {
        model: (arg && typeof arg.model === "string" && arg.model) ? arg.model : (cfg.model || "gpt-4o-mini"),
        messages: (arg && Array.isArray(arg.messages)) ? arg.messages : [],
        temperature: 0.7
      };
      if(arg && Array.isArray(arg.tools)) body.tools = arg.tools;
      if(arg && arg.tool_choice) body.tool_choice = arg.tool_choice;
      let lastErr = null;
      for(let attempt = 0; attempt < 3; attempt++){
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        try{
          const r = await fetch(base + "/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.key },
            body: JSON.stringify(body),
            signal: ctrl.signal
          });
          clearTimeout(timer);
          if(!r.ok){
            if(r.status === 401) throw new Error("API Key 无效，请检查设置中的 Key");
            if(r.status === 429){ lastErr = new Error("请求过于频繁，稍后重试"); await sleep(1000 * (attempt + 1)); continue; }
            if(r.status >= 500){ lastErr = new Error("服务异常，请稍后重试"); await sleep(1000 * (attempt + 1)); continue; }
            throw new Error("API 返回错误：" + r.status);
          }
          return await r.json();
        }catch(err){
          clearTimeout(timer);
          if(err && err.name === "AbortError") throw new Error("请求超时（30 秒），请检查网络或上游服务");
          if(err && err.message && (err.message.indexOf("API Key") >= 0 || err.message.indexOf("服务异常") >= 0 || err.message.indexOf("API 返回错误") >= 0)) throw err;
          if(attempt < 2){ await sleep(500 * (attempt + 1)); continue; }
          throw new Error("请求失败：" + (err && err.message ? err.message : String(err)));
        }
      }
      throw lastErr || new Error("请求失败");
    });

    // 自动更新：仅打包态加载 electron-updater，静默失败，不自动下载（用户手动决定）
    if (app.isPackaged){
      try {
        const { autoUpdater } = require("electron-updater");
        autoUpdater.autoDownload = false;
        autoUpdater.on("update-available", (info) => {
          if (win){ win.webContents.send("update-available", info); }
        });
        autoUpdater.on("error", () => { /* 静默，不打扰用户 */ });
        autoUpdater.checkForUpdates().catch(() => {});
      } catch (e) { /* electron-updater 未装时静默 */ }
    }
  });
}

// 保留托盘存活：关掉所有窗口不退出
app.on("window-all-closed", () => { /* 不退出，托盘常驻 */ });

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else if (win){ win.show(); win.focus(); }
});

app.on("before-quit", () => { willQuit = true; });
