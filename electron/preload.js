// 预加载脚本：在 contextIsolation 安全策略下，向页面暴露最小且明确的 API。
// 提供开机自启、AI 配置读写的统一入口；AI Key 仅存主进程，经 IPC 委托请求。
const { contextBridge, ipcRenderer } = require("electron");

// 注意：sandbox:true 下 preload 只能 require electron 的有限子集（无 app）。
// 版本号改由主进程经 IPC 提供，避免 app.getVersion() 抛错导致整个 API 失效。
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  version: () => ipcRenderer.invoke("get-version"),
  isPackaged: () => ipcRenderer.invoke("get-packaged"),
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),
  setAutoLaunch: (on) => ipcRenderer.send("set-auto-launch", on),
  // P0-3：AI 配置与代理（Key 仅存主进程，渲染进程经 IPC 委托请求，规避 CORS + Key 暴露）
  getAiConfig: () => ipcRenderer.invoke("get-ai-config"),
  setAiConfig: (cfg) => ipcRenderer.invoke("set-ai-config", cfg),
  chat: (arg) => ipcRenderer.invoke("chat", arg)
});
