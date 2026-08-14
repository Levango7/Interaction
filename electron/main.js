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
    ipcMain.handle("get-ai-config", () => {
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
