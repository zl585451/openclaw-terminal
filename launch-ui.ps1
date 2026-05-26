# 启动 OCT UI 并隐藏终端窗口，同时记录错误日志
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $rootDir 'launch-debug.log'

Start-Process -FilePath 'cmd.exe' -ArgumentList "/c cd /d `"$rootDir`" && npm run electron:dev > `"$logFile`" 2>&1" -WindowStyle Hidden
