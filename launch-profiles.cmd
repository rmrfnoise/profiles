@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  echo [Profiles] Node.js was not found.
  echo Install Node.js 24 or newer, then try again.
  pause
  exit /b 1
)

"%NODE_EXE%" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo [Profiles] Node.js 24 or newer is required.
  "%NODE_EXE%" --version
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" goto install
goto start

:install
echo [Profiles] Installing dependencies for the first run...
where npm >nul 2>nul
if errorlevel 1 goto npm_missing
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto install_failed
goto start

:npm_missing
echo [Profiles] npm was not found.
echo Install Node.js 24 or newer, then try again.
pause
exit /b 1

:install_failed
echo [Profiles] Dependency installation failed.
echo Check the network connection and run npm install manually.
pause
exit /b 1

:start
curl.exe -s -o NUL --max-time 1 http://127.0.0.1:3000
if errorlevel 1 start "Profiles Server" /min "%NODE_EXE%" "server.js"

if /I "%PROFILES_NO_BROWSER%"=="1" exit /b 0
start "" "http://127.0.0.1:3000"
endlocal