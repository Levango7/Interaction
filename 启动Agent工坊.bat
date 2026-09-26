@echo off
chcp 65001 >nul
set "HERE=%~dp0"
rem 将 Windows 反斜杠路径转为 file:// 正斜杠格式
set "HERE=%HERE:\=/%"
set "HTML=%HERE%agent-workbench.html"
if not exist "%~dp0agent-workbench.html" (
  echo 找不到 agent-workbench.html，请确认本启动器与 HTML 在同一目录。
  pause
  exit /b 1
)
rem v3.7.58：源码态自愈 —— v3.7.0 起仓库内 HTML 是骨架（应用 JS 外置于 src/），
rem npm test 结束时 posttest 会自动还原为源码态。此处检测「拼回态特有符号」，
rem 缺失即说明当前是源码态，先用构建脚本拼回再启动，双击体验保持不变。
findstr /c:"function dsEnhance" "%~dp0agent-workbench.html" >nul 2>&1
if errorlevel 1 (
  echo 检测到源码态 HTML，正在拼回应用代码...
  where node >nul 2>&1
  if errorlevel 1 (
    echo 未检测到 Node.js，无法自动拼回。请安装 Node 后重试，或手动运行 npm run src:inject。
    pause
    exit /b 1
  )
  cd /d "%~dp0"
  call node scripts\src-split.mjs
  call node scripts\pet-art.mjs
)
start "" msedge --app="file:///%HTML%" --new-window
if errorlevel 1 (
  echo 未检测到 Edge，尝试用 Chrome 打开...
  start "" chrome --app="file:///%HTML%" --new-window
)
