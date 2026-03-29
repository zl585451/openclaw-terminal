# OCT Gateway 重启脚本
# 用法: .\restart-gateway.ps1

$PORT = 18789

Write-Host "=== OCT Gateway 重启脚本 ===" -ForegroundColor Cyan

# 1. 查找并关闭占用端口的进程
Write-Host "`n[1/4] 检查端口 $PORT 占用..." -ForegroundColor Yellow
$connections = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($conn in $connections) {
        $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "  发现进程占用: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Red
            try {
                Stop-Process -Id $process.Id -Force
                Write-Host "  已终止进程 PID: $($process.Id)" -ForegroundColor Green
            } catch {
                Write-Host "  无法终止进程 PID: $($process.Id), 错误: $_" -ForegroundColor Red
            }
        }
    }
} else {
    Write-Host "  端口 $PORT 未被占用" -ForegroundColor Green
}

# 2. 等待端口释放
Start-Sleep -Seconds 2

# 3. 检查 Node.js 进程
Write-Host "`n[2/4] 检查 Node.js Gateway 进程..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*oct-gateway*" -or $_.CommandLine -like "*index.js*"
}
if ($nodeProcesses) {
    foreach ($proc in $nodeProcesses) {
        Write-Host "  发现 Node 进程: PID $($proc.Id)" -ForegroundColor Red
        try {
            Stop-Process -Id $proc.Id -Force
            Write-Host "  已终止 Node 进程 PID: $($proc.Id)" -ForegroundColor Green
        } catch {
            Write-Host "  无法终止 Node 进程: $_" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  未发现 Node Gateway 进程" -ForegroundColor Green
}

# 4. 验证端口已释放
Write-Host "`n[3/4] 验证端口释放..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
$stillOccupied = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($stillOccupied) {
    Write-Host "  警告: 端口 $PORT 仍被占用!" -ForegroundColor Red
} else {
    Write-Host "  端口 $PORT 已释放" -ForegroundColor Green
}

# 5. 启动 Gateway
Write-Host "`n[4/4] 启动 Gateway..." -ForegroundColor Yellow
Write-Host "  工作目录: $(Get-Location)\oct-gateway" -ForegroundColor Gray
Write-Host "  命令: npm start" -ForegroundColor Gray
Write-Host "`n  正在启动...`n" -ForegroundColor Cyan

Set-Location -Path "$(Get-Location)\oct-gateway"
npm start
