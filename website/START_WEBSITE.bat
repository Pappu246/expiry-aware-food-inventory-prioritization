@echo off
setlocal
cd /d "%~dp0"
title FreshTrack Inventory Launcher
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 18 or later, then open this file again.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)
for /f %%V in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR (
  echo Could not read the installed Node.js version.
  pause
  exit /b 1
)
if %NODE_MAJOR% LSS 18 (
  echo FreshTrack requires Node.js 18 or later. Detected major version %NODE_MAJOR%.
  echo Update Node.js from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

echo Detected Node.js major version %NODE_MAJOR%.

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 1; if ($r.ok -eq $true -and $r.app -eq 'FreshTrack Inventory') { exit 0 }; exit 2 } catch { exit 1 }"
if not errorlevel 1 (
  echo FreshTrack is already running. Opening the existing website.
  start "" "http://127.0.0.1:4173"
  exit /b 0
)

netstat -ano | findstr ":4173 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo Port 4173 is already in use by another process.
  echo Close the other application or change PORT in server.js before starting FreshTrack.
  pause
  exit /b 1
)

echo Starting FreshTrack Inventory on this computer...
start "FreshTrack Inventory Server" /D "%~dp0" cmd /k node server.js
set "STARTED="
for /l %%I in (1,1,6) do (
  if not defined STARTED (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 1; if ($r.ok -eq $true -and $r.app -eq 'FreshTrack Inventory') { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 set "STARTED=1"
    if not defined STARTED timeout /t 1 /nobreak >nul
  )
)
if not defined STARTED (
  echo FreshTrack did not become healthy on port 4173.
  echo Check the FreshTrack server window for the error message.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4173"
echo.
echo FreshTrack is healthy at http://127.0.0.1:4173
echo Keep the FreshTrack server window open while using the website.
echo Close that server window to stop FreshTrack.
endlocal
