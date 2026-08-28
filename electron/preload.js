// 预加载脚本：在 contextIsolation 安全策略下，向页面暴露最小且明确的 API。
// 提供开机自启、AI 配置读写的统一入口；AI Key 仅存主进程，经 IPC 委托请求。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),
  setAutoLaunch: (on) => ipcRenderer.send("set-auto-launch", on),
  // P0-3：AI 配置与代理（Key 仅存主进程，渲染进程经 IPC 委托请求，规避 CORS + Key 暴露）
  // F3：setAiConfig 接收 { enabled, profiles: [{id, base, model, key?}] }——
  //     key 省略/空串=保留既有，key===null=清除；getAiConfig 返回 { enabled, profiles: [{id, base, model, keySet}] }（不含明文）
  getAiConfig: () => ipcRenderer.invoke("get-ai-config"),
  setAiConfig: (cfg) => ipcRenderer.invoke("set-ai-config", cfg),
  // chat 参数原样透传；F3：新增 profileId 字段（当前激活 profile 的 id，主进程据此取 base/model/key）
  chat: (arg) => ipcRenderer.invoke("chat", arg),
  // P1-1：取消进行中的 AI 请求（主进程 fetch 对应 AbortController）
  abortChat: () => ipcRenderer.send("abort-chat"),
  // P0-8：局域网同步（Electron 专属）
  syncGet: () => ipcRenderer.invoke("sync-get"),
  syncUpload: (data) => ipcRenderer.invoke("sync-upload", data),
  onSyncUploadRequest: (cb) => {
    ipcRenderer.on("sync-upload-request", (_, data) => cb(data));
  },
  offSyncUploadRequest: (cb) => {
    ipcRenderer.removeListener("sync-upload-request", cb);
  },
  // B3：OAuth 轻后端（九大集成授权；token 仅存主进程加密落盘，渲染层按需取用）
  oauthBegin: (cfg) => ipcRenderer.invoke("oauth-begin", cfg),
  oauthTokens: (provider) => ipcRenderer.invoke("oauth-tokens", provider),
  oauthList: () => ipcRenderer.invoke("oauth-list"),
  oauthRefresh: (provider) => ipcRenderer.invoke("oauth-refresh", provider),
  oauthRevoke: (provider) => ipcRenderer.invoke("oauth-revoke", provider),
  onOauthStatus: (cb) => { ipcRenderer.on("oauth-status", (_, data) => cb(data)); },
  offOauthStatus: (cb) => { ipcRenderer.removeListener("oauth-status", cb); }
});
