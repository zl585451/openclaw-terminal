# Claude VM 最终修复脚本 v2
# 需要以管理员身份运行

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Claude VM 最终修复工具 v2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠ 警告：未以管理员身份运行" -ForegroundColor Yellow
    Write-Host "请右键点击脚本，选择'以管理员身份运行'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "按回车键退出"
    exit 1
}

Write-Host "✓ 管理员权限已确认" -ForegroundColor Green
Write-Host ""

# 步骤 1: 完全重置 VM 文件夹权限
Write-Host "[步骤 1] 重置 VM 文件夹权限..." -ForegroundColor Yellow
$vmBundlePath = "C:\Users\zilong_wu\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\vm_bundles\claudevm.bundle"

try {
    $folderAcl = Get-Acl $vmBundlePath
    $folderAcl.SetAccessRuleProtection($true, $false) # 禁用继承，不保留现有权限
    
    # 添加必要的权限
    $rules = @(
        @{Identity="NT AUTHORITY\SYSTEM"; Rights="FullControl"; Inheritance="ContainerInherit,ObjectInherit"},
        @{Identity="BUILTIN\Administrators"; Rights="FullControl"; Inheritance="ContainerInherit,ObjectInherit"},
        @{Identity="DESKTOP-M0E3RLK\zilong_wu"; Rights="FullControl"; Inheritance="ContainerInherit,ObjectInherit"},
        @{Identity="ALL APPLICATION PACKAGES"; Rights="ReadAndExecute"; Inheritance="ContainerInherit,ObjectInherit"},
        @{Identity="RESTRICTED APPLICATION PACKAGES"; Rights="ReadAndExecute"; Inheritance="ContainerInherit,ObjectInherit"}
    )
    
    foreach ($rule in $rules) {
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $rule.Identity, 
            $rule.Rights, 
            $rule.Inheritance, 
            "None", 
            "Allow"
        )
        $folderAcl.AddAccessRule($accessRule)
    }
    
    Set-Acl $vmBundlePath $folderAcl
    Write-Host "  ✓ 文件夹权限已重置" -ForegroundColor Green
} catch {
    Write-Host "  ✗ 文件夹权限重置失败：$($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 步骤 2: 重置所有 VHDX 文件权限
Write-Host "[步骤 2] 重置 VHDX 文件权限..." -ForegroundColor Yellow
$vhdxFiles = @(
    "$vmBundlePath\smol-bin.vhdx",
    "$vmBundlePath\rootfs.vhdx",
    "$vmBundlePath\sessiondata.vhdx"
)

foreach ($vhdx in $vhdxFiles) {
    if (Test-Path $vhdx) {
        try {
            $acl = Get-Acl $vhdx
            $acl.SetAccessRuleProtection($true, $false) # 禁用继承，不保留权限
            
            # 添加显式权限
            $rules = @(
                "NT AUTHORITY\SYSTEM",
                "BUILTIN\Administrators",
                "DESKTOP-M0E3RLK\zilong_wu"
            )
            
            foreach ($identity in $rules) {
                $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                    $identity, 
                    "FullControl", 
                    "None", 
                    "None", 
                    "Allow"
                )
                $acl.AddAccessRule($accessRule)
            }
            
            Set-Acl $vhdx $acl
            Write-Host "  ✓ 已修复：$(Split-Path $vhdx -Leaf)" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ 失败：$(Split-Path $vhdx -Leaf) - $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  ⚠ 文件不存在：$(Split-Path $vhdx -Leaf)" -ForegroundColor Yellow
    }
}
Write-Host ""

# 步骤 3: 重启相关服务
Write-Host "[步骤 3] 重启虚拟化服务..." -ForegroundColor Yellow
$services = @("vmcompute", "hns")

foreach ($svcName in $services) {
    $svc = Get-Service $svcName -ErrorAction SilentlyContinue
    if ($svc) {
        try {
            Restart-Service $svc -Force
            Write-Host "  ✓ 已重启：$svcName" -ForegroundColor Green
        } catch {
            Write-Host "  ⚠ 无法重启：$svcName - $($_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ℹ 服务不存在：$svcName" -ForegroundColor Gray
    }
}
Write-Host ""

# 步骤 4: 检查虚拟化功能
Write-Host "[步骤 4] 验证虚拟化功能..." -ForegroundColor Yellow
$features = @("HypervisorPlatform", "VirtualMachinePlatform")

foreach ($feature in $features) {
    $f = Get-WindowsOptionalFeature -Online -FeatureName $feature
    $status = if ($f.State -eq "Enabled") { "✓" } else { "✗" }
    $color = if ($f.State -eq "Enabled") { "Green" } else { "Yellow" }
    Write-Host "  $status $feature : $($f.State)" -ForegroundColor $color
}
Write-Host ""

# 步骤 5: 测试 WSL（验证虚拟化）
Write-Host "[步骤 5] 测试 WSL 虚拟化..." -ForegroundColor Yellow
try {
    $wslTest = wsl echo "WSL OK" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ WSL 虚拟化测试通过" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ WSL 测试失败" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ WSL 测试异常：$($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 完成
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "修复完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步操作：" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. 完全关闭 Claude（包括系统托盘图标）" -ForegroundColor White
Write-Host "2. 重新打开 Claude" -ForegroundColor White
Write-Host ""
Write-Host "如果问题仍未解决，请尝试：" -ForegroundColor Yellow
Write-Host "3. 重启计算机（最重要）" -ForegroundColor White
Write-Host "4. 以管理员身份运行 Claude" -ForegroundColor White
Write-Host ""
Write-Host "诊断信息：" -ForegroundColor Cyan
Write-Host "- WSL2 可以正常工作，说明虚拟化平台正常" -ForegroundColor Gray
Write-Host "- 问题可能是 UWP 沙箱隔离导致的权限限制" -ForegroundColor Gray
Write-Host "- 如果持续失败，可能需要联系 Claude 官方支持" -ForegroundColor Gray
Write-Host ""
Read-Host "按回车键退出"
