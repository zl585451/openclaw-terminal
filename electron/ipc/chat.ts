import { ipcMain, Notification } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ChatHistoryItem, IpcDeps, UploadedFile } from './types';

const CHAT_HISTORY_PATH = path.join(os.homedir(), '.openclaw', 'claw-terminal-history.json');
const MAX_HISTORY = 100;

// ── 多对话存储 ────────────────────────────────────────────────
// 对话索引：[{ id, title, updatedAt, preview }]
// 每条对话消息：conversations/<id>.json
const CONV_DIR = path.join(os.homedir(), '.openclaw', 'conversations');
const CONV_INDEX_PATH = path.join(os.homedir(), '.openclaw', 'conversations.json');
const DEFAULT_CONV_ID = 'main'; // 与 Gateway 现有 sessionKey 'main' 对齐，迁移老记录用

interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: number;
  preview?: string;
}

function safeConvId(id: string): string {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || DEFAULT_CONV_ID;
}

function convFile(id: string): string {
  return path.join(CONV_DIR, `${safeConvId(id)}.json`);
}

function readJsonSafe<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch { /* ignore */ }
  return fallback;
}

function writeJsonSafe(file: string, data: unknown): boolean {
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 0), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// 首次启动：若无对话索引，则把老的单一历史迁移成「默认对话」，不删除老文件（可回退）
function ensureConversationsInitialized(): ConversationMeta[] {
  const existing = readJsonSafe<ConversationMeta[] | null>(CONV_INDEX_PATH, null);
  if (Array.isArray(existing) && existing.length > 0) return existing;

  const legacy = readJsonSafe<Array<{ role: string; content: string }>>(CHAT_HISTORY_PATH, []);
  const lastUser = [...legacy].reverse().find((m) => m.role === 'user');
  const hasLegacy = Array.isArray(legacy) && legacy.length > 0;
  const index: ConversationMeta[] = [{
    id: DEFAULT_CONV_ID,
    title: hasLegacy ? '默认对话' : '新对话',
    updatedAt: Date.now(),
    preview: lastUser ? String(lastUser.content || '').slice(0, 60) : '',
  }];
  writeJsonSafe(CONV_INDEX_PATH, index);
  return index;
}

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

  // ── 多对话：索引 + 按对话存消息 ──────────────────────────
  ipcMain.handle('conversations-load', async () => {
    return ensureConversationsInitialized();
  });

  ipcMain.handle('conversations-save', async (_event: unknown, index: ConversationMeta[]) => {
    const ok = writeJsonSafe(CONV_INDEX_PATH, Array.isArray(index) ? index : []);
    return { success: ok };
  });

  ipcMain.handle('conversation-messages-load', async (_event: unknown, id: string) => {
    const file = convFile(id);
    // 默认对话首次读取时回退到老的单一历史文件，保证已有记录不丢
    if (!fs.existsSync(file) && safeConvId(id) === DEFAULT_CONV_ID) {
      return readJsonSafe<ChatHistoryItem[]>(CHAT_HISTORY_PATH, []).slice(-MAX_HISTORY);
    }
    return readJsonSafe<ChatHistoryItem[]>(file, []).slice(-MAX_HISTORY);
  });

  ipcMain.handle('conversation-messages-save', async (_event: unknown, payload: { id: string; items: ChatHistoryItem[] }) => {
    const id = payload?.id;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const toSave = items.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || '',
      ...(m.isSystemReply && { isSystemReply: true }),
    }));
    const ok = writeJsonSafe(convFile(id), toSave);
    return { success: ok };
  });

  ipcMain.handle('conversation-delete', async (_event: unknown, id: string) => {
    try {
      const file = convFile(id);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  });

  // 切换/新建对话时设置当前 sessionKey，发送链路据此归属到对应 Gateway 会话
  ipcMain.handle('openclaw-set-session', async (_event: unknown, sessionKey: string) => {
    const key = safeConvId(sessionKey);
    deps.setSessionKey?.(key);
    return { success: true, sessionKey: key };
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

  ipcMain.handle('openclaw-cancel', () => deps.cancelChatMessage());

  ipcMain.handle('openclaw-status', () => deps.getOpenClawStatus());

  ipcMain.handle('show-notification', (_event: unknown, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });
}
