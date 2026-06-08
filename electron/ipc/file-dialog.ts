import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { IpcDeps } from './types';

function safeDraftName(input: string): string {
  const base = String(input || 'script')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return base || 'script';
}

function ensureScriptDraftDir(): string {
  const { app } = require('electron');
  const dir = path.join(app.getPath('userData'), 'script-drafts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createScriptDraftPath(fileName: string): string {
  const draftDir = ensureScriptDraftDir();
  const stem = safeDraftName(path.basename(fileName, path.extname(fileName)));
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(draftDir, `${stem}-${ts}.txt`);
}

export function registerFileDialogHandlers(deps: IpcDeps) {
  ipcMain.handle('open-image-dialog', async () => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return { success: false, error: 'Window not available' };
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { success: false };
    try {
      const buf = fs.readFileSync(result.filePaths[0]);
      const ext = path.extname(result.filePaths[0]).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
      };
      return { success: true, base64: buf.toString('base64'), mime: mimeMap[ext] || 'image/png' };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  });

  ipcMain.handle('open-file-dialog', async (_: unknown, options?: { allowMultiple?: boolean; filters?: { name: string; extensions: string[] }[] }) => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return { success: false, error: 'Window not available' };
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: options?.filters || [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'json', 'csv', 'xls', 'xlsx'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
        { name: 'Video', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
        { name: 'Code', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'html', 'css', 'sql'] },
      ],
      properties: options?.allowMultiple ? ['openFile', 'multiSelections'] : ['openFile']
    });

    if (result.canceled || !result.filePaths.length) return { success: false };

    try {
      const files = await Promise.all(result.filePaths.map(async (filePath: string) => {
        const stats = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath);

        const mimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
          '.webp': 'image/webp', '.bmp': 'image/bmp',
          '.pdf': 'application/pdf',
          '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
          '.csv': 'text/csv',
          '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
          '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
          '.js': 'text/javascript', '.ts': 'text/typescript', '.jsx': 'text/javascript', '.tsx': 'text/typescript',
          '.py': 'text/x-python', '.java': 'text/x-java', '.cpp': 'text/x-c++', '.c': 'text/x-c',
          '.h': 'text/x-c-header', '.go': 'text/x-go', '.rs': 'text/x-rust',
          '.html': 'text/html', '.css': 'text/css', '.sql': 'text/x-sql',
        };

        const mimeType = mimeMap[ext] || 'application/octet-stream';
        const isImage = mimeType.startsWith('image/');

        if (isImage) {
          const buf = fs.readFileSync(filePath);
          return {
            path: filePath,
            name: fileName,
            size: stats.size,
            ext: ext.slice(1),
            mimeType,
            isText: false,
            content: null,
            base64: buf.toString('base64'),
          };
        }
        return {
          path: filePath,
          name: fileName,
          size: stats.size,
          ext: ext.slice(1),
          mimeType,
          isText: false,
          content: null,
          base64: '',
        };
      }));

      return { success: true, files };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  });

  ipcMain.handle('save-script-draft-cache', async (_: unknown, payload: {
    content?: string;
    draftCachePath?: string;
    sourcePath?: string;
    title?: string;
  }) => {
    try {
      const content = String(payload?.content || '');
      if (!content.trim()) {
        return { success: false, error: 'content is empty' };
      }

      const draftPath = payload?.draftCachePath
        ? String(payload.draftCachePath)
        : createScriptDraftPath(payload?.title || payload?.sourcePath || 'script-draft');
      const resolved = path.resolve(draftPath);
      const draftRoot = path.resolve(ensureScriptDraftDir());
      if (!resolved.startsWith(draftRoot)) {
        return { success: false, error: 'invalid draft cache path' };
      }

      fs.writeFileSync(resolved, content, 'utf-8');
      return { success: true, draftCachePath: resolved };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('parse-script-file', async () => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return { success: false, error: 'Window not available' };
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择剧本文件',
      filters: [
        { name: '剧本文件', extensions: ['txt', 'docx'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { success: false };

    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    try {
      let text = '';
      if (ext === '.docx') {
        const mammoth = require('mammoth');
        const { value } = await mammoth.extractRawText({ path: filePath });
        text = value;
      } else {
        const buf = fs.readFileSync(filePath);
        text = buf.toString('utf-8');
        if (text.includes('\uFFFD')) {
          const { TextDecoder } = require('util');
          text = new TextDecoder('gbk').decode(buf);
        }
      }
      const draftCachePath = createScriptDraftPath(fileName);
      fs.writeFileSync(draftCachePath, text, 'utf-8');
      return { success: true, text, fileName, sourcePath: filePath, draftCachePath };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  });
}
