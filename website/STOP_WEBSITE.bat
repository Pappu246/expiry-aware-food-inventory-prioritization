@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 2; if ($r.ok -eq $true) { exit 0 }; exit 1 } catch { exit 1 }"
if errorlevel 1 (
  echo No matching inventory website health response was found. No process was stopped.
  pause
  exit /b 1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4173 " ^| findstr "LISTENING"') do (
  echo Stopping website listener %%P...
  taskkill /PID %%P /T /F >nul 2>nul
)
echo Website stop requested.
endlocal
