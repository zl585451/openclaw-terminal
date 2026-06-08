import { ipcMain } from 'electron';
import type { IpcDeps } from './types';

const GATEWAY_PORT = 18789;

export function registerGatewayHandlers(deps: IpcDeps) {
  const getMainWindow = () => deps.getMainWindow();

  ipcMain.handle('start-gateway', async () => {
    const isPortInUse = (globalThis as any).isPortInUse;
    const killPortProcess = (globalThis as any).killPortProcess;
    const startOctGateway = (globalThis as any).startOctGateway;
    const connectOpenClaw = (globalThis as any).connectOpenClaw;
    const suppressAutoReconnect = (v: boolean) => { (globalThis as any).suppressAutoReconnect = v; };
    const reconnectRetryCount = (v: number) => { (globalThis as any).reconnectRetryCount = v; };

    if (await isPortInUse(GATEWAY_PORT)) {
      await killPortProcess(GATEWAY_PORT);
      await new Promise(r => setTimeout(r, 1500));
    }
    const result = await startOctGateway();
    if (result.success) {
      getMainWindow()?.webContents.send('openclaw-log-lines', ['[OCT Gateway] 已启动 ✅']);
      suppressAutoReconnect(false);
      reconnectRetryCount(0);
      await new Promise((r) => setTimeout(r, 800));
      connectOpenClaw();
    }
    return result;
  });

  ipcMain.handle('stop-gateway', () => {
    const octGatewayProcess = (globalThis as any).octGatewayProcess;
    const gatewayProcess = (globalThis as any).gatewayProcess;
    const expectOctGatewayProcessExit = (v: boolean) => { (globalThis as any).expectOctGatewayProcessExit = v; };

    if (octGatewayProcess && !octGatewayProcess.killed) {
      expectOctGatewayProcessExit(true);
      octGatewayProcess.kill();
      (globalThis as any).octGatewayProcess = null;
    }
    if (gatewayProcess && !gatewayProcess.killed) {
      gatewayProcess.kill();
      (globalThis as any).gatewayProcess = null;
    }
    getMainWindow()?.webContents.send('gateway-status', { running: false, managed: false });
    getMainWindow()?.webContents.send('openclaw-log-lines', ['[Gateway] 已停止']);
    return { success: true };
  });

  ipcMain.handle('gateway-restart', async () => {
    const octGatewayProcess = (globalThis as any).octGatewayProcess;
    const gatewayProcess = (globalThis as any).gatewayProcess;
    const openclawWs = deps.getOpenclawWs();
    const expectOctGatewayProcessExit = (v: boolean) => { (globalThis as any).expectOctGatewayProcessExit = v; };
    const suppressAutoReconnect = (v: boolean) => { (globalThis as any).suppressAutoReconnect = v; };
    const reconnectRetryCount = (v: number) => { (globalThis as any).reconnectRetryCount = v; };
    const killPortProcess = (globalThis as any).killPortProcess;
    const getOctGatewayEntry = (globalThis as any).getOctGatewayEntry;
    const startOctGateway = (globalThis as any).startOctGateway;
    const connectOpenClaw = (globalThis as any).connectOpenClaw;

    if (octGatewayProcess && !octGatewayProcess.killed) {
      expectOctGatewayProcessExit(true);
      octGatewayProcess.kill();
      (globalThis as any).octGatewayProcess = null;
    }
    if (gatewayProcess && !gatewayProcess.killed) {
      gatewayProcess.kill();
      (globalThis as any).gatewayProcess = null;
    }
    getMainWindow()?.webContents.send('gateway-status', { running: false, managed: false });
    getMainWindow()?.webContents.send('openclaw-log-lines', ['[Gateway] 正在重启...']);
    await killPortProcess(GATEWAY_PORT);
    await new Promise(r => setTimeout(r, 2500));
    const octEntry = getOctGatewayEntry();
    if (octEntry) {
      const octResult = await startOctGateway();
      if (octResult.success) {
        await new Promise(r => setTimeout(r, 1500));
        getMainWindow()?.webContents.send('gateway-status', { running: true, managed: true });
        getMainWindow()?.webContents.send('openclaw-log-lines', ['[Gateway] 已启动']);
        if (openclawWs) { openclawWs.close(); deps.setOpenclawWs(null); }
        suppressAutoReconnect(false);
        reconnectRetryCount(0);
        connectOpenClaw();
        return { success: true };
      }
    }
    getMainWindow()?.webContents.send('openclaw-log-lines', ['[Gateway] 重启失败']);
    return { success: false, error: 'OCT Gateway 启动失败' };
  });

  ipcMain.handle('kill-port-18789', async () => {
    const { execSync } = await import('child_process');
    try {
      const port = 18789;
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', windowsHide: true });
      const lines = out.trim().split(/\r?\n/);
      for (const line of lines) {
        const m = line.trim().match(/\s+(\d+)\s*$/);
        if (m) {
          const pid = parseInt(m[1], 10);
          if (pid > 0) {
            execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf-8', windowsHide: true });
            getMainWindow()?.webContents.send('openclaw-log-lines', [`[System] 已终止 PID ${pid} (端口 ${port})`]);
            return { success: true };
          }
        }
      }
      getMainWindow()?.webContents.send('openclaw-log-lines', [`[System] 端口 ${port} 无占用进程`]);
      return { success: true };
    } catch (e: any) {
      getMainWindow()?.webContents.send('openclaw-log-lines', [`[System] 清理失败: ${e?.message || String(e)}`]);
      return { success: false, error: e?.message };
    }
  });

  ipcMain.handle('gateway-clear-port-and-start', async () => {
    const octGatewayProcess = (globalThis as any).octGatewayProcess;
    const gatewayProcess = (globalThis as any).gatewayProcess;
    const openclawWs = deps.getOpenclawWs();
    const expectOctGatewayProcessExit = (v: boolean) => { (globalThis as any).expectOctGatewayProcessExit = v; };
    const suppressAutoReconnect = (v: boolean) => { (globalThis as any).suppressAutoReconnect = v; };
    const reconnectRetryCount = (v: number) => { (globalThis as any).reconnectRetryCount = v; };
    const getOctGatewayEntry = (globalThis as any).getOctGatewayEntry;
    const startOctGateway = (globalThis as any).startOctGateway;
    const connectOpenClaw = (globalThis as any).connectOpenClaw;

    getMainWindow()?.webContents.send('openclaw-log-lines', ['[System] 正在清理 18789 端口并启动 OCT Gateway...']);
    if (octGatewayProcess && !octGatewayProcess.killed) {
      expectOctGatewayProcessExit(true);
      octGatewayProcess.kill();
      (globalThis as any).octGatewayProcess = null;
    }
    if (gatewayProcess && !gatewayProcess.killed) {
      gatewayProcess.kill();
      (globalThis as any).gatewayProcess = null;
    }
    const { execSync } = await import('child_process');
    const port = GATEWAY_PORT;
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', windowsHide: true });
      const lines = out.trim().split(/\r?\n/);
      const pidsToKill = new Set<number>();
      for (const line of lines) {
        if (!/LISTENING/i.test(line)) continue;
        const m = line.trim().match(/\s+(\d+)\s*$/);
        if (m) {
          const pid = parseInt(m[1], 10);
          if (pid > 0) pidsToKill.add(pid);
        }
      }
      for (const pid of pidsToKill) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf-8', windowsHide: true });
          getMainWindow()?.webContents.send('openclaw-log-lines', [`[System] 已终止监听端口 ${port} 的进程 PID ${pid}`]);
        } catch (_) {}
      }
      if (pidsToKill.size === 0) {
        getMainWindow()?.webContents.send('openclaw-log-lines', ['[System] 端口 18789 当前无进程监听']);
      }
    } catch (_) {
      getMainWindow()?.webContents.send('openclaw-log-lines', ['[System] 端口 18789 当前无进程监听']);
    }
    getMainWindow()?.webContents.send('gateway-status', { running: false, managed: false });
    await new Promise(r => setTimeout(r, 2000));
    const octEntry = getOctGatewayEntry();
    if (!octEntry) {
      getMainWindow()?.webContents.send('openclaw-log-lines', ['[System] 未找到 oct-gateway，无法启动']);
      return { success: false, error: 'OCT Gateway 未找到' };
    }
    const octResult = await startOctGateway();
    if (!octResult.success) {
      getMainWindow()?.webContents.send('openclaw-log-lines', [`[System] 启动失败: ${octResult.error}`]);
      return { success: false, error: octResult.error };
    }
    getMainWindow()?.webContents.send('openclaw-log-lines', ['[OCT Gateway] 已启动，等待就绪...']);
    await new Promise(r => setTimeout(r, 1500));
    getMainWindow()?.webContents.send('gateway-status', { running: true, managed: true });
    getMainWindow()?.webContents.send('openclaw-log-lines', ['[OCT Gateway] 已启动 ✅', '[连接] 正在连接...']);
    if (openclawWs) {
      openclawWs.close();
      deps.setOpenclawWs(null);
    }
    suppressAutoReconnect(false);
    reconnectRetryCount(0);
    connectOpenClaw();
    return { success: true };
  });

  ipcMain.handle('gateway-status', async () => {
    const octGatewayProcess = (globalThis as any).octGatewayProcess;
    const isPortInUse = (globalThis as any).isPortInUse;
    const octRunning = !!(octGatewayProcess && !octGatewayProcess.killed);
    const portInUse = await isPortInUse(GATEWAY_PORT);
    return {
      running: octRunning || portInUse,
      managed: octRunning,
      portInUse,
      engine: octRunning ? 'oct-gateway' : portInUse ? 'external' : 'none',
    };
  });

  ipcMain.handle('omniroute-status', async () => {
    const statusUrl = `http://127.0.0.1:${GATEWAY_PORT + 1}/omniroute/status`;
    try {
      const res = await fetch(statusUrl, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        return {
          success: false,
          error: `HTTP Error ${res.status}`,
          status: res.status,
          checkedUrl: statusUrl,
        };
      }
      const data = await res.json();
      return {
        success: true,
        data,
        checkedUrl: statusUrl,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || '无法连接 Gateway 后台服务',
        checkedUrl: statusUrl,
      };
    }
  });

  ipcMain.handle('get-env', (_: unknown, key: string) => process.env[key] || '');

  ipcMain.handle('invoke-gateway-tool', async (_: unknown, toolName: string, args: any) => {
    const toolPort = GATEWAY_PORT + 1;
    try {
      const res = await fetch(`http://127.0.0.1:${toolPort}/tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, args: args || {} }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '工具执行失败');
      return data.result;
    } catch (e: any) {
      throw new Error(e?.message || 'Gateway 工具调用失败');
    }
  });
}
