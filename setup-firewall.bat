@echo off
echo ===== OCT Mobile 防火墙配置 =====
echo.

netsh advfirewall firewall delete rule name="OCT Gateway WS (18789)" >nul 2>&1
netsh advfirewall firewall delete rule name="OCT Mobile Web (18790)" >nul 2>&1

netsh advfirewall firewall add rule name="OCT Gateway WS (18789)" dir=in action=allow protocol=TCP localport=18789
netsh advfirewall firewall add rule name="OCT Mobile Web (18790)" dir=in action=allow protocol=TCP localport=18790

echo.
echo ===== 完成 =====
echo 端口 18789 (WebSocket) 和 18790 (HTTP) 已开放
echo 手机可通过局域网访问 OCT
echo.
pause
