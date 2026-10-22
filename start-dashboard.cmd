@echo off
rem ---------------------------------------------------------------
rem  OpenCode Live Dashboard - launcher
rem  NOTE: this file is intentionally ASCII-only so it renders
rem  correctly under any console code page (936 / 65001 / ...).
rem  Chinese text is printed by node, after the console is switched
rem  to UTF-8.
rem ---------------------------------------------------------------
setlocal
chcp 65001 >nul 2>nul
title OpenCode Live Dashboard
set PORT=8773

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [ERROR] Node.js not found.
  echo           Please install Node.js 20 or newer: https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem --- stop the previous instance (only node processes on this port) ---
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%PORT%"') do (
  tasklist /FI "PID eq %%p" 2>nul | findstr /I "node.exe" >nul && (
    echo   Stopping previous instance ^(PID %%p^) ...
    taskkill /PID %%p /F >nul 2>nul
  )
)
timeout /t 1 /nobreak >nul 2>nul

rem --- if the port is still taken by something else, bail out ---
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%PORT%"') do (
  echo.
  echo   [ERROR] Port %PORT% is still in use by PID %%p.
  echo           Close that program, or change CONFIG.port in server.mjs.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEV=%%v

echo.
echo   OpenCode Live Dashboard
echo   -------------------------------------------------------------
echo   Node.js        : %NODEV%
echo   Bridge         : http://127.0.0.1:%PORT%
echo   Mode           : READ-ONLY (never writes to OpenCode)
echo   Stop           : close this window
echo   -------------------------------------------------------------
echo.

node server.mjs --open

echo.
echo   Bridge stopped.
pause
