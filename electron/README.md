# Agent 工作台 · Electron 封装

把单文件 `agent-workbench.html` 套壳成真正的 Windows 独立 `.exe`。

> 项目总文档（架构 / 三形态运行 / 功能 / 数据安全 / 构建）见仓库根目录 **[README.md](../README.md)**，本文件只聚焦桌面封装细节。

## 目录关系
```
workspace/
├── agent-workbench.html      ← 工作台本体（与仓库内同一个文件）
└── electron/
    ├── main.js               ← 窗口与主进程
    ├── preload.js            ← 安全预加载脚本
    ├── package.json          ← 依赖与打包配置
    └── README.md
```

`main.js` 默认加载 `../agent-workbench.html`（即仓库根目录那份），
保持桌面端 / Edge 启动器 / Electron 三处共用同一份 HTML，避免多份漂移。

## 本地构建（需联网，下载 Electron 二进制约 100MB+）
```bash
cd electron
npm install          # 安装 electron + electron-builder（首次需联网）
npm start            # 开发预览，直接起一个原生窗口
npm run dist         # 打包成 Windows 安装包（dist/*.exe，NSIS）
```

## 说明
- `npm install` / `npm run dist` 都需要网络下载 Electron 及其构建依赖，
  沙箱环境无法代跑，请在本地 Windows 上执行。
- 打包产物在 `electron/dist/`，双击安装即可，数据与浏览器版一样存于本机。
- 如需自定义图标，放一个 `icon.ico` 并在 `package.json` 的 `win.icon` 指过去。
- 仍想零安装？回到根目录双击 `启动Agent工作台.bat`（Edge `--app` 模式）即可，
  体验几乎一致，只是窗口由 Edge 托管而非独立 exe。

## 系统托盘 + 开机自启
打包后的 exe 具备完整的桌面端能力：

- **系统托盘**：启动后 Windows 右下角出现「Agent 工作台」托盘图标（图标由 `main.js` 内联生成，零外部文件）。
  - 左键点击托盘图标：窗口隐藏时显示并聚焦，已显示时隐藏。
  - 右键菜单：显示窗口 / 隐藏窗口 / 退出。
  - 关闭窗口默认**最小化到托盘**（不退出），只有托盘菜单的「退出」才真正退出。
- **开机自启**：在 HTML 设置抽屉（齿轮图标）中出现「开机自动启动」开关（仅检测到桌面端时显示）。
  - 开关通过 `preload.js` 暴露的 `window.electronAPI` 经 IPC 调用 `app.setLoginItemSettings`，
    真实写入系统开机启动项，勾选后下次登录自动拉起工作台。
  - 浏览器版 / Edge 启动器版没有该 API，开关自动隐藏，互不影响。

> 桌面端进阶能力（托盘、自启、本地文件读写）依赖 Electron 主进程，沙箱环境无法代跑，
> 请在本机 `npm install && npm run dist` 后体验。

## 打包注意事项
`package.json` 的 `build.files` 采用显式白名单 `["main.js", "preload.js", "package.json", "agent-workbench.html"]`，
其中 `agent-workbench.html` 由 `prebuild` 脚本在打包前从仓库根目录复制进来；
`main.js` 的 `resolveHtml()` 打包态优先读同目录 `agent-workbench.html`，开发态回退到 `../agent-workbench.html`，
两种路径都能正确加载同一份 HTML。

## 自动更新
集成 `electron-updater`，启动时自动检查是否有新版本，发现新版本通知用户（**不自动下载**，由用户手动决定是否更新）。

### 工作原理
1. 应用启动后（仅打包态），主进程向 feed 服务器请求 `latest.yml`（electron-builder 自动生成的版本清单）。
2. 把清单里的版本号与本地 `package.json` 的 `version` 比对，若服务器版本更高，触发 `update-available` 事件。
3. 主进程把更新信息通过 `win.webContents.send("update-available", info)` 推给渲染进程，由前端 UI 决定如何提示用户。
4. `autoDownload = false`：**不会**自动下载安装包，避免打断用户；用户确认后再调用下载（前端可后续扩展）。
5. 任何更新错误（网络不通、服务器未配置、签名校验失败等）均**静默忽略**，不影响应用正常启动与使用。

### 配置 feed 服务器
`package.json` 已写入占位配置：
```json
"build": {
  "publish": {
    "provider": "generic",
    "url": "https://your-update-server.com/agent-workbench/"
  }
}
```
把 `url` 改成你自己的静态服务器地址（OSS / S3 / 自建 nginx 均可），该目录需要能公开访问 `latest.yml` 和安装包 `.exe`。例如：
```json
"url": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/agent-workbench/"
```

### 发布新版本
1. 改 `package.json` 的 `version`（如 `"1.0.1"`）。
2. 在 `electron/` 目录执行 `npm run dist`，生成新安装包与 `latest.yml`。
3. 把 `electron/dist/` 下的最新 `*.exe`（含 `latest.yml`）上传到 feed 服务器对应目录。
4. 用户下次启动旧版本时即会收到新版本通知。

### 开发态行为
`npm start` 运行时 `app.isPackaged === false`，**不会**检查更新（跳过整个更新逻辑），避免开发时误连 feed 服务器。未配置服务器前，更新检查会静默失败，应用一切功能照常。
