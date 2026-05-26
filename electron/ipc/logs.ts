import { ipcMain } from 'electron';
import type { IpcDeps } from './types';

const DEFAULT_LOG_PATH = 'DEFAULT_LOG_PATH_PLACEHOLDER';

function isNoisyLogLine(line: unknown): boolean {
  if (typeof line !== 'string') return false;
  const noisy = [
    'typing indicator',
    'sending 1 card chunks',
    'sending 2 card chunks',
    'sending 3 card chunks',
    'dispatch complete',
    'card chunks',
  ];
  const lower = line.toLowerCase();
  return noisy.some((n) => lower.includes(n));
}

function formatGatewayLogLine(rawLine: string): string | null {
  try {
    const obj = JSON.parse(rawLine) as Record<string, unknown>;
    const time = (obj?.time as string) || '';
    const meta = obj?._meta as Record<string, string> | undefined;
    const level = ((meta?.logLevelName ?? obj?.level ?? 'INFO') as string).toUpperCase();
    let msg = obj?.['1'] ?? obj?.msg ?? obj?.message ?? '';
    if (msg && typeof msg !== 'string') msg = JSON.stringify(msg);
    msg = String(msg || '');
    let hhmmss = '--:--:--';
    if (time) {
      const d = new Date(time);
      if (!isNaN(d.getTime())) {
        hhmmss = d.toTimeString().slice(0, 8);
      }
    }
    return `[${hhmmss}] [${level}] ${msg}`.trim();
  } catch {
    return null;
  }
}

export function registerLogsHandlers(_deps: IpcDeps) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const getMainWindow = () => (globalThis as any).mainWindow;
  const getLogTailProcess = () => (globalThis as any).logTailProcess;
  const setLogTailProcess = (v: any) => { (globalThis as any).logTailProcess = v; };
  const getLogWatcher = () => (globalThis as any).logWatcher;
  const setLogWatcher = (v: any) => { (globalThis as any).logWatcher = v; };

  const sendLogLines = (lines: string[]) => {
    const mainWindow = getMainWindow();
    mainWindow?.webContents.send('openclaw-log-lines', lines);
  };

  ipcMain.handle('read-log-file', async (_, logPath: string) => {
    const { spawn } = require('child_process');
    const app = require('electron').app;
    const defaultLogPath = path.join(os.homedir(), '.openclaw', 'logs', 'gateway.log');
    const pathToUse = logPath || process.env.OPENCLAW_LOG_PATH || defaultLogPath;

    try {
      if (!fs.existsSync(pathToUse)) {
        return { success: false, error: 'File not found' };
      }
      const content = fs.readFileSync(pathToUse, 'utf-8');
      const lines = content.split('\n').filter((l: string) => l.trim());
      return { success: true, content, lines };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('start-log-watch', async (_, logPath: string) => {
    const { spawn } = require('child_process');
    const app = require('electron').app;
    const defaultLogPath = path.join(os.homedir(), '.openclaw', 'logs', 'gateway.log');
    const pathToUse = logPath || process.env.OPENCLAW_LOG_PATH || defaultLogPath;
    console.log('[LOG] Starting log watch for:', pathToUse);

    const existingTailProcess = getLogTailProcess();
    if (existingTailProcess) {
      try { existingTailProcess.kill(); } catch {}
      setLogTailProcess(null);
    }
    const existingWatcher = getLogWatcher();
    if (existingWatcher) {
      try { existingWatcher.close(); } catch {}
      setLogWatcher(null);
    }

    if (!fs.existsSync(pathToUse)) {
      console.log('[LOG] File does not exist:', pathToUse);
      sendLogLines([
        '[LOG] 日志文件不存在，且 Gateway 不是由 CLAW TERMINAL 启动。',
        '[LOG] 请点击 [▶ 启动] 以获取实时日志。',
      ]);
      return { success: false, error: 'Log file not found' };
    }

    try {
      const seenRaw = new Set<string>();
      const content = fs.readFileSync(pathToUse, 'utf-8');
      const allLines = content.split('\n').filter((l: string) => l.trim());
      const formatted: string[] = [];
      for (const raw of allLines.slice(-20)) {
        const r = raw.trim();
        if (seenRaw.has(r)) continue;
        seenRaw.add(r);
        const msg = (() => { try { const o = JSON.parse(raw); return o?.['1'] ?? o?.message ?? ''; } catch { return raw; } })();
        if (isNoisyLogLine(msg)) continue;
        const out = formatGatewayLogLine(raw);
        if (out) formatted.push(out);
      }
      if (formatted.length > 0) {
        sendLogLines(formatted);
      } else {
        sendLogLines(['[LOG] 等待Gateway日志...']);
      }

      const platform = process.platform;
      let tailProcess: any = null;

      if (platform === 'win32') {
        const psPath = pathToUse.replace(/'/g, "''");
        const psCmd = `$p='${psPath}'; while($true){if(Test-Path -LiteralPath $p){Get-Content -LiteralPath $p -Tail 10 -Encoding UTF8}; Start-Sleep -Milliseconds 500}`;

        try {
          const { execSync } = require('child_process');
          execSync('where powershell.exe', { stdio: 'ignore', windowsHide: true });
          tailProcess = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
          });
        } catch (e) {
          console.warn('[Main] PowerShell not found, using fallback log watcher');
          sendLogLines(['[WARN] PowerShell 未找到，使用备用日志监控']);
          try {
            const fsWatcher = fs.watch(pathToUse, { persistent: false }, (eventType: string) => {
              if (eventType === 'change' && fs.existsSync(pathToUse)) {
                try {
                  const c = fs.readFileSync(pathToUse, 'utf-8');
                  const ls = c.split('\n').slice(-10);
                  ls.forEach((line: string) => {
                    if (line.trim()) sendLogLines([line]);
                  });
                } catch (e2) {}
              }
            });
            setLogWatcher(fsWatcher);
          } catch (e2) {
            console.error('[Main] Fallback log watcher failed:', e2);
          }
        }
      } else {
        tailProcess = spawn('tail', ['-f', pathToUse], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      }

      if (tailProcess) {
        setLogTailProcess(tailProcess);
        let buf = '';
        tailProcess.stdout?.on('data', (chunk: Buffer) => {
          buf += chunk.toString('utf8');
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() ?? '';
          for (const raw of lines) {
            const t = raw.trim();
            if (!t || seenRaw.has(t)) continue;
            seenRaw.add(t);
            const msg = (() => { try { const o = JSON.parse(t); return o?.['1'] ?? o?.message ?? ''; } catch { return t; } })();
            if (isNoisyLogLine(msg)) continue;
            const out = formatGatewayLogLine(t);
            if (!out) continue;
            sendLogLines([out]);
          }
        });

        tailProcess.stderr?.on('data', (chunk: Buffer) => {
          const msg = chunk.toString('utf8').trim();
          if (msg) sendLogLines([`[ERR] ${msg}`]);
        });

        tailProcess.on('exit', (code: number) => {
          setLogTailProcess(null);
          if (code !== 0 && code !== null) {
            sendLogLines([`[LOG] tail 进程退出: ${code}`]);
          }
        });
      }

      sendLogLines(['[LOG] 正在监听日志...']);
      return { success: true };
    } catch (e) {
      console.log('[LOG] Exception:', e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle('stop-log-watch', () => {
    const tailProcess = getLogTailProcess();
    if (tailProcess) {
      try { tailProcess.kill(); } catch {}
      setLogTailProcess(null);
    }
    const watcher = getLogWatcher();
    if (watcher) {
      try { watcher.close(); } catch {}
      setLogWatcher(null);
    }
    return { success: true };
  });
}