# 构建 Nocturne Memory Server 为独立 exe
# 需要: Python 3.10+, 在 backend 目录 pip install -r requirements.txt pyinstaller
# 输出: resources/nocturne_server/ (供 electron-builder extraResources 打包)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendPath = Join-Path $projectRoot "resources\nocturne_memory\backend"
$outputPath = Join-Path $projectRoot "resources\nocturne_server"
$distPath = Join-Path $backendPath "dist\nocturne_server"

Write-Host "=== Nocturne exe 构建 ===" -ForegroundColor Cyan
Write-Host "Backend: $backendPath"
Write-Host ""

# 检查 Python
$py = $null
foreach ($cmd in @("py -3", "python3", "python")) {
    try {
        $v = & cmd /c "$cmd --version 2>&1"
        if ($v -match "Python 3\.(\d+)") {
            if ([int]$Matches[1] -ge 10) {
                $py = $cmd
                break
            }
        }
    } catch { $null }
}
if (-not $py) {
    Write-Host "错误: 需要 Python 3.10+，请先安装" -ForegroundColor Red
    exit 1
}
Write-Host "使用 Python: $py"

# 安装依赖
Push-Location $backendPath
try {
    Write-Host "`n[1/3] 安装依赖..."
    & cmd /c "$py -m pip install -r requirements.txt pyinstaller -q"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "pip install 失败" -ForegroundColor Red
        exit 1
    }

    # 清理旧构建
    if (Test-Path "dist") { Remove-Item -Recurse -Force dist }
    if (Test-Path "build") { Remove-Item -Recurse -Force build }

    Write-Host "`n[2/3] PyInstaller 打包..."
    & cmd /c "$py -m PyInstaller nocturne_server.spec --noconfirm"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "PyInstaller 失败" -ForegroundColor Red
        exit 1
    }

    # 复制到 resources/nocturne_server
    if (Test-Path $outputPath) { Remove-Item -Recurse -Force $outputPath }
    Copy-Item -Recurse -Force $distPath $outputPath
    Write-Host "`n[3/3] 已输出到: $outputPath" -ForegroundColor Green

    $exePath = Join-Path $outputPath "nocturne_server.exe"
    if (Test-Path $exePath) {
        $size = (Get-Item $exePath).Length / 1MB
        Write-Host "exe 大小: $([math]::Round($size, 2)) MB"
    }
} finally {
    Pop-Location
}

Write-Host "`n完成。运行 npm run electron:build:win 将包含此 exe。" -ForegroundColor Green
