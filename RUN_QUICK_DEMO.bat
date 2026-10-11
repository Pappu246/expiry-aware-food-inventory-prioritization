@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0demo.ps1" -Quick
set DEMO_EXIT=%ERRORLEVEL%
echo.
if not "%DEMO_EXIT%"=="0" echo Quick demo failed with exit code %DEMO_EXIT%.
pause
exit /b %DEMO_EXIT%