@echo off
chcp 65001 >nul
echo ================================
echo   OpenClaw Terminal 启动中...
echo ================================
echo.
npm run electron:dev
pause