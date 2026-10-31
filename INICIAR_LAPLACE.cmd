@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Esta version fue probada con Node.js 22.
  pause
  exit /b 1
)
node panel/servidor.mjs
pause
