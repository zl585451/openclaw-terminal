import { BrowserWindow, ipcMain } from 'electron';
import * as pty from 'node-pty';
import type { IpcDeps } from './types';

export function registerTerminalHandlers(deps: IpcDeps) {
  ipcMain.handle('open-terminal-window', () => {
    deps.createTerminalWindow();
    return { success: true };
  });

  ipcMain.on('terminal-ready', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== deps.getTerminalWindow()) return;

    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
    const cwd = process.env.HOME || process.env.USERPROFILE || process.cwd();
    const terminalPty = pty.spawn(shell, [], {
      cwd,
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24,
    });

    deps.setTerminalPty(terminalPty);
    terminalPty.onData((data) => {
      const terminalWindow = deps.getTerminalWindow();
      if (terminalWindow && !terminalWindow.isDestroyed()) {
        terminalWindow.webContents.send('terminal-data', data);
      }
    });

    terminalPty.onExit(() => {
      deps.setTerminalPty(null);
    });
  });

  ipcMain.on('terminal-input', (_event, data: string) => {
    const terminalPty = deps.getTerminalPty() as pty.IPty | null;
    terminalPty?.write(data);
  });

  ipcMain.on('terminal-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  ipcMain.on('terminal-set-pin', (event, pinned: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setAlwaysOnTop(pinned);
  });

  ipcMain.on('terminal-resize', (_event, cols: number, rows: number) => {
    const terminalPty = deps.getTerminalPty() as pty.IPty | null;
    terminalPty?.resize(cols, rows);
  });
}
