/**
 * Linux/Mac 命令 → Windows PowerShell/CMD 转换器
 * 覆盖 AI 常生成的高频跨平台命令模式
 */

const isWindows = process.platform === 'win32';

/**
 * 将 Linux/Mac 命令转换为 Windows 等价命令
 * @param {string} command 原始命令
 * @returns {string} 转换后的命令
 */
function convertCommand(command) {
  if (!isWindows) return command;

  // 移除开头的 `chcp 65001 >nul && `（如果 AI 已经自己加上了）
  let base = command.replace(/^chcp 65001 >nul && /, '');

  // 先处理管道后的 head/tail/grep 等
  base = convertPipes(base);

  // 再处理主体命令（ls, find, cat 等）
  base = convertMainCommand(base);

  return base;
}

function convertPipes(cmd) {
  // | head -n N  或 | head N  →  | Select-Object -First N
  cmd = cmd.replace(/\|\s*head\s+(?:-n\s+)?(\d+)/gi, (_, n) => ` | Select-Object -First ${n}`);

  // | tail -n N  或 | tail N  →  | Select-Object -Last N
  cmd = cmd.replace(/\|\s*tail\s+(?:-n\s+)?(\d+)/gi, (_, n) => ` | Select-Object -Last ${n}`);

  // | grep " pattern"  →  | Select-String " pattern"
  cmd = cmd.replace(/\|\s*grep\s+("([^"]+)"|'([^']+)')/gi, (_, q, dq, sq) => {
    const pattern = dq || sq;
    return ` | Select-String -Pattern "${pattern}"`;
  });

  // | wc -l  →  | Measure-Object -Line
  cmd = cmd.replace(/\|\s*wc\s+-l/gi, ' | Measure-Object -Line');

  // | sort  →  | Sort-Object
  cmd = cmd.replace(/\|\s*sort\b/gi, ' | Sort-Object');

  // | uniq  →  | Sort-Object -Unique
  cmd = cmd.replace(/\|\s*uniq\b/gi, ' | Sort-Object -Unique');

  // 2>/dev/null  →  2>$null
  cmd = cmd.replace(/2>\/dev\/null/g, '2>$null');

  // >/dev/null  →  >$null
  cmd = cmd.replace(/>\/dev\/null/g, '>$null');

  // &>  →  >  (简单重定向，忽略 stderr 合并)
  cmd = cmd.replace(/&>/g, '>');

  return cmd;
}

function convertMainCommand(cmd) {
  const trimmed = cmd.trim();

  // ═══════════════════════════════════════════════════════
  // ls 系列
  // ═══════════════════════════════════════════════════════

  // ls -la / ls -l / ls -lah / ls -R  →  dir
  if (/^ls\s+-l/.test(trimmed)) {
    let options = '';
    if (/a/.test(trimmed)) options += ' /a';
    if (/h/.test(trimmed)) options += ' /s';
    if (/R/.test(trimmed)) options += ' /s';
    const path = trimmed.replace(/^ls\s+-l[ahRs]*/, '').trim() || '.';
    return `dir${options} "${path}"`;
  }

  // ls (plain)  →  dir /b
  if (/^ls\s*$/.test(trimmed)) {
    return 'dir /b';
  }

  // ls path  →  dir /b path
  if (/^ls\s+[\w\/.~-]/.test(trimmed)) {
    const path = trimmed.replace(/^ls\s+/, '').trim();
    return `dir /b "${path}"`;
  }

  // ═══════════════════════════════════════════════════════
  // find 系列
  // ═══════════════════════════════════════════════════════

  // find . -name "*.txt"  →  dir /s /b *.txt
  if (/^find\s+/.test(trimmed)) {
    const patternMatch = trimmed.match(/-name\s+("([^"]+)"|'([^']+)'|\S+)/g);
    let path = '.';
    let patterns = [];

    const nameMatches = trimmed.match(/-name\s+("([^"]+)"|'([^']+)'|(\S+))/g) || [];
    for (const m of nameMatches) {
      const p = m.replace(/-name\s+/, '').replace(/["']/g, '').replace(/\*/g, '%').replace(/\?/g, '_');
      patterns.push(`"${p}"`);
    }

    // -o is OR
    if (trimmed.includes(' -o ')) {
      const allNames = trimmed.match(/-name\s+("([^"]+)"|'([^']+)'|(\S+))/g) || [];
      const ps = allNames.map(m => {
        const p = m.replace(/-name\s+/, '').replace(/["']/g, '').replace(/\*/g, '%').replace(/\?/g, '_');
        return `"${p}"`;
      });
      const pathMatch = trimmed.match(/^find\s+(\S+)/);
      path = pathMatch ? pathMatch[1] : '.';
      return `dir /s /b "${path}" | findstr /i ${ps.join(' ')}`;
    }

    const pathMatch = trimmed.match(/^find\s+(\S+)/);
    if (pathMatch) path = pathMatch[1];
    if (patterns.length > 0) {
      return `dir /s /b "${path}" | findstr /i ${patterns.join(' ')}`;
    }
    return `dir /s /b "${path}"`;
  }

  // ═══════════════════════════════════════════════════════
  // cat / head / tail
  // ═══════════════════════════════════════════════════════

  // cat file  →  type file
  if (/^cat\s+[\w.-]/.test(trimmed)) {
    const file = trimmed.replace(/^cat\s+/, '').trim();
    return `type "${file}"`;
  }

  // head -n N file  →  Get-Content file | Select-Object -First N
  if (/^head\s+/.test(trimmed)) {
    const nMatch = trimmed.match(/head\s+(?:-n\s+)?(\d+)/i);
    const n = nMatch ? nMatch[1] : 10;
    const file = trimmed.replace(/^head\s+(?:-n\s+)?\d+\s*/, '').trim();
    return `Get-Content "${file}" | Select-Object -First ${n}`;
  }

  // tail -n N file  →  Get-Content file -Tail N
  if (/^tail\s+/.test(trimmed)) {
    const nMatch = trimmed.match(/tail\s+(?:-n\s+)?(\d+)/i);
    const n = nMatch ? nMatch[1] : 10;
    const file = trimmed.replace(/^tail\s+(?:-n\s+)?\d+\s*/, '').trim();
    return `Get-Content "${file}" -Tail ${n}`;
  }

  // ═══════════════════════════════════════════════════════
  // mkdir
  // ═══════════════════════════════════════════════════════

  // mkdir -p dir  →  New-Item -ItemType Directory -Force dir
  if (/^mkdir\s+-p\s+/.test(trimmed)) {
    const dir = trimmed.replace(/^mkdir\s+-p\s+/, '').trim();
    return `New-Item -ItemType Directory -Force -Path "${dir}"`;
  }

  // mkdir dir  →  mkdir dir (exists)
  if (/^mkdir\s+/.test(trimmed)) {
    const dir = trimmed.replace(/^mkdir\s+/, '').trim();
    return `if (!(Test-Path "${dir}")) { New-Item -ItemType Directory -Path "${dir}" }`;
  }

  // ═══════════════════════════════════════════════════════
  // rm / rm -rf
  // ═══════════════════════════════════════════════════════

  // rm -rf dir  →  Remove-Item -Recurse -Force dir
  if (/^rm\s+-rf\s+/.test(trimmed) || /^rm\s+-r\s+-f\s+/.test(trimmed)) {
    const target = trimmed.replace(/^rm\s+-r\s+-f\s+/, '').replace(/^rm\s+-rf\s+/, '').trim();
    return `Remove-Item -Recurse -Force "${target}"`;
  }

  // rm file  →  del file
  if (/^rm\s+/.test(trimmed)) {
    const file = trimmed.replace(/^rm\s+/, '').trim();
    return `del "${file}"`;
  }

  // ═══════════════════════════════════════════════════════
  // cp / mv
  // ═══════════════════════════════════════════════════════

  // cp -r src dest  →  Copy-Item -Recurse src dest
  if (/^cp\s+-r\s+/.test(trimmed)) {
    const args = trimmed.replace(/^cp\s+-r\s+/, '').split(/\s+(?=\S)/);
    const src = args[0], dest = args[1] || '.';
    return `Copy-Item -Recurse "${src}" "${dest}"`;
  }

  // cp src dest  →  copy src dest
  if (/^cp\s+/.test(trimmed)) {
    const args = trimmed.replace(/^cp\s+/, '').split(/\s+(?=\S)/);
    const src = args[0], dest = args[1] || '.';
    return `copy "${src}" "${dest}"`;
  }

  // mv src dest  →  move src dest
  if (/^mv\s+/.test(trimmed)) {
    const args = trimmed.replace(/^mv\s+/, '').split(/\s+(?=\S)/);
    const src = args[0], dest = args[1] || '.';
    return `move "${src}" "${dest}"`;
  }

  // ═══════════════════════════════════════════════════════
  // touch
  // ═══════════════════════════════════════════════════════

  // touch file  →  New-Item -ItemType File -Force file
  if (/^touch\s+/.test(trimmed)) {
    const file = trimmed.replace(/^touch\s+/, '').trim();
    return `New-Item -ItemType File -Force -Path "${file}" | Out-Null`;
  }

  // ═══════════════════════════════════════════════════════
  // pwd
  // ═══════════════════════════════════════════════════════

  if (/^pwd\b/.test(trimmed)) {
    return '(Get-Location).Path';
  }

  // ═══════════════════════════════════════════════════════
  // which / where
  // ═══════════════════════════════════════════════════════

  if (/^which\s+/.test(trimmed)) {
    const cmd = trimmed.replace(/^which\s+/, '').trim();
    return `where ${cmd}`;
  }

  // ═══════════════════════════════════════════════════════
  // echo
  // ═══════════════════════════════════════════════════════

  if (/^echo\s+/.test(trimmed)) {
    const text = trimmed.replace(/^echo\s+/, '');
    // echo "text" > file  →  "text" | Out-File file
    const redirectMatch = text.match(/^(.+?)\s*>\s*(.+)$/);
    if (redirectMatch) {
      return `"${redirectMatch[1].trim()}" | Out-File -FilePath "${redirectMatch[2].trim()}"`;
    }
    return `echo ${text}`;
  }

  // ═══════════════════════════════════════════════════════
  // export / env
  // ═══════════════════════════════════════════════════════

  if (/^export\s+\w+=/.test(trimmed)) {
    const match = trimmed.match(/^export\s+(\w+)=(.+)$/);
    if (match) return `$env:${match[1]}="${match[2].trim()}"`;
  }

  if (/^echo\s+\$[\w]+/.test(trimmed)) {
    const varName = trimmed.match(/^echo\s+\$(\w+)/)[1];
    return `Write-Output $env:${varName}`;
  }

  // ═══════════════════════════════════════════════════════
  // chmod
  // ═══════════════════════════════════════════════════════

  if (/^chmod\s+/.test(trimmed)) {
    return `echo "chmod not available on Windows: ${trimmed.replace(/"/g, '\\"')}"`;
  }

  // ═══════════════════════════════════════════════════════
  // uname
  // ═══════════════════════════════════════════════════════

  if (/^uname/.test(trimmed)) {
    return `[System.Environment]::OSVersion.VersionString`;
  }

  // ═══════════════════════════════════════════════════════
  // curl / wget
  // ═══════════════════════════════════════════════════════

  if (/^curl\s+/.test(trimmed) && !/^-O|--output/.test(trimmed)) {
    const urlMatch = trimmed.match(/^curl\s+(.+)/);
    if (urlMatch) return `curl.exe -sL "${urlMatch[1].trim()}"`;
  }

  // ═══════════════════════════════════════════════════════
  // 其他未匹配的，保持原样（Windows 兼容命令如 dir, type, del 等）
  // ═══════════════════════════════════════════════════════

  return cmd;
}

module.exports = { convertCommand };
