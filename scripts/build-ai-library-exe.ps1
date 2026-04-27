$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendPath = Join-Path $projectRoot "resources\ai_library"
$outputPath = Join-Path $projectRoot "resources\ai_library_server"
$distPath = Join-Path $backendPath "dist\ai_library_server"
$venvPath = Join-Path $backendPath ".build-venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

Write-Host "=== AI.library exe Build ===" -ForegroundColor Cyan

$py = $null
try {
    $v = & py -3 --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $v -match "Python 3") { $py = "py -3" }
} catch {}
if (-not $py) {
    try {
        $v = & python --version 2>$null
        if ($LASTEXITCODE -eq 0 -and $v -match "Python 3") { $py = "python" }
    } catch {}
}
if (-not $py) {
    throw "Python 3.10+ required."
}
    Write-Host "Using Python: $py" -ForegroundColor Green

Push-Location $backendPath
try {
    Write-Host "`n[1/4] Preparing isolated build venv..." -ForegroundColor Yellow
    if (-not (Test-Path $venvPython)) {
        & cmd /c "$py -m venv .build-venv"
        if ($LASTEXITCODE -ne 0) { throw "venv creation failed" }
    }

    Write-Host "`n[2/4] Installing dependencies..." -ForegroundColor Yellow
    & $venvPython -m pip install --upgrade pip -q
    if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }
    & $venvPython -m pip install -r requirements.txt pyinstaller -q
    if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
    if (Test-Path "build") { Remove-Item "build" -Recurse -Force }

    Write-Host "`n[3/4] PyInstaller packaging..." -ForegroundColor Yellow
    & $venvPython -m PyInstaller ai_library_server.spec --noconfirm
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }

    if (Test-Path $outputPath) { Remove-Item $outputPath -Recurse -Force }
    Copy-Item $distPath $outputPath -Recurse -Force

    Write-Host "`n[4/4] Output: $outputPath" -ForegroundColor Green
    $exePath = Join-Path $outputPath "ai_library_server.exe"
    if (Test-Path $exePath) {
        $size = (Get-Item $exePath).Length
        Write-Host "exe size: $size bytes" -ForegroundColor Green
    }
}
finally {
    Pop-Location
}

Write-Host "`nDone. Run npm run electron:build:win to include this exe." -ForegroundColor Cyan
