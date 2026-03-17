# Nocturne 记忆管理界面启动脚本
# 在项目根目录运行: .\scripts\start-nocturne-dashboard.ps1

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot + "\.."
$nocturneRoot = Join-Path $projectRoot "resources\nocturne_memory"
$backendPath = Join-Path $nocturneRoot "backend"
$frontendPath = Join-Path $nocturneRoot "frontend"

if (-not (Test-Path $backendPath)) {
    Write-Host "Error: nocturne_memory not found at $nocturneRoot"
    Write-Host "Nocturne is inside the OCT project: OpenClaw-Terminal\resources\nocturne_memory"
    exit 1
}

Write-Host "Starting Nocturne Memory Dashboard..."
Write-Host "Backend: $backendPath"
Write-Host "Frontend: $frontendPath"
Write-Host ""

# 启动后端（新窗口）
Write-Host "[1/2] Starting backend (port 8000)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; py -3.10 -m uvicorn main:app --reload --port 8000"

Start-Sleep -Seconds 3

# 启动前端（新窗口）
Write-Host "[2/2] Starting frontend (port 3000)..."
if (-not (Test-Path (Join-Path $frontendPath "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    Set-Location $frontendPath
    npm install
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev"

Start-Sleep -Seconds 5
Write-Host ""
Write-Host "Done! Opening http://localhost:3000"
Start-Process "http://localhost:3000"
