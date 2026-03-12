@echo off
echo 🧹 清除 Cursor 缓存...
echo.
echo 正在清除...
timeout /t 2 /nobreak >nul
rmdir /s /q "%APPDATA%\Cursor\Cache" 2>nul
rmdir /s /q "%APPDATA%\Cursor\Code Cache" 2>nul
rmdir /s /q "%APPDATA%\Cursor\GPUCache" 2>nul
echo.
echo ✅ 缓存清除完成！
echo.
pause
