@echo off
setlocal
cd /d "%~dp0"
echo ===============================================================
echo  Expiry-Aware Food Inventory Manager
echo ===============================================================
set "GCC_EXE="
for /f "delims=" %%G in ('where gcc 2^>nul') do if not defined GCC_EXE set "GCC_EXE=%%G"
if not defined GCC_EXE if exist "C:\mingw64\bin\gcc.exe" set "GCC_EXE=C:\mingw64\bin\gcc.exe"
if not defined GCC_EXE (
  echo GCC was not found.
  echo This launcher checked PATH and C:\mingw64\bin\gcc.exe.
  echo Install MinGW-w64 GCC, or add its bin folder to PATH.
  echo.
  pause
  exit /b 1
)
echo Compiler: %GCC_EXE%
if not exist build mkdir build
"%GCC_EXE%" -D_POSIX_C_SOURCE=200809L -Iinclude -std=c11 -Wall -Wextra -Wpedantic -Werror -O2 src\inventory_app.c src\engine.c -lm -o build\inventory_app.exe
if errorlevel 1 (
  echo.
  echo Compilation failed. Check the compiler error above.
  pause
  exit /b 1
)
echo.
echo Starting the local inventory application. Do not close the window before it finishes saving.
echo.
build\inventory_app.exe
set APP_EXIT=%ERRORLEVEL%
echo.
echo Inventory application closed with exit code %APP_EXIT%.
pause
exit /b %APP_EXIT%