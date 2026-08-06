@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 正在启动本地服务（用于让 AI 助手避开浏览器跨域限制，仅绑定本机回环地址）...

REM ===== 候选端口（步长 11，尽量避开常见服务）=====
set "PORT_LIST=8123 8134 8145 8156 8167 8178 8189 8200"
set "SEL_PORT="

REM ===== 端口探测 + 顺延：从 8123 起找第一个空闲端口 =====
for %%P in (%PORT_LIST%) do (
  if not defined SEL_PORT call :tryport %%P
)
if not defined SEL_PORT (
  echo 错误：候选端口 8123、8134、8145、8156、8167、8178、8189、8200 全部被占用。
  echo 请关闭占用这些端口的服务后重试。
  pause
  exit /b 1
)
echo 已选定空闲端口：%SEL_PORT%（仅绑定 127.0.0.1，局域网其他机器无法访问）

REM ===== 选择 Python 解释器（优先 python，兜底 py）=====
set "PY="
where python >nul 2>nul
if not errorlevel 1 set "PY=python"
if not defined PY (
  where py >nul 2>nul
  if not errorlevel 1 set "PY=py"
)
if not defined PY (
  echo 错误：未找到 python 或 py，请先安装 Python 并加入 PATH 后重试。
  pause
  exit /b 1
)

REM ===== 启动本地服务（仅回环地址，杜绝 LAN 暴露）=====
echo 正在启动服务：%PY% -m http.server %SEL_PORT% --bind 127.0.0.1
start "" %PY% -m http.server %SEL_PORT% --bind 127.0.0.1

REM ===== 就绪轮询（替换原固定 timeout /t 2，消除启动竞态）=====
set "ATTEMPTS=0"
:poll
powershell -noprofile -command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%SEL_PORT%/agent-workbench.html' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 2 } } catch { exit 2 }"
if not errorlevel 1 goto :open
set /a ATTEMPTS+=1
if %ATTEMPTS% geq 20 (
  echo 错误：本地服务在约 10 秒内未就绪（端口 %SEL_PORT%），请检查 Python 环境。
  pause
  exit /b 1
)
powershell -noprofile -command "Start-Sleep -Milliseconds 500" >nul
goto :poll

:open
start "" msedge --app="http://127.0.0.1:%SEL_PORT%/agent-workbench.html" --new-window
echo 已用 Edge 打开 http://127.0.0.1:%SEL_PORT%/agent-workbench.html
echo 服务在后台运行，关闭命令行窗口或按 Ctrl+C 可停止。
pause
goto :eof

REM ===== 子程序：探测单个端口是否被占用（回环地址 TCP 连接探测）=====
:tryport
powershell -noprofile -command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %1); $c.Close(); exit 1 } catch { exit 0 }"
if errorlevel 1 (exit /b) else (set "SEL_PORT=%1" & exit /b)
