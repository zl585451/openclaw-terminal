# Claude VM 权限修复脚本
# 需要以管理员身份运行

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Claude VM 权限修复工具" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "错误：需要管理员权限" -ForegroundColor Red
    Write-Host "请右键点击此脚本，选择'以管理员身份运行'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "按回车键退出"
    exit 1
}

Write-Host "✓ 管理员权限已确认" -ForegroundColor Green
Write-Host ""

# 定义路径
$claudePackagePath = "C:\Users\zilong_wu\AppData\Local\Packages\Claude_pzs8sxrjxfjjc"
$vmBundlePath = "$claudePackagePath\LocalCache\Roaming\Claude\vm_bundles\claudevm.bundle"
$vhdxFiles = @(
    "$vmBundlePath\smol-bin.vhdx",
    "$vmBundlePath\rootfs.vhdx",
    "$vmBundlePath\sessiondata.vhdx"
)

# 检查文件是否存在
Write-Host "检查 VHDX 文件..." -ForegroundColor Yellow
foreach ($vhdx in $vhdxFiles) {
    if (Test-Path $vhdx) {
        Write-Host "  ✓ 找到：$vhdx" -ForegroundColor Green
    } else {
        Write-Host "  ✗ 未找到：$vhdx" -ForegroundColor Red
    }
}
Write-Host ""

# 步骤 1: 重置文件权限（移除继承）
Write-Host "步骤 1: 重置文件权限..." -ForegroundColor Yellow
foreach ($vhdx in $vhdxFiles) {
    if (Test-Path $vhdx) {
        try {
            $acl = Get-Acl $vhdx
            $acl.SetAccessRuleProtection($true, $true) # 禁用继承，保留现有权限
            Set-Acl $vhdx $acl
            Write-Host "  ✓ 已重置权限：$vhdx" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ 失败：$vhdx - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}
Write-Host ""

# 步骤 2: 添加 vmcompute 服务账户权限
Write-Host "步骤 2: 添加系统服务权限..." -ForegroundColor Yellow

# 获取 vmcompute 服务的 SID
$vmcomputeSID = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-80-3143153010-2942406414-1180790756-2331494322-3507980021")

foreach ($vhdx in $vhdxFiles) {
    if (Test-Path $vhdx) {
        try {
            $acl = Get-Acl $vhdx
            
            # 添加 SYSTEM 账户完全控制（如果不存在）
            $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM", "FullControl", "Allow")
            $acl.AddAccessRule($systemRule)
            
            # 添加 Administrators 完全控制
            $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", "Allow")
            $acl.AddAccessRule($adminRule)
            
            # 添加当前用户完全控制
            $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
            $userRule = New-Object System.Security.AccessControl.FileSystemAccessRule($user, "FullControl", "Allow")
            $acl.AddAccessRule($userRule)
            
            Set-Acl $vhdx $acl
            Write-Host "  ✓ 已添加权限：$vhdx" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ 失败：$vhdx - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}
Write-Host ""

# 步骤 3: 检查并修复文件夹权限
Write-Host "步骤 3: 修复文件夹权限..." -ForegroundColor Yellow
try {
    $folderAcl = Get-Acl $vmBundlePath
    $folderAcl.SetAccessRuleProtection($true, $true)
    
    # 确保关键权限存在
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $folderAcl.AddAccessRule($systemRule)
    
    $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $folderAcl.AddAccessRule($adminRule)
    
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $userRule = New-Object System.Security.AccessControl.FileSystemAccessRule($user, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $folderAcl.AddAccessRule($userRule)
    
    Set-Acl $vmBundlePath $folderAcl
    Write-Host "  ✓ 文件夹权限已修复" -ForegroundColor Green
} catch {
    Write-Host "  ✗ 文件夹权限修复失败：$($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 步骤 4: 重启 vmcompute 服务
Write-Host "步骤 4: 重启 Hyper-V 计算服务..." -ForegroundColor Yellow
try {
    Restart-Service vmcompute -Force
    Write-Host "  ✓ vmcompute 服务已重启" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ vmcompute 服务重启失败，可能需要手动重启" -ForegroundColor Yellow
}
Write-Host ""

# 步骤 5: 检查虚拟化功能
Write-Host "步骤 5: 检查虚拟化功能..." -ForegroundColor Yellow
$hypervisorPlatform = Get-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform
Write-Host "  HypervisorPlatform 状态：$($hypervisorPlatform.State)" -ForegroundColor $(if($hypervisorPlatform.State -eq "Enabled"){"Green"}else{"Yellow"})

$vmPlatform = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform
Write-Host "  VirtualMachinePlatform 状态：$($vmPlatform.State)" -ForegroundColor $(if($vmPlatform.State -eq "Enabled"){"Green"}else{"Yellow"})
Write-Host ""

# 完成
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "修复完成！" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "请执行以下操作：" -ForegroundColor Yellow
Write-Host "1. 完全关闭 Claude（包括系统托盘图标）" -ForegroundColor White
Write-Host "2. 重新打开 Claude" -ForegroundColor White
Write-Host "3. 如果仍有问题，请重启计算机" -ForegroundColor White
Write-Host ""
Read-Host "按回车键退出"
