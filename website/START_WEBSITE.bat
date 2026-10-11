@echo off
setlocal
cd /d "%~dp0"
title Inventory Website Launcher
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or later was not found. Install it from https://nodejs.org/
  pause
  exit /b 1
)
for /f %%V in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR exit /b 1
if %NODE_MAJOR% LSS 18 (
  echo Node.js 18 or later is required.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 1; if ($r.ok -eq $true) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  start "" "http://127.0.0.1:4173"
  exit /b 0
)
netstat -ano | findstr ":4173 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo Port 4173 is already in use. Close that application before starting the website.
  pause
  exit /b 1
)
start "Inventory Website Server" /D "%~dp0" cmd /k node server.js
for /l %%I in (1,1,8) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 1; if ($r.ok -eq $true) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)
echo Server did not report healthy. Check the server window for errors.
pause
exit /b 1
:ready
start "" "http://127.0.0.1:4173"
endlocal
