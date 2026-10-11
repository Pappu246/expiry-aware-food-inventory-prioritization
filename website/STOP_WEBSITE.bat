@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 2; if ($r.ok -eq $true -and $r.app -eq 'FreshTrack Inventory') { exit 0 }; exit 1 } catch { exit 1 }"
if errorlevel 1 (
  echo FreshTrack was not confirmed on port 4173. No process was stopped.
  pause
  exit /b 1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4173 " ^| findstr "LISTENING"') do (
  echo Stopping confirmed FreshTrack server process %%P...
  taskkill /PID %%P /T /F >nul 2>nul
)
echo FreshTrack stop requested.
endlocal
