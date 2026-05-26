import { ipcMain, Notification } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { IpcDeps, UploadedFile } from './types';

const CHAT_HISTORY_PATH = path.join(os.homedir(), '.openclaw', 'claw-terminal-history.json');
const MAX_HISTORY = 100;

export function registerChatHandlers(deps: IpcDeps) {
  ipcMain.handle('chat-history-load', async () => {
    try {
      const raw = fs.readFileSync(CHAT_HISTORY_PATH, 'utf-8');
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.slice(-MAX_HISTORY);
    } catch {
      return [];
    }
  });

  ipcMain.handle('chat-history-save', async (_event: unknown, items: Array<{ role: string; content: string; timestamp: string; isSystemReply?: boolean }>) => {
    try {
      const dir = path.dirname(CHAT_HISTORY_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const toSave = (items || []).slice(-MAX_HISTORY).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || '',
        ...(m.isSystemReply && { isSystemReply: true }),
      }));
      fs.writeFileSync(CHAT_HISTORY_PATH, JSON.stringify(toSave, null, 0), 'utf-8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  });

  ipcMain.handle('openclaw-connect', () => {
    deps.connectOpenClaw();
    return { success: true };
  });

  ipcMain.handle('openclaw-send', (_event: unknown, payload: string | {
    content: string;
    imageDataUrl?: string | null;
    files?: UploadedFile[];
    pacingMs?: number;
    workbenchContext?: unknown;
    canvasContext?: unknown;
    requestId?: string;
    projectContext?: unknown;
  }) => {
    let content: string;
    let imageDataUrl: string | null | undefined;
    let files: UploadedFile[] | undefined;
    let pacingMs: number | undefined;
    let workbenchContext: unknown;
    let requestId: string | undefined;
    let projectContext: unknown;

    if (typeof payload === 'string') {
      content = payload;
      imageDataUrl = null;
    } else if (payload && typeof payload === 'object') {
      const c = payload.content;
      content = typeof c === 'string' ? c : (c ? String(c) : '');
      imageDataUrl = payload.imageDataUrl;
      files = payload.files;
      pacingMs = payload.pacingMs;
      workbenchContext = payload.workbenchContext ?? payload.canvasContext;
      requestId = typeof payload.requestId === 'string'
        ? String(payload.requestId).trim()
        : undefined;
      projectContext = payload.projectContext ?? undefined;
    } else {
      content = '';
      imageDataUrl = null;
    }

    return deps.sendChatMessage(content, imageDataUrl, files, pacingMs, workbenchContext, requestId, projectContext);
  });

  ipcMain.handle('openclaw-status', () => deps.getOpenClawStatus());

  ipcMain.handle('show-notification', (_event: unknown, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });
}
