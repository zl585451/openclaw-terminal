# 释放 OCT 常用端口（Gateway WS / Mobile HTTP / Vite 开发端口）
$ports = @(18789, 18790, 5176)
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Host "Port ${port}: (no LISTEN)"
    continue
  }
  $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -and $_ -ne 0 }
  foreach ($procId in $procIds) {
    try {
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      $n = if ($p) { $p.ProcessName } else { '?' }
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host "Port ${port}: stopped PID $procId ($n)"
    } catch {
      Write-Host "Port ${port}: could not stop PID $procId - $_"
    }
  }
}
Write-Host "Done."
