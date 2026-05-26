import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import type { IpcDeps } from './types';

export function registerCodeWindowHandlers(deps: IpcDeps) {
  ipcMain.handle('open-code-window', (_event: unknown, payload: { language?: string; code?: string }) => {
    const language = payload?.language || 'text';
    const code = typeof payload?.code === 'string' ? payload.code : '';
    const existing = deps.getCodeWindow();

    if (existing && !existing.isDestroyed()) {
      existing.close();
      deps.setCodeWindow(null);
    }

    deps.setPendingCodeWindowData({ language, code });
    const codeWindow = new BrowserWindow({
      width: 700,
      height: 500,
      minWidth: 400,
      minHeight: 300,
      frame: true,
      backgroundColor: '#0a0a0f',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    const codeWinPath = path.join(__dirname, '..', 'code-window.html');
    codeWindow.loadFile(codeWinPath);
    deps.setCodeWindow(codeWindow);

    codeWindow.on('closed', () => {
      deps.setCodeWindow(null);
      deps.setPendingCodeWindowData(null);
    });

    return { success: true };
  });

  ipcMain.on('code-window-ready', (event) => {
    const pending = deps.getPendingCodeWindowData();
    if (pending && event.sender) {
      event.sender.send('code-window-data', pending);
      deps.setPendingCodeWindowData(null);
    }
  });

  ipcMain.on('code-window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
}
