// Load .env file
import * as dotenv from 'dotenv';
import * as path from 'path';
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { app, BrowserWindow, ipcMain, Notification, dialog, screen, globalShortcut } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import { spawn } from 'child_process';
import * as pty from 'node-pty';
import * as crypto from 'crypto';
import WebSocket from 'ws';

let mainWindow: BrowserWindow | null = null;
let floatWindow: BrowserWindow | null = null;
let codeWindow: BrowserWindow | null = null;
let terminalWindow: BrowserWindow | null = null;
let terminalPty: pty.IPty | null = null;
let openclawWs: WebSocket | null = null;
let requestId = 0;
const MAX_RECONNECT_RETRIES = 999; // 增加重连次数上限
let reconnectRetryCount = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastSessionState: { messages?: any[]; sessionKey?: string } | null = null;
const SESSION_STATE_FILE = path.join(app.getPath('userData'), 'session-state.json');

// Gateway 进程管理
const GATEWAY_PORT = 18789;
const GATEWAY_CMD = path.join(os.homedir(), '.openclaw', 'gateway.cmd');

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onConnect = () => { socket.destroy(); resolve(true); };
    const onError = () => { socket.destroy(); resolve(false); };
    socket.setTimeout(800);
    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}
let gatewayProcess: ReturnType<typeof spawn> | null = null;
let gatewayManagedByUs = false; // 是否由本程序启动

// OpenClaw WebSocket config（Token 留空可跳过认证测试连接）
const OPENCLAW_WS_URL = process.env.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789';
const OPENCLAW_TOKEN = (process.env.OPENCLAW_TOKEN || '').trim() || null;

// Device identity
let deviceKeys: { publicKeyPem: string; privateKeyPem: string; deviceId: string } | null = null;
const KEYS_FILE = path.join(app.getPath('userData'), 'device_keys.json');

// Generate Ed25519 keypair and device ID
function generateNewKeys(): { publicKeyPem: string; privateKeyPem: string; deviceId: string } {
  console.log('[OpenClaw] Generating new Ed25519 keypair...');
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  
  // Device ID = SHA-256 of raw public key (32 bytes after SPKI prefix)
  const rawKey = extractRawPublicKey(publicKeyPem);
  const deviceId = crypto.createHash('sha256').update(rawKey).digest('hex');
  
  return { publicKeyPem, privateKeyPem, deviceId };
}

// Extract raw 32-byte public key from SPKI PEM
function extractRawPublicKey(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: 'spki', format: 'der' }) as Buffer;
  // Ed25519 SPKI DER: 12 bytes prefix + 32 bytes raw key
  // Prefix: 30 2a 30 05 06 03 2b 65 70 03 21 00
  return spki.subarray(-32);
}

// Base64URL encode
function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// Save session state to file
function saveSessionState(state: { messages?: any[]; sessionKey?: string }) {
  try {
    lastSessionState = state;
    fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    console.log('[Session] State saved to:', SESSION_STATE_FILE);
  } catch (e) {
    console.warn('[Session] Failed to save state:', e);
  }
}

// Load session state from file
function loadSessionState(): { messages?: any[]; sessionKey?: string } | null {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf-8'));
      console.log('[Session] State loaded from:', SESSION_STATE_FILE);
      return data;
    }
  } catch (e) {
    console.warn('[Session] Failed to load state:', e);
  }
  return null;
}

// Load or generate device keys
function loadOrGenerateKeys(): { publicKeyPem: string; privateKeyPem: string; deviceId: string } {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
      
      // Validate keys
      if (data.publicKeyPem && data.privateKeyPem && data.publicKeyPem.includes('-----BEGIN')) {
        // Verify keys are valid by trying to use them
        try {
          crypto.createPublicKey(data.publicKeyPem);
          crypto.createPrivateKey(data.privateKeyPem);
          
          const rawKey = extractRawPublicKey(data.publicKeyPem);
          const deviceId = crypto.createHash('sha256').update(rawKey).digest('hex');
          
          console.log('[OpenClaw] Loaded existing keys, deviceId:', deviceId);
          return { publicKeyPem: data.publicKeyPem, privateKeyPem: data.privateKeyPem, deviceId };
        } catch (e) {
          console.warn('[OpenClaw] Stored keys invalid, regenerating...');
        }
      }
    }
  } catch (e) {
    console.warn('[OpenClaw] Failed to load keys:', e);
  }
  
  // Generate new keys
  const keys = generateNewKeys();
  
  // Save to file
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
    console.log('[OpenClaw] Saved new keys to:', KEYS_FILE);
  } catch (e) {
    console.error('[OpenClaw] Failed to save keys:', e);
  }
  
  return keys;
}

// normalizeDeviceMetadataForAuth - copy from OpenClaw source
function normalizeDeviceMetadataForAuth(value?: string | null): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Lowercase ASCII only
  return trimmed.replace(/[A-Z]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 32)
  );
}

// buildDeviceAuthPayloadV3 - exact copy from OpenClaw device-auth.ts
function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce: string;
  platform?: string | null;
  deviceFamily?: string | null;
}): string {
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const platform = normalizeDeviceMetadataForAuth(params.platform);
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily);
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily
  ].join('|');
}

// Sign with Ed25519
function signPayload(payload: string, privateKeyPem: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key);
  return base64UrlEncode(sig);
}

function createWindow() {
  // Initialize device keys
  deviceKeys = loadOrGenerateKeys();
  console.log('[OpenClaw] Device ID:', deviceKeys.deviceId);
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: '#0a1a12',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    alwaysOnTop: false,
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    const devPort = parseInt(process.env.VITE_DEV_PORT || '5174');
    const devUrl = process.env.VITE_DEV_SERVER_URL || `http://localhost:${devPort}`;
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 如需调试可取消下方注释
  // if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  //   mainWindow.webContents.openDevTools({ mode: 'detach' });
  // }

  mainWindow.webContents.on('did-fail-load', (_e, errCode, errDesc) => {
    console.error('[Electron] 页面加载失败:', errCode, errDesc);
    dialog.showErrorBox('加载失败', `错误代码：${errCode}\n${errDesc}`);
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Electron] 渲染进程崩溃:', details);
    dialog.showErrorBox('渲染进程崩溃', JSON.stringify(details));
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const connected = openclawWs?.readyState === WebSocket.OPEN;
    sendStatus({ connected });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    floatWindow?.close();
    floatWindow = null;
    if (openclawWs) {
      openclawWs.close();
      openclawWs = null;
    }
    if (logWatcher) {
      logWatcher.close();
      logWatcher = null;
    }
    if (logTailProcess) {
      logTailProcess.kill();
      logTailProcess = null;
    }
    if (gatewayProcess && !gatewayProcess.killed) {
      gatewayProcess.kill();
      gatewayProcess = null;
    }
  });
}

function createFloatWindow() {
  if (floatWindow) return;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const size = 80;
  floatWindow = new BrowserWindow({
    width: size,
    height: size,
    x: sw - size - 20,
    y: sh - size - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  floatWindow.setAlwaysOnTop(true, 'floating');
  floatWindow.loadFile(path.join(__dirname, '..', 'electron', 'float.html'));
  floatWindow.on('closed', () => { floatWindow = null; });
}

ipcMain.on('float-restore', () => {
  if (floatWindow) {
    floatWindow.close();
    floatWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('enter-floating-mode', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  createFloatWindow();
  return { success: true };
});

function generateId(): string {
  return `req-${Date.now()}-${++requestId}`;
}

function connectOpenClaw() {
  if (openclawWs?.readyState === WebSocket.OPEN) return;

  openclawWs = null;
  console.log('[OpenClaw] Connecting to', OPENCLAW_WS_URL, 'retry:', reconnectRetryCount);
  console.log('[OpenClaw] Token loaded:', OPENCLAW_TOKEN ? `${OPENCLAW_TOKEN.slice(0, 8)}...` : 'NONE');
  console.log('[OpenClaw] Device ID:', deviceKeys?.deviceId || 'NOT SET');

  const ws = new WebSocket(OPENCLAW_WS_URL);
  openclawWs = ws;

  ws.on('open', () => {
    console.log('[OpenClaw] WebSocket opened, waiting for challenge...');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (e) {
      console.error('[OpenClaw] Parse error:', e);
    }
  });

  ws.on('close', () => {
    console.log('[OpenClaw] WebSocket disconnected');
    openclawWs = null;
    if (!mainWindow) return;
    reconnectRetryCount++;
    if (reconnectRetryCount <= MAX_RECONNECT_RETRIES) {
      sendStatus({ connected: false, reconnecting: true });
      setTimeout(connectOpenClaw, 5000);
    } else {
      sendStatus({ connected: false, error: '连接失败，请检查Gateway' });
    }
  });

  ws.on('error', (error) => {
    console.error('[OpenClaw] Connection error:', error);
    sendStatus({ connected: false, error: '连接失败: ' + error.message });
  });
}

function sendStatus(status: { connected: boolean; error?: string; model?: string; reconnecting?: boolean }) {
  if (status.connected) reconnectRetryCount = 0;
  console.log('[OpenClaw] Sending status to frontend:', status);
  if (mainWindow) {
    mainWindow.webContents.send('openclaw-status', status);
    console.log('[OpenClaw] Status sent successfully');
  } else {
    console.warn('[OpenClaw] mainWindow is null, cannot send status');
  }
}

function sendMessage(msg: any) {
  mainWindow?.webContents.send('openclaw-message', msg);
}

function floatFlash() {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send('float-flash');
  }
}

function extractTextFromPayload(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  const direct = payload.text ?? payload.delta;
  if (typeof direct === 'string') return direct;
  const msg = payload.message;
  if (msg?.content && Array.isArray(msg.content)) {
    return msg.content
      .filter((b: any) => b?.type === 'text' && b?.text)
      .map((b: any) => String(b.text))
      .join('');
  }
  if (direct?.text) return String(direct.text);
  const raw = payload.content ?? payload.message;
  if (typeof raw === 'string') return raw;
  if (raw?.text) return String(raw.text);
  if (raw?.content) return typeof raw.content === 'string' ? raw.content : extractTextFromPayload(raw.content);
  const blocks = payload.blocks ?? payload.parts ?? payload.chunks;
  if (Array.isArray(blocks)) {
    return blocks.map((b: any) => extractTextFromPayload(b)).filter(Boolean).join('');
  }
  if (payload.body?.text) return String(payload.body.text);
  if (payload.body?.content) return typeof payload.body.content === 'string' ? payload.body.content : '';
  return '';
}

function extractUsage(payload: any): { inputTokens?: number; outputTokens?: number; cost?: number; ctxUsed?: number; ctxMax?: number; session?: string; model?: string } | null {
  if (!payload) return null;
  const usage = payload.usage ?? payload.token_usage;
  const u = usage?.input_tokens ?? usage?.inputTokens ?? usage?.prompt_tokens;
  const o = usage?.output_tokens ?? usage?.outputTokens ?? usage?.completion_tokens;
  const cost = payload.cost ?? payload.total_cost ?? usage?.cost;
  const ctxUsed = payload.ctx_used ?? usage?.context_tokens ?? payload.context_length;
  const ctxMax = ctxUsed !== undefined
    ? (payload.ctx_max ?? payload.max_context_length ?? null)
    : null;
  const session = payload.session ?? payload.session_id ?? payload.sessionId;
  const model = payload.model ?? payload.model_name ?? usage?.model ?? usage?.model_name;
  if (u !== undefined || o !== undefined || cost !== undefined || session !== undefined || model !== undefined || ctxUsed !== undefined) {
    return { inputTokens: u, outputTokens: o, cost, ctxUsed, ctxMax, session, model };
  }
  return null;
}

function forwardChatToFrontend(payload: any, eventName?: string, isStreaming = false) {
  const text = extractTextFromPayload(payload);
  const done = payload?.done ?? (payload?.state === 'done' || payload?.state === 'complete' ? true : isStreaming ? false : true);
  const usage = extractUsage(payload);
  // 斜杠命令的系统回复：payload 直接有 text，无 message.content
  const isSystemReply = !!(payload?.text && typeof payload.text === 'string' && !payload?.message?.content);
  if (text || done !== undefined) {
    const msg: any = { type: 'chat', text: String(text || ''), done: done ?? true, event: eventName };
    if (usage) msg.usage = usage;
    if (isSystemReply) msg.isSystemReply = true;
    sendMessage(msg);
    if (text) floatFlash();
  }
}

function handleMessage(msg: any) {
  console.log('[OpenClaw] Received message:', JSON.stringify(msg).slice(0, 500));
  switch (msg.type) {
    case 'event':
      if (msg.event === 'connect.challenge') {
        const nonce = msg.payload?.nonce || '';
        console.log('[OpenClaw] Challenge received, nonce:', nonce);
        sendConnectRequest(nonce);
      } else if (msg.event === 'chat' && msg.payload) {
        const isDelta = msg.payload?.state === 'delta';
        forwardChatToFrontend(msg.payload, msg.event, isDelta);
      } else if (msg.event === 'agent' && (msg.data || msg.payload)) {
        const src = msg.data ?? msg.payload;
        const text = src?.delta ?? src?.text ?? extractTextFromPayload(src);
        const isDelta = src?.delta !== undefined;
        const usage = extractUsage(src);
        if (text || src?.done !== undefined) {
          const out: any = { type: 'chat', text: String(text || ''), done: src?.done ?? !isDelta, event: msg.event };
          if (usage) out.usage = usage;
          sendMessage(out);
          if (text) floatFlash();
        }
      } else if (msg.event !== 'connect.challenge' && msg.payload) {
        const text = extractTextFromPayload(msg.payload);
        if (text || msg.payload?.done !== undefined) {
          forwardChatToFrontend(msg.payload, msg.event, msg.payload?.state === 'delta');
        } else {
          sendMessage(msg);
        }
      } else {
        sendMessage(msg);
      }
      break;
      
    case 'res':
      console.log('[OpenClaw] Response: ok=', msg.ok, 'payload=', msg.payload ? JSON.stringify(msg.payload).slice(0, 200) : null);
      if (msg.ok && (msg.payload?.type === 'hello-ok' || msg.method === 'connect')) {
        const model = msg.payload?.model || msg.payload?.agent?.model || undefined;
        console.log('[OpenClaw] Connection successful!');
        sendStatus({ connected: true, model });
      } else if (!msg.ok) {
        console.error('[OpenClaw] Error:', JSON.stringify(msg.error, null, 2));
        sendStatus({ 
          connected: false, 
          error: msg.error?.message || JSON.stringify(msg.error) || 'Connection failed'
        });
      } else if (msg.ok && msg.payload) {
        const text = extractTextFromPayload(msg.payload);
        if (text) forwardChatToFrontend(msg.payload, 'res');
        else sendStatus({ connected: true });
      } else if (msg.ok) {
        console.log('[OpenClaw] Connection successful (no payload)!');
        sendStatus({ connected: true });
      }
      break;
      
    default:
      sendMessage(msg);
  }
}

function sendConnectRequest(nonce: string) {
  if (!deviceKeys) {
    console.error('[OpenClaw] No device keys');
    return;
  }

  console.log('[OpenClaw] Sending connect request...');
  
  const now = Date.now();
  const platform = process.platform; // win32, darwin, linux
  const deviceFamily = undefined;    // official uses undefined -> ''
  
  // Exact match to official client: gateway-client, backend
  const clientId = 'gateway-client';
  const clientMode = 'backend';
  const scopes = ['operator.read', 'operator.write'];
  
  const payload = buildDeviceAuthPayloadV3({
    deviceId: deviceKeys.deviceId,
    clientId,
    clientMode,
    role: 'operator',
    scopes,
    signedAtMs: now,
    token: OPENCLAW_TOKEN || null,
    nonce,
    platform,
    deviceFamily
  });
  
  console.log('[OpenClaw] Auth payload:', payload);
  
  const signature = signPayload(payload, deviceKeys.privateKeyPem);
  const publicKeyBase64Url = base64UrlEncode(extractRawPublicKey(deviceKeys.publicKeyPem));
  
  const connectMsg = {
    type: 'req',
    id: generateId(),
    method: 'connect',
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: clientId,
        version: '1.0.0',
        platform,
        mode: clientMode
      },
      role: 'operator',
      scopes,
      caps: [],
      commands: [],
      permissions: {},
      auth: { 
        token: OPENCLAW_TOKEN 
      },
      locale: 'zh-CN',
      userAgent: 'claw-terminal/1.0.0',
      device: {
        id: deviceKeys.deviceId,
        publicKey: publicKeyBase64Url,
        signature,
        signedAt: now,
        nonce
      }
    }
  };
  
  console.log('[OpenClaw] Sending connect (client.id=%s, client.mode=%s, platform=%s)', clientId, clientMode, platform);
  openclawWs?.send(JSON.stringify(connectMsg));
}

function sendChatMessage(content: string, imageDataUrl?: string | null): { success: boolean; error?: string } {
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'WebSocket not connected' };
  }

  const message = typeof content === 'string' ? content : String(content ?? '');
  if (!imageDataUrl && (!message || typeof message !== 'string' || message.trim() === '')) {
    console.warn('[OpenClaw] 消息为空，跳过发送');
    return { success: false, error: '消息不能为空' };
  }

  const reqId = generateId();
  const sessionKey = process.env.OPENCLAW_SESSION_KEY || 'main';
  const idempotencyKey = crypto.randomUUID();

  // OpenClaw chat.send: message 必须是字符串，图片放入 attachments
  const finalMessage = message.trim() || '[图片]';
  const params: { sessionKey: string; idempotencyKey: string; message: string; attachments?: any[] } = {
    sessionKey,
    idempotencyKey,
    message: finalMessage,
  };

  // OpenClaw chat.send attachments: Gateway normalizeRpcAttachmentsToChatAttachments 期望 { type, mimeType, content }
  const attachments: Array<{ type: string; mimeType: string; fileName?: string; content: string }> = [];
  if (imageDataUrl) {
    const matches = imageDataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp|bmp));base64,(.+)$/);
    if (matches) {
      const [, mimeType, base64Data] = matches;
      attachments.push({ type: 'image', mimeType: mimeType!, content: base64Data });
    }
  }
  if (attachments.length > 0) params.attachments = attachments;
  const chatMsg = {
    type: 'req',
    id: reqId,
    method: 'chat.send',
    params
  };

  const payloadStr = JSON.stringify(chatMsg);
  openclawWs.send(payloadStr);
  return { success: true };
}

// IPC handlers
ipcMain.handle('set-always-on-top', (_, value: boolean) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value);
    return true;
  }
  return false;
});

ipcMain.handle('get-always-on-top', () => {
  return mainWindow ? mainWindow.isAlwaysOnTop() : false;
});

ipcMain.handle('minimize-window', () => mainWindow?.minimize());

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => mainWindow?.close());

ipcMain.handle('open-image-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return { success: false };
  try {
    const buf = fs.readFileSync(result.filePaths[0]);
    const ext = path.extname(result.filePaths[0]).toLowerCase();
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' }[ext] || 'image/png';
    return { success: true, base64: buf.toString('base64'), mime };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
});

// 通用文件上传对话框
ipcMain.handle('open-file-dialog', async (_, options?: { allowMultiple?: boolean; filters?: { name: string; extensions: string[] }[] }) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
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
    const files = await Promise.all(result.filePaths.map(async (filePath) => {
      const stats = fs.statSync(filePath);
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);

      // 检测 MIME 类型
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

      // 判断是否为文本文件（可直接读取内容）
      const textExts = ['.txt', '.md', '.json', '.csv', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.html', '.css', '.sql', '.xml', '.yaml', '.yml'];
      const isText = textExts.includes(ext);

      return {
        path: filePath,
        name: fileName,
        size: stats.size,
        ext: ext.slice(1),
        mimeType,
        isText,
        content: isText ? buf.toString('utf-8') : null,
        base64: buf.toString('base64'),
      };
    }));

    return { success: true, files };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('minimize-for-capture', () => {
  if (mainWindow) {
    mainWindow.setOpacity(0);
    mainWindow.setIgnoreMouseEvents(true);
    mainWindow.hide();
  }
  return { success: true };
});

ipcMain.handle('restore-after-capture', () => {
  if (mainWindow) {
    mainWindow.setOpacity(1);
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.show();
    mainWindow.focus();
  }
  return { success: true };
});

let pendingCodeWindowData: { language: string; code: string } | null = null;

ipcMain.handle('open-code-window', (_, payload: { language?: string; code?: string }) => {
  const language = payload?.language || 'text';
  const code = typeof payload?.code === 'string' ? payload.code : '';

  if (codeWindow) {
    codeWindow.close();
    codeWindow = null;
  }

  pendingCodeWindowData = { language, code };
  codeWindow = new BrowserWindow({
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

  const codeWinPath = path.join(__dirname, '..', 'electron', 'code-window.html');
  codeWindow.loadFile(codeWinPath);

  codeWindow.on('closed', () => {
    codeWindow = null;
    pendingCodeWindowData = null;
  });

  return { success: true };
});

ipcMain.on('code-window-ready', (e) => {
  if (pendingCodeWindowData && e.sender) {
    e.sender.send('code-window-data', pendingCodeWindowData);
    pendingCodeWindowData = null;
  }
});

ipcMain.on('code-window-close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.close();
});

// 系统终端窗口 (node-pty + xterm)
function createTerminalWindow() {
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    terminalWindow.focus();
    return;
  }
  if (terminalPty) {
    try { terminalPty.kill(); } catch (_) {}
    terminalPty = null;
  }

  // 定位到主窗口右侧，避免遮挡聊天区域
  const termW = 700;
  const termH = 400;
  let termX: number | undefined;
  let termY: number | undefined;

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  if (mainWindow && !mainWindow.isDestroyed()) {
    const [mx, my] = mainWindow.getPosition();
    const [mw, mh] = mainWindow.getSize();
    // 主窗口右侧有足够空间则放右侧，否则放左侧
    if (mx + mw + termW + 10 <= sw) {
      termX = mx + mw + 10;
    } else if (mx - termW - 10 >= 0) {
      termX = mx - termW - 10;
    } else {
      termX = Math.max(0, sw - termW - 20);
    }
    // 垂直与主窗口顶部对齐，超出屏幕则靠底
    termY = Math.min(my, sh - termH - 10);
    termY = Math.max(0, termY);
  } else {
    // 没有主窗口时放右下角
    termX = sw - termW - 20;
    termY = sh - termH - 20;
  }

  terminalWindow = new BrowserWindow({
    width: termW,
    height: termH,
    x: termX,
    y: termY,
    minWidth: 400,
    minHeight: 200,
    frame: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const termPath = path.join(__dirname, '..', 'electron', 'terminal-window.html');
  terminalWindow.loadFile(termPath);

  terminalWindow.on('closed', () => {
    if (terminalPty) {
      try { terminalPty.kill(); } catch (_) {}
      terminalPty = null;
    }
    terminalWindow = null;
  });
}

ipcMain.handle('open-terminal-window', () => {
  createTerminalWindow();
  return { success: true };
});

ipcMain.on('terminal-ready', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win !== terminalWindow) return;

  const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
  const cwd = process.env.HOME || process.env.USERPROFILE || process.cwd();
  terminalPty = pty.spawn(shell, [], {
    cwd,
    env: process.env as Record<string, string>,
    cols: 80,
    rows: 24,
  });

  terminalPty.onData((data) => {
    if (terminalWindow && !terminalWindow.isDestroyed()) {
      terminalWindow.webContents.send('terminal-data', data);
    }
  });

  terminalPty.onExit(() => {
    terminalPty = null;
  });
});

ipcMain.on('terminal-input', (e, data: string) => {
  if (terminalPty) {
    terminalPty.write(data);
  }
});

ipcMain.on('terminal-close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.close();
});

ipcMain.on('terminal-set-pin', (e, pinned: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setAlwaysOnTop(pinned);
});

ipcMain.on('terminal-resize', (e, cols: number, rows: number) => {
  if (terminalPty) {
    terminalPty.resize(cols, rows);
  }
});

function getClawConfigPath() {
  return path.join(app.getPath('userData'), 'claw-config.json');
}

function loadClawConfig(): { screenshotShortcut: string } {
  try {
    const p = getClawConfigPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return { screenshotShortcut: data?.screenshotShortcut || 'Alt+A' };
    }
  } catch {}
  return { screenshotShortcut: 'Alt+A' };
}

function saveClawConfig(config: { screenshotShortcut: string }) {
  try {
    fs.writeFileSync(getClawConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Config] Save failed:', e);
  }
}

function registerScreenshotShortcut(shortcut: string) {
  globalShortcut.unregisterAll();
  if (shortcut && shortcut.trim()) {
    try {
      const ok = globalShortcut.register(shortcut.trim(), () => {
        mainWindow?.webContents.send('screenshot-trigger');
      });
      if (!ok) console.warn('[Config] Failed to register shortcut:', shortcut);
    } catch (e) {
      console.warn('[Config] Register shortcut error:', e);
    }
  }
}

const DEFAULT_LOG_PATH = path.join(os.homedir(), '.openclaw', 'logs', 'gateway.log');

let logTailProcess: ReturnType<typeof spawn> | null = null;
let logWatcher: fs.FSWatcher | null = null;

// 日志噪音过滤
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

// 解析 gateway.log 的 JSONL 行，格式化为 [HH:MM:SS] [LEVEL] 消息
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

function readLogTail(filePath: string): { success: boolean; content?: string; lines?: string[]; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    return { success: true, content, lines };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

ipcMain.handle('read-log-file', async (_, logPath: string) => {
  const pathToUse = logPath || process.env.OPENCLAW_LOG_PATH || DEFAULT_LOG_PATH;
  return readLogTail(pathToUse);
});

ipcMain.handle('start-log-watch', async (_, logPath: string) => {
  const pathToUse = logPath || process.env.OPENCLAW_LOG_PATH || DEFAULT_LOG_PATH;
  console.log('[LOG] Starting log watch for:', pathToUse);

  // 停止旧的监听
  if (logTailProcess) {
    logTailProcess.kill();
    logTailProcess = null;
  }
  if (logWatcher) {
    logWatcher.close();
    logWatcher = null;
  }

  if (!fs.existsSync(pathToUse)) {
    console.log('[LOG] File does not exist:', pathToUse);
    mainWindow?.webContents.send('openclaw-log-lines', [
      '[LOG] 日志文件不存在，且 Gateway 不是由 CLAW TERMINAL 启动。',
      '[LOG] 请点击 [▶ 启动] 以获取实时日志。',
    ]);
    return { success: false, error: 'Log file not found' };
  }

  try {
    const seenRaw = new Set<string>();
    // 先读取最新20行，用原始行去重，避免 tail 输出时重复
    const content = fs.readFileSync(pathToUse, 'utf-8');
    const allLines = content.split('\n').filter((l) => l.trim());
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
      mainWindow?.webContents.send('openclaw-log-lines', formatted);
    } else {
      mainWindow?.webContents.send('openclaw-log-lines', ['[LOG] 等待Gateway日志...']);
    }
    // 用 PowerShell 轮询 tail 日志
    const psPath = pathToUse.replace(/'/g, "''");
    const psCmd = `$p='${psPath}'; while($true){if(Test-Path -LiteralPath $p){Get-Content -LiteralPath $p -Tail 10 -Encoding UTF8}; Start-Sleep -Milliseconds 500}`;
    logTailProcess = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let buf = '';
    logTailProcess.stdout?.on('data', (chunk: Buffer) => {
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
        mainWindow?.webContents.send('openclaw-log-lines', [out]);
      }
    });

    logTailProcess.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf8').trim();
      if (msg) mainWindow?.webContents.send('openclaw-log-lines', [`[ERR] ${msg}`]);
    });

    logTailProcess.on('exit', (code) => {
      logTailProcess = null;
      if (code !== 0 && code !== null) {
        mainWindow?.webContents.send('openclaw-log-lines', [`[LOG] tail 进程退出: ${code}`]);
      }
    });

    mainWindow?.webContents.send('openclaw-log-lines', ['[LOG] 正在监听日志...']);
    return { success: true };
  } catch (e) {
    console.log('[LOG] Exception:', e);
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('stop-log-watch', () => {
  if (logTailProcess) {
    logTailProcess.kill();
    logTailProcess = null;
  }
  if (logWatcher) {
    logWatcher.close();
    logWatcher = null;
  }
  return { success: true };
});

// ===== Gateway 进程管理 =====

function sendGatewayLogLine(line: string) {
  if (!line.trim() || isNoisyLogLine(line)) return;
  mainWindow?.webContents.send('openclaw-log-lines', [line.trim()]);
}

async function startGatewayProcess(): Promise<{ success: boolean; error?: string; alreadyRunning?: boolean; portInUse?: boolean }> {
  if (gatewayProcess && !gatewayProcess.killed) {
    return { success: true, alreadyRunning: true };
  }
  const inUse = await isPortInUse(GATEWAY_PORT);
  if (inUse) {
    return { success: false, portInUse: true, error: 'Gateway 已在运行，端口 18789 已被占用' };
  }
  if (!fs.existsSync(GATEWAY_CMD)) {
    return { success: false, error: `Gateway 未找到: ${GATEWAY_CMD}` };
  }
  try {
    gatewayProcess = spawn('cmd', ['/c', GATEWAY_CMD], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });
    gatewayManagedByUs = true;
    console.log('[Gateway] Started PID:', gatewayProcess.pid);
    mainWindow?.webContents.send('gateway-status', { running: true, managed: true, pid: gatewayProcess.pid });

    let stdoutBuf = '';
    gatewayProcess.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? '';
      lines.forEach(sendGatewayLogLine);
    });

    gatewayProcess.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const lines = text.split(/\r?\n/);
      lines.forEach((l) => {
        if (l.trim()) sendGatewayLogLine(`[ERR] ${l.trim()}`);
      });
    });

    gatewayProcess.on('error', (err) => {
      console.error('[Gateway] Process error:', err);
      mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway ERROR] ${err.message}`]);
    });

    gatewayProcess.on('exit', (code, signal) => {
      console.log('[Gateway] Exited, code:', code, 'signal:', signal);
      gatewayProcess = null;
      gatewayManagedByUs = false;
      mainWindow?.webContents.send('gateway-status', { running: false, managed: false });
      mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway] 进程已退出 (code: ${code ?? signal})`]);
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

ipcMain.handle('start-gateway', async () => {
  const result = await startGatewayProcess();
  if (result.alreadyRunning) {
    mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 进程已在运行（由本程序管理）']);
  } else if (result.portInUse) {
    mainWindow?.webContents.send('openclaw-log-lines', ['[LOG] 检测到外部 Gateway，已连接']);
    return { success: true, portInUse: true };
  } else if (!result.success) {
    mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway] 启动失败: ${result.error}`]);
  } else {
    mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 正在启动...']);
  }
  return result;
});

ipcMain.handle('stop-gateway', () => {
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill();
    gatewayProcess = null;
    gatewayManagedByUs = false;
    mainWindow?.webContents.send('gateway-status', { running: false, managed: false });
    mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 已停止']);
    return { success: true };
  }
  return { success: false, error: 'Gateway 未在运行' };
});

ipcMain.handle('gateway-restart', async () => {
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill();
    gatewayProcess = null;
    gatewayManagedByUs = false;
  }
  mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 正在重启...']);
  const result = await startGatewayProcess();
  if (result.success || result.portInUse) {
    mainWindow?.webContents.send('openclaw-log-lines', [result.portInUse ? '[Gateway] 外部进程已占用端口，已连接' : '[Gateway] 已启动']);
    return { success: true };
  }
  mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway] 重启失败: ${result.error}`]);
  return { success: false, error: result.error };
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
          mainWindow?.webContents.send('openclaw-log-lines', [`[System] 已终止 PID ${pid} (端口 ${port})`]);
          return { success: true };
        }
      }
    }
    mainWindow?.webContents.send('openclaw-log-lines', [`[System] 端口 ${port} 无占用进程`]);
    return { success: true };
  } catch (e: any) {
    mainWindow?.webContents.send('openclaw-log-lines', [`[System] 清理失败: ${e?.message || String(e)}`]);
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('gateway-status', async () => {
  const portInUse = await isPortInUse(GATEWAY_PORT);
  return {
    running: !!gatewayProcess && !gatewayProcess.killed,
    managed: gatewayManagedByUs,
    pid: gatewayProcess?.pid,
    portInUse,
  };
});

ipcMain.handle('get-env', (_, key: string) => process.env[key] || '');

ipcMain.handle('test-log-write', () => {
  const testPath = path.join(os.homedir(), '.openclaw', 'logs', 'commands.log');
  const dir = path.dirname(testPath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const testLine = `{"timestamp":"${new Date().toISOString()}","level":"INFO","message":"Test log entry from CLAW Terminal","source":"test"}\n`;
    fs.appendFileSync(testPath, testLine, 'utf8');
    console.log('[LOG] Test line written to:', testPath);
    return { success: true };
  } catch (e: any) {
    console.log('[LOG] Failed to write test line:', e.message);
    return { success: false, error: e.message };
  }
});

const CHAT_HISTORY_PATH = path.join(os.homedir(), '.openclaw', 'claw-terminal-history.json');
const MAX_HISTORY = 100;

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

ipcMain.handle('chat-history-save', async (_: any, items: Array<{ role: string; content: string; timestamp: string; isSystemReply?: boolean }>) => {
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
  connectOpenClaw();
  return { success: true };
});

ipcMain.handle('openclaw-send', (_, payload: string | { content: string; imageDataUrl?: string | null }) => {
  let content: string;
  let imageDataUrl: string | null | undefined;
  
  if (typeof payload === 'string') {
    content = payload;
    imageDataUrl = null;
  } else if (payload && typeof payload === 'object') {
    const c = payload.content;
    content = typeof c === 'string' ? c : (c ? String(c) : '');
    imageDataUrl = payload.imageDataUrl;
  } else {
    content = '';
    imageDataUrl = null;
  }
  
  return sendChatMessage(content, imageDataUrl);
});

ipcMain.handle('openclaw-status', () => {
  const sessionKey = process.env.OPENCLAW_SESSION_KEY || 'main';
  return { connected: openclawWs?.readyState === WebSocket.OPEN, sessionKey };
});

ipcMain.handle('show-notification', (_, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

ipcMain.handle('tts-speak', async (_, { text }: { text: string }) => {
  const apiKey = (process.env.DASHSCOPE_API_KEY || '').trim();
  if (!apiKey) {
    return { success: false, error: 'DASHSCOPE_API_KEY not configured' };
  }
  try {
    const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'cosyvoice-v1',
        voice: 'longxiaochun',
        input: text,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `TTS API error ${res.status}: ${errText}` };
    }
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    return { success: true, audioBase64: base64 };
  } catch (e: any) {
    return { success: false, error: e?.message || 'TTS request failed' };
  }
});

app.whenReady().then(async () => {
  createWindow();

  // 先尝试启动 Gateway（如果端口未被占用）
  const inUse = await isPortInUse(GATEWAY_PORT);
  if (!inUse) {
    console.log('[Gateway] Port not in use, starting Gateway...');
    const result = await startGatewayProcess();
    if (result.success) {
      // 等待 Gateway 启动完成，轮询端口
      let ready = false;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isPortInUse(GATEWAY_PORT)) {
          ready = true;
          break;
        }
      }
      if (ready) {
        console.log('[Gateway] Ready on port', GATEWAY_PORT);
        mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 已启动']);
      } else {
        console.warn('[Gateway] Failed to start, port not responding');
        mainWindow?.webContents.send('openclaw-log-lines', ['[ERR] Gateway 启动超时']);
      }
    } else {
      mainWindow?.webContents.send('openclaw-log-lines', [`[ERR] Gateway 启动失败: ${result.error}`]);
    }
  } else {
    console.log('[Gateway] Port already in use, external Gateway detected');
    mainWindow?.webContents.send('openclaw-log-lines', ['[LOG] 检测到外部 Gateway，尝试连接...']);
  }

  connectOpenClaw();

  const config = loadClawConfig();
  registerScreenshotShortcut(config.screenshotShortcut);
});

ipcMain.handle('get-screenshot-shortcut', () => {
  return loadClawConfig().screenshotShortcut;
});

ipcMain.handle('set-screenshot-shortcut', (_, shortcut: string) => {
  const s = typeof shortcut === 'string' ? shortcut.trim() : 'Alt+A';
  saveClawConfig({ screenshotShortcut: s });
  registerScreenshotShortcut(s);
  return { success: true };
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
