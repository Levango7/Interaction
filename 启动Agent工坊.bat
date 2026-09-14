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
start "" msedge --app="file:///%HTML%" --new-window
if errorlevel 1 (
  echo 未检测到 Edge，尝试用 Chrome 打开...
  start "" chrome --app="file:///%HTML%" --new-window
)
