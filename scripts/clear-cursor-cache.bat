@echo off
chcp 65001 >nul
echo 清理 Cursor 缓存...
echo.

REM 清理 Node 缓存
if exist "%USERPROFILE%\.cursor\cache" (
    rmdir /s /q "%USERPROFILE%\.cursor\cache"
    echo 已清理 Cursor 缓存目录
)

REM 清理 npm 缓存
if exist "%APPDATA%\npm-cache" (
    npm cache clean --force
    echo 已清理 npm 缓存
)

echo.
echo 清理完成！
pause