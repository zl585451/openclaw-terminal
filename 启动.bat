@echo off
chcp 65001 >nul
cls
echo.
echo  ╔═══════════════════════════════════════════════════════╗
echo  ║       OpenClaw Terminal v1.0 - 启动器                 ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM 检查 node_modules
if not exist "node_modules" (
    echo  [INFO] 首次运行，正在安装依赖...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] 依赖安装失败，请检查 Node.js 是否安装
        pause
        exit /b 1
    )
    echo.
    echo  [INFO] 依赖安装完成
    echo.
)

REM 检查 .env
if not exist ".env" (
    echo  [WARN] 未找到 .env 配置文件
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  [INFO] 已创建 .env 文件，请编辑并填入 API Key
    )
)

echo  [SYSTEM] 正在启动 OpenClaw Terminal...
echo  [INFO] 首次启动会先编译 Electron 主进程...
echo.

call npm run start