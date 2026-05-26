import { ipcMain } from 'electron';
import type { IpcDeps } from './types';

export function registerWindowHandlers(deps: IpcDeps) {
  ipcMain.on('float-restore', () => {
    const mainWindow = deps.getMainWindow();
    const floatWindow = deps.getFloatWindow();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.close();
      deps.setFloatWindow(null);
    }
  });

  ipcMain.handle('enter-floating-mode', () => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      mainWindow.hide();
    }
    deps.createFloatWindow?.();
    return { success: true };
  });

  ipcMain.handle('set-always-on-top', (_: unknown, value: boolean) => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(value);
      return true;
    }
    return false;
  });

  ipcMain.handle('get-always-on-top', () => {
    const mainWindow = deps.getMainWindow();
    return mainWindow ? mainWindow.isAlwaysOnTop() : false;
  });

  ipcMain.handle('minimize-window', () => deps.getMainWindow()?.minimize());

  ipcMain.handle('maximize-window', () => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('close-window', () => deps.getMainWindow()?.close());

  ipcMain.handle('minimize-for-capture', () => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      mainWindow.setOpacity(0);
      mainWindow.setIgnoreMouseEvents(true);
      mainWindow.hide();
    }
    return { success: true };
  });

  ipcMain.handle('restore-after-capture', () => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      mainWindow.setOpacity(1);
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.show();
      mainWindow.focus();
    }
    return { success: true };
  });

  ipcMain.handle('get-screenshot-shortcut', () => {
    return 'Alt+A';
  });

  ipcMain.handle('set-screenshot-shortcut', (_: unknown, shortcut: string) => {
    return { success: true };
  });
}
