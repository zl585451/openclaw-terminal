# 安装 Visual Studio 2022 Spectre 缓解库
# 解决 node-pty / electron-rebuild 报错 MSB8040
# 需要以管理员身份运行 PowerShell（右键 -> 以管理员身份运行）

$vsPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
$installer = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vs_installer.exe"

# 安装多个版本的 Spectre 库以兼容不同工具集（14.30-14.39）
$components = @(
    "Microsoft.VisualStudio.Component.VC.14.30.17.0.x86.x64.Spectre",
    "Microsoft.VisualStudio.Component.VC.14.31.17.1.x86.x64.Spectre",
    "Microsoft.VisualStudio.Component.VC.14.32.17.2.x86.x64.Spectre",
    "Microsoft.VisualStudio.Component.VC.14.33.17.3.x86.x64.Spectre",
    "Microsoft.VisualStudio.Component.VC.14.34.17.4.x86.x64.Spectre",
    "Microsoft.VisualStudio.Component.VC.14.35.17.5.x86.x64.Spectre",
    "Microsoft.VisualStudio.Component.VC.14.36.17.6.x86.x64.Spectre",
    "Microsoft.VisualStudio.Component.VC.14.37.17.7.x86.x64.Spectre",
    "Microsoft.VisualStudio.Component.VC.14.38.17.8.x86.x64.Spectre"
)

if (-not (Test-Path $installer)) {
    Write-Host "错误: 未找到 Visual Studio Installer"
    exit 1
}

if (-not (Test-Path $vsPath)) {
    Write-Host "错误: 未找到 VS 2022 Build Tools，路径: $vsPath"
    exit 1
}

Write-Host "正在安装 Spectre 缓解库（x64/x86）..."
Write-Host "将打开 Visual Studio Installer 窗口，请等待完成（可能需数分钟）"
Write-Host ""

$args = @("modify", "--installPath", $vsPath)
foreach ($c in $components) {
    $args += "--add"
    $args += $c
}
$args += "--passive"
$args += "--wait"

& $installer @args

Write-Host ""
Write-Host "完成后请重新运行: npm install"
