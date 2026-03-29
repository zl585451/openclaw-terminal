# Claude VM 深度诊断脚本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Claude VM 深度诊断工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 VHDX 文件可访问性
Write-Host "[1] 检查 VHDX 文件可访问性..." -ForegroundColor Yellow
$vhdxFiles = @(
    "C:\Users\zilong_wu\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\vm_bundles\claudevm.bundle\smol-bin.vhdx",
    "C:\Users\zilong_wu\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\vm_bundles\claudevm.bundle\rootfs.vhdx",
    "C:\Users\zilong_wu\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\vm_bundles\claudevm.bundle\sessiondata.vhdx"
)

foreach ($vhdx in $vhdxFiles) {
    if (Test-Path $vhdx) {
        $file = Get-Item $vhdx
        $acl = Get-Acl $vhdx
        Write-Host "  ✓ $vhdx" -ForegroundColor Green
        Write-Host "    大小：$([math]::Round($file.Length / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host "    权限所有者：$($acl.Owner)" -ForegroundColor Gray
        Write-Host "    权限组：$($acl.Group)" -ForegroundColor Gray
        
        # 检查是否有显式权限（非继承）
        $accessRules = $acl.Access | Where-Object { -not $_.IsInherited }
        if ($accessRules.Count -eq 0) {
            Write-Host "    ⚠ 警告：所有权限都是继承的" -ForegroundColor Yellow
        } else {
            Write-Host "    ✓ 存在显式权限：$($accessRules.Count) 条" -ForegroundColor Green
        }
    } else {
        Write-Host "  ✗ 文件不存在：$vhdx" -ForegroundColor Red
    }
}
Write-Host ""

# 2. 检查虚拟化服务
Write-Host "[2] 检查虚拟化服务..." -ForegroundColor Yellow
$services = @("vmcompute", "vmms", "hns", "gpsvc")
foreach ($svc in $services) {
    $service = Get-Service $svc -ErrorAction SilentlyContinue
    if ($service) {
        $status = if ($service.Status -eq "Running") { "✓ 运行中" } else { "✗ 未运行" }
        $color = if ($service.Status -eq "Running") { "Green" } else { "Red" }
        Write-Host "  $status - $svc ($($service.DisplayName))" -ForegroundColor $color
    } else {
        Write-Host "  ✗ 服务不存在：$svc" -ForegroundColor Red
    }
}
Write-Host ""

# 3. 检查虚拟化功能
Write-Host "[3] 检查 Windows 虚拟化功能..." -ForegroundColor Yellow
$features = @("HypervisorPlatform", "VirtualMachinePlatform")
foreach ($feature in $features) {
    $f = Get-WindowsOptionalFeature -Online -FeatureName $feature
    $status = if ($f.State -eq "Enabled") { "✓ 已启用" } else { "✗ 未启用" }
    $color = if ($f.State -eq "Enabled") { "Green" } else { "Yellow" }
    Write-Host "  $status - $feature" -ForegroundColor $color
}
Write-Host ""

# 4. 检查 Hypervisor 状态
Write-Host "[4] 检查 Hypervisor 状态..." -ForegroundColor Yellow
$bcd = bcdedit /enum
$hypervisorLaunchType = $bcd | Select-String "hypervisorlaunchtype" | ForEach-Object { ($_ -split "\s+")[1] }
Write-Host "  Hypervisor 启动类型：$hypervisorLaunchType" -ForegroundColor $(if($hypervisorLaunchType -eq "Auto"){"Green"}else{"Yellow"})

$computerInfo = Get-CimInstance Win32_ComputerSystem
Write-Host "  Hypervisor 存在：$($computerInfo.HyperVisorPresent)" -ForegroundColor $(if($computerInfo.HyperVisorPresent){"Green"}else{"Red"})
Write-Host ""

# 5. 检查用户权限
Write-Host "[5] 检查用户和组权限..." -ForegroundColor Yellow
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent()
Write-Host "  当前用户：$($user.Name)" -ForegroundColor Cyan
Write-Host "  用户 SID: $($user.User)" -ForegroundColor Gray

# 检查 Hyper-V 管理员组
$hvAdmins = Get-LocalGroup -Name "Hyper-V Administrators" -ErrorAction SilentlyContinue
if ($hvAdmins) {
    $members = Get-LocalGroupMember -Group "Hyper-V Administrators" -ErrorAction SilentlyContinue
    $isMember = $members | Where-Object { $_.SID -eq $user.User }
    if ($isMember) {
        Write-Host "  ✓ 已添加到 Hyper-V 管理员组" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ 未添加到 Hyper-V 管理员组（可能不需要）" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ℹ Hyper-V 管理员组不存在（家庭版正常）" -ForegroundColor Gray
}
Write-Host ""

# 6. 检查安全功能
Write-Host "[6] 检查 Windows 安全功能..." -ForegroundColor Yellow
$deviceGuard = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity" -ErrorAction SilentlyContinue
if ($deviceGuard) {
    $status = if ($deviceGuard.Enabled -eq 1) { "已启用" } else { "已禁用" }
    Write-Host "  内存完整性：$status" -ForegroundColor $(if($deviceGuard.Enabled -eq 0){"Green"}else{"Yellow"})
} else {
    Write-Host "  ℹ 内存完整性配置不存在" -ForegroundColor Gray
}

$vbStatus = (systeminfo | Select-String "基于虚拟化的安全性") -replace ".*:", "").Trim()
Write-Host "  基于虚拟化的安全性：$vbStatus" -ForegroundColor Yellow
Write-Host ""

# 7. 尝试测试 VHDX 访问
Write-Host "[7] 测试 VHDX 文件访问..." -ForegroundColor Yellow
try {
    $testPath = $vhdxFiles[0]
    $bytes = [System.IO.File]::ReadAllBytes($testPath)
    Write-Host "  ✓ 可以读取 VHDX 文件（测试大小：$($bytes.Length) 字节）" -ForegroundColor Green
} catch {
    Write-Host "  ✗ 无法访问 VHDX 文件：$($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 8. 检查 AppContainer 包信息
Write-Host "[8] 检查 Claude UWP 包信息..." -ForegroundColor Yellow
$package = Get-AppxPackage -Name "*Claude*" | Select-Object Name, PackageFullName, InstallLocation, Status
if ($package) {
    Write-Host "  包名：$($package.Name)" -ForegroundColor Cyan
    Write-Host "  完整名：$($package.PackageFullName)" -ForegroundColor Gray
    Write-Host "  状态：$($package.Status)" -ForegroundColor $(if($package.Status -eq "OK"){"Green"}else{"Red"})
} else {
    Write-Host "  ⚠ 未找到 Claude UWP 包" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "诊断完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "建议：" -ForegroundColor Yellow
Write-Host "1. 如果 VHDX 权限都是继承的，可能需要完全重置权限" -ForegroundColor White
Write-Host "2. 如果 vmcompute 未运行，请重启计算机" -ForegroundColor White
Write-Host "3. 如果问题依旧，尝试以管理员身份运行 Claude" -ForegroundColor White
Write-Host ""
Read-Host "按回车键退出"
