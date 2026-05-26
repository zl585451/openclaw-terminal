import { ipcMain, dialog, shell } from 'electron';
import * as fs from 'fs';
import type { IpcDeps, WebSocketLike } from './types';

function guessImageExtension(url: string): string {
  const cleanUrl = String(url || '').split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.png')) return 'png';
  if (cleanUrl.endsWith('.webp')) return 'webp';
  if (cleanUrl.endsWith('.gif')) return 'gif';
  if (cleanUrl.endsWith('.bmp')) return 'bmp';
  return 'jpg';
}

export interface ImageDeps extends IpcDeps {
  openclawWs: WebSocketLike | null;
}

export function registerImageHandlers(deps: ImageDeps) {
  ipcMain.handle('image-generate', async (_event: unknown, payload: {
    requestId: string;
    prompt: string;
    negativePrompt?: string;
    aspectRatio?: string;
    width?: number;
    height?: number;
    seed?: number | string;
    promptOptimizer?: boolean;
    aigcWatermark?: boolean;
    stylePreset?: string;
    quality?: string;
  }) => {
    const openclawWs = deps.getOpenclawWs();
    if (!openclawWs || openclawWs.readyState !== 1) {
      return { success: false, error: 'Gateway 未连接，请先启动 Gateway' };
    }

    const requestId = payload?.requestId || `img_${Date.now()}`;
    const msg = {
      type: 'req',
      id: requestId,
      method: 'image.generate',
      params: {
        requestId,
        prompt: String(payload?.prompt || ''),
        negativePrompt: String(payload?.negativePrompt || ''),
        aspectRatio: String(payload?.aspectRatio || ''),
        width: payload?.width,
        height: payload?.height,
        seed: payload?.seed,
        promptOptimizer: payload?.promptOptimizer === true,
        aigcWatermark: payload?.aigcWatermark === true,
        stylePreset: String(payload?.stylePreset || ''),
        quality: String(payload?.quality || ''),
      },
    };

    try {
      openclawWs.send(JSON.stringify(msg));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || '发送失败' };
    }
  });

  ipcMain.handle('open-external-url', async (_event: unknown, url: string) => {
    const target = String(url || '').trim();
    if (!target) return { success: false, error: 'URL 不能为空' };
    await shell.openExternal(target);
    return { success: true };
  });

  ipcMain.handle('download-image', async (_event: unknown, payload: { url: string; suggestedName?: string }) => {
    const target = String(payload?.url || '').trim();
    if (!target) return { success: false, error: '图片 URL 不能为空' };

    try {
      const ext = guessImageExtension(target);
      const suggestedName = String(payload?.suggestedName || '').trim() || `oct-image-${Date.now()}.${ext}`;
      const saveOptions = {
        defaultPath: suggestedName,
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      };
      const saveResult = deps.mainWindow
        ? await dialog.showSaveDialog(deps.mainWindow, saveOptions)
        : await dialog.showSaveDialog(saveOptions);

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, error: '已取消下载' };
      }

      const res = await fetch(target, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) {
        return { success: false, error: `下载失败：HTTP ${res.status}` };
      }
      const arrayBuffer = await res.arrayBuffer();
      fs.writeFileSync(saveResult.filePath, Buffer.from(arrayBuffer));
      return { success: true, path: saveResult.filePath };
    } catch (err: any) {
      return { success: false, error: err?.message || '下载图片失败' };
    }
  });
}
