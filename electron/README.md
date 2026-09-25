# Agent 工坊 · Electron 封装

把单文件 `agent-workbench.html` 套壳成真正的 Windows 独立 `.exe`。

> 项目总文档（架构 / 三形态运行 / 功能 / 数据安全 / 构建）见仓库根目录 **[README.md](../README.md)**，本文件只聚焦桌面封装细节。

## 目录关系
```
workspace/
├── agent-workbench.html      ← 工坊本体（与仓库内同一个文件）
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
npm run dist         # 打包成 Windows 便携版 exe（dist/*.exe，portable，免安装）
```

## 说明
- `npm install` / `npm run dist` 都需要网络下载 Electron 及其构建依赖，
  沙箱环境无法代跑，请在本地 Windows 上执行。
- 打包产物在 `electron/dist/`，绿色便携版双击即用，数据与浏览器版一样存于本机。
- 如需自定义图标，放一个 `icon.ico` 并在 `package.json` 的 `win.icon` 指过去。
- 仍想零安装？回到根目录双击 `启动Agent工坊.bat`（Edge `--app` 模式）即可，
  体验几乎一致，只是窗口由 Edge 托管而非独立 exe。

## 系统托盘 + 开机自启
打包后的 exe 具备完整的桌面端能力：

- **系统托盘**：启动后 Windows 右下角出现「Agent 工坊」托盘图标（图标由 `main.js` 内联生成，零外部文件）。
  - 左键点击托盘图标：窗口隐藏时显示并聚焦，已显示时隐藏。
  - 右键菜单：显示窗口 / 隐藏窗口 / 退出。
  - 关闭窗口默认**最小化到托盘**（不退出），只有托盘菜单的「退出」才真正退出。
- **开机自启**：在 HTML 设置抽屉（齿轮图标）中出现「开机自动启动」开关（仅检测到桌面端时显示）。
  - 开关通过 `preload.js` 暴露的 `window.electronAPI` 经 IPC 调用 `app.setLoginItemSettings`，
    真实写入系统开机启动项，勾选后下次登录自动拉起工坊。
  - 浏览器版 / Edge 启动器版没有该 API，开关自动隐藏，互不影响。

> 桌面端进阶能力（托盘、自启、本地文件读写）依赖 Electron 主进程，沙箱环境无法代跑，
> 请在本机 `npm install && npm run dist` 后体验。

## 打包注意事项
`package.json` 的 `build.files` 采用显式白名单 `["main.js", "preload.js", "package.json", "agent-workbench.html"]`，
其中 `agent-workbench.html` 由 `prebuild` 脚本在打包前从仓库根目录复制进来；
`main.js` 的 `resolveHtml()` 打包态优先读同目录 `agent-workbench.html`，开发态回退到 `../agent-workbench.html`，
两种路径都能正确加载同一份 HTML。

## 自动更新（已移除）

本目录曾集成 `electron-updater`（启动时检查新版本并通知用户），**该链路已整体移除，不要再按旧教程配置**：

- `electron/package.json` 已无 `electron-updater` 依赖（只剩 `electron-builder`）；`main.js` 中只保留移除原因注释。
- 移除原因：三处断点使其从未真正可用 —— portable 打包目标不支持自动更新、无 `publish` feed 配置、渲染端也没有 `update-available` 监听（v1.11.1 移除）。
- 主进程不会再发起任何更新检查，也没有 `build.publish` 配置；旧文档里的 feed 服务器（`latest.yml` + 静态目录）整套流程均已作废。

**当前升级方式**：重新 `npm run dist` 打包出新的便携版 exe，手动分发给用户覆盖旧文件即可（数据存在本机用户目录，不受影响；GitHub Releases 只作为分发渠道，客户端不会自动检查）。

> 若将来要恢复自动更新，需要**同时**补齐四样：`electron-updater` 依赖、主进程检查逻辑、渲染端提示 UI、可公开访问的发布源 —— 缺任何一样都会退回"名有实无"。

