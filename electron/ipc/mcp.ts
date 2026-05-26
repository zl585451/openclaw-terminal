import { ipcMain } from 'electron';
import type { IpcDeps } from './types';

const GATEWAY_HTTP_PORT = 18790;

export function registerMcpHandlers(_deps: IpcDeps) {
  ipcMain.handle('mcp-get-status', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${GATEWAY_HTTP_PORT}/mcp/status`);
      return await res.json();
    } catch {
      return {};
    }
  });

  ipcMain.handle('mcp-add-server', async (_: unknown, name: string, cfg: any) => {
    try {
      const body = {
        name,
        command: cfg?.command,
        args: cfg?.args,
        env: cfg?.env && typeof cfg.env === 'object' ? cfg.env : {},
      };
      const res = await fetch(`http://127.0.0.1:${GATEWAY_HTTP_PORT}/mcp/server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('mcp-remove-server', async (_: unknown, name: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:${GATEWAY_HTTP_PORT}/mcp/server/${name}`, {
        method: 'DELETE',
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });
}
