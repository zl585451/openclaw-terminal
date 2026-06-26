// Load .env file
import * as dotenv from 'dotenv';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mammoth = require('mammoth');
import * as path from 'path';
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { app, BrowserWindow, ipcMain, Notification, dialog, screen, globalShortcut, shell } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as net from 'net';
import { spawn, spawnSync } from 'child_process';
import * as pty from 'node-pty';
import * as crypto from 'crypto';
import WebSocket from 'ws';
import { registerAllIpcHandlers, type IpcDeps } from './ipc';

if (!app) {
  const nextEnv = { ...process.env };
  delete nextEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: 'ignore',
    env: nextEnv,
  });
  child.unref();
  process.exit(0);
}
import {
  ApiKeyPayload,
  applyApiKeyUpdates,
  buildApiKeysData,
  didApiConfigChange,
  didConnectionConfigChange,
  parseEnvContent,
  parseBooleanConfigValue,
} from './config/apiKeys';
import {
  loadProviderList,
  resolveAiConnectionSettings,
} from './config/providers';
import {
  applyMemoryVectorRecallConfig,
  buildMemoryVectorRecallConfigData,
  MemoryVectorRecallPayload,
} from './config/vectorRecall';
import {
  applyMemorySummarizerConfig,
  buildMemorySummarizerConfigData,
  MemorySummarizerPayload,
} from './config/memorySummarizer';

let mainWindow: BrowserWindow | null = null;
let floatWindow: BrowserWindow | null = null;
let codeWindow: BrowserWindow | null = null;
let terminalWindow: BrowserWindow | null = null;
let terminalPty: pty.IPty | null = null;
let openclawWs: WebSocket | null = null;
let requestId = 0;
const SCRIPT_ADAPTER_REQUEST_TIMEOUT_MS = 10000;
const scriptAdapterPendingRequests = new Map<string, {
  resolve: (value: any) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();
const MAX_RECONNECT_RETRIES = 999; // 增加重连次数上限
(globalThis as any).reconnectRetryCount = 0;
/** 应用/主窗口正在关闭，避免 WebSocket 断开回调里向已销毁的窗口 send 导致报错 */
let appQuitting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
/* 以下变量通过 globalThis 与 IPC 模块共享 */
(globalThis as any).suppressAutoReconnect = false;
(globalThis as any).expectOctGatewayProcessExit = false;
let lastSessionState: { messages?: any[]; sessionKey?: string } | null = null;
let currentSessionKey: string = 'main';
let currentThinkMode: string = ''; // 思考强度（off/low/medium/high）；空=不带参数，沿用网关默认
let currentGatewayModel: string | undefined;
let currentGatewayCapabilities: {
  model?: string;
  toolsSupport?: 'supported' | 'unknown' | 'unsupported';
  capabilitySource?: string;
  supportsTools?: boolean;
  supportsStreamOptions?: boolean;
  mcpReady?: boolean;
  mcpServers?: number;
  mcpConnectedServers?: number;
} | undefined;
const SESSION_STATE_FILE = path.join(app.getPath('userData'), 'session-state.json');
const CONFIG_FILE = path.join(os.homedir(), '.openclaw', 'config.json');

const DEFAULT_CONFIG = {
  OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
  OPENCLAW_TOKEN: '',
  OCT_AI_NAME: 'OpenClaw',
  OCT_USER_NAME: '用户',
  OCT_PERSONA_STYLE: 'warm',
  TTS_MINIMAX_VOICE_ID: 'male-qn-qingse',
  /** 随 OCT 启动内置项目书库服务（默认端口 8001） */
  OCT_AI_LIBRARY_AUTO_START: true,
  OCT_AI_LIBRARY_PATH: '',
  OCT_AI_LIBRARY_PORT: 8001,
};

function guessImageExtension(url: string): string {
  const cleanUrl = String(url || '').split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.png')) return 'png';
  if (cleanUrl.endsWith('.webp')) return 'webp';
  if (cleanUrl.endsWith('.gif')) return 'gif';
  if (cleanUrl.endsWith('.bmp')) return 'bmp';
  return 'jpg';
}

function buildOctChildEnv(extraEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  // oct-gateway 在 index.js 内对 HTTPS_PROXY 使用 undici ProxyAgent。
  // 若再启用 NODE_USE_ENV_PROXY，部分 Node 版本会对 Google 等请求叠加环境代理鉴权，
  // 与 Bearer / API Key 并存时触发 generativelanguage 400「Multiple authentication credentials」。
  delete env.NODE_USE_ENV_PROXY;
  const noProxyValue = [env.NO_PROXY, env.no_proxy, 'localhost', '127.0.0.1', '::1']
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  const mergedNoProxy = Array.from(new Set(noProxyValue)).join(',');
  if (mergedNoProxy) {
    env.NO_PROXY = mergedNoProxy;
    env.no_proxy = mergedNoProxy;
  }
  return env;
}

// （已移除授权码机制，公开发布版无需激活）

// Gateway 进程管理
const GATEWAY_PORT = 18789;
/** AI.library 插件默认 HTTP 端口 */
const AI_LIBRARY_DEFAULT_PORT = 8001;

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

async function killPortProcess(port: number): Promise<void> {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    if (process.platform === 'win32') {
      exec(
        `for /f "tokens=5" %%a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %%a`,
        { windowsHide: true },
        () => resolve()
      );
    } else {
      exec(`lsof -ti :${port} | xargs kill -9`, () => resolve());
    }
  });
}

/** Windows：启动前强制清理端口上残留进程（同步杀进程 + 短等待） */
async function forceKillPort(port: number): Promise<void> {
  if (process.platform !== 'win32') return;
  try {
    const { execSync } = require('child_process');
    const result = execSync(
      `netstat -ano | findstr :${port}`,
      { encoding: 'utf8', windowsHide: true }
    );
    const lines = result.split('\n').filter((l: string) => l.includes('LISTENING'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') {
        try {
          execSync(`taskkill /PID ${pid} /F`, { windowsHide: true });
          console.log(`[Gateway] 清理旧进程 PID ${pid}`);
        } catch {}
      }
    }
    await new Promise(r => setTimeout(r, 500));
  } catch {}
}

let gatewayProcess: ReturnType<typeof spawn> | null = null;

// OpenClaw WebSocket config：优先从 userData/config.json 读取，打包后 .env 不存在时使用
let OPENCLAW_WS_URL = 'ws://127.0.0.1:18789';
let OPENCLAW_TOKEN = '';

function isUsableGatewayToken(token: string): boolean {
  const t = String(token || '').trim();
  return t.length >= 16;
}

function generateGatewayToken(): string {
  // 32 hex chars + compact uuid,足够随机且便于日志排查（不输出明文）
  const hex = crypto.randomBytes(16).toString('hex');
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `${hex}${uuid}`;
}

function ensureGatewayTokenPersisted(existingConfig?: Record<string, any>): string {
  ensureConfigFile();
  let cfg: Record<string, any> = existingConfig && typeof existingConfig === 'object'
    ? { ...existingConfig }
    : {};

  if (!existingConfig) {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch {}
  }

  const current = String(cfg.OPENCLAW_TOKEN || '').trim();
  if (isUsableGatewayToken(current)) return current;

  const nextToken = generateGatewayToken();
  cfg.OPENCLAW_TOKEN = nextToken;
  if (!cfg.OPENCLAW_WS_URL || !String(cfg.OPENCLAW_WS_URL).trim()) {
    cfg.OPENCLAW_WS_URL = DEFAULT_CONFIG.OPENCLAW_WS_URL;
  }

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    console.log('[Security] Auto-generated gateway token and saved to config.json');
  } catch (e) {
    console.warn('[Security] Failed to persist auto-generated gateway token:', e);
  }

  return nextToken;
}

function ensureConfigFile(): void {
  if (fs.existsSync(CONFIG_FILE)) return;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    console.log('[Config] Created default config.json at', CONFIG_FILE);
  } catch (e) {
    console.warn('[Config] Failed to create config.json:', e);
  }
}

function loadOpenClawConfig(): void {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      OPENCLAW_WS_URL = (data.OPENCLAW_WS_URL || '').trim() || DEFAULT_CONFIG.OPENCLAW_WS_URL;
      OPENCLAW_TOKEN = ensureGatewayTokenPersisted(data);
    } catch (e) {
      console.warn('[Config] Failed to load config.json:', e);
      OPENCLAW_TOKEN = ensureGatewayTokenPersisted();
    }
  } else if (fs.existsSync(envPath)) {
    OPENCLAW_WS_URL = (process.env.OPENCLAW_WS_URL || '').trim() || DEFAULT_CONFIG.OPENCLAW_WS_URL;
    const envToken = (process.env.OPENCLAW_TOKEN || process.env.OCT_GATEWAY_TOKEN || '').trim();
    OPENCLAW_TOKEN = isUsableGatewayToken(envToken) ? envToken : ensureGatewayTokenPersisted();
  } else {
    ensureConfigFile();
    OPENCLAW_WS_URL = DEFAULT_CONFIG.OPENCLAW_WS_URL;
    OPENCLAW_TOKEN = ensureGatewayTokenPersisted();
  }
  // 统一主进程与 Gateway 子进程使用同一 token，避免“配置有 token 但连接未携带”
  process.env.OPENCLAW_TOKEN = OPENCLAW_TOKEN;
  process.env.OCT_GATEWAY_TOKEN = OPENCLAW_TOKEN;
  syncAiLibraryPluginConfigFromDisk();
}

function readAppConfig(): Record<string, any> {
  ensureConfigFile();
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function getGatewayDirForHelpers(): string {
  const octEntry = getOctGatewayEntry() || path.join(__dirname, '..', 'oct-gateway', 'index.js');
  return path.dirname(octEntry);
}

type GoogleBaseUrlHelperModule = {
  sanitizeGoogleOpenAiBaseUrl: (url: string) => string;
};

let _googleBaseUrlHelper: GoogleBaseUrlHelperModule | undefined;
function getGoogleBaseUrlHelper(): GoogleBaseUrlHelperModule {
  if (!_googleBaseUrlHelper) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _googleBaseUrlHelper = require(path.join(
      getGatewayDirForHelpers(),
      'shared',
      'googleBaseUrl.js',
    )) as GoogleBaseUrlHelperModule;
  }
  return _googleBaseUrlHelper;
}

function getMiniMaxEndpoints(config: Record<string, any>) {
  const configuredBase = String(config.MINIMAX_BASE_URL || process.env.MINIMAX_BASE_URL || '').trim();
  const httpBase = configuredBase || 'https://api.minimaxi.com/v1';
  const normalized = httpBase.replace(/\/$/, '');
  let wsBase = '';
  try {
    const url = new URL(normalized);
    wsBase = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/ws/v1/t2a_v2`;
  } catch {
    wsBase = 'wss://api.minimaxi.com/ws/v1/t2a_v2';
  }
  return { httpBase: normalized, wsBase };
}

function getPromptsDir(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'prompts'),
    path.join(__dirname, '..', 'docs', '01_system_prompts'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '..', 'docs', '01_system_prompts');
}

function pushUiLog(line: string) {
  try {
    mainWindow?.webContents.send('openclaw-log-lines', [line]);
  } catch {}
}

function synthesizeMiniMaxViaWebSocket({
  wsUrl,
  apiKey,
  text,
  voiceId = 'male-qn-qingse',
}: {
  wsUrl: string;
  apiKey: string;
  text: string;
  voiceId?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const traceId = crypto.randomUUID();
    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const audioChunks: Buffer[] = [];
    let started = false;
    let finished = false;
    let finishSent = false;
    let settleCalled = false;

    const settle = (fn: () => void) => {
      if (settleCalled) return;
      settleCalled = true;
      try { ws.close(); } catch {}
      clearTimeout(timeout);
      fn();
    };

    const timeout = setTimeout(() => {
      settle(() => reject(new Error('MiniMax WebSocket TTS timed out')));
    }, 45000);

    ws.on('open', () => {
      // 等 connected_success 后再 task_start
    });

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(String(raw));
        const type = data?.event || data?.type || '';
        const logPayload = JSON.stringify({
          type,
          status_code: data?.status_code || data?.base_resp?.status_code,
          status_msg: data?.status_msg || data?.base_resp?.status_msg,
          hasAudio: Boolean(data?.data?.audio || data?.payload?.audio || data?.audio),
          isFinal: data?.is_final ?? data?.payload?.is_final ?? null,
          extraKeys: Object.keys(data || {}),
        });
        console.log('[MiniMax TTS][WS]', logPayload);

        if (type === 'task_failed' || type === 'error') {
          const message =
            data?.base_resp?.status_msg ||
            data?.message ||
            data?.error ||
            'MiniMax WebSocket TTS error';
          pushUiLog(`[MiniMax TTS][WS][FAIL] code=${data?.base_resp?.status_code ?? data?.status_code ?? 'unknown'} msg=${String(message)}`);
          settle(() => reject(new Error(String(message))));
          return;
        }

        if (type === 'connected_success') {
          ws.send(JSON.stringify({
            event: 'task_start',
            model: 'speech-2.8-hd',
            voice_setting: {
              voice_id: voiceId,
              speed: 1,
              vol: 1,
              pitch: 0,
              english_normalization: false,
            },
            audio_setting: {
              sample_rate: 32000,
              bitrate: 128000,
              format: 'mp3',
              channel: 1,
            },
          }));
          return;
        }

        if (type === 'task_started') {
          started = true;
          ws.send(JSON.stringify({
            event: 'task_continue',
            text,
          }));
          return;
        }

        if (type === 'task_continued' || type === 'audio') {
          const hex = data?.data?.audio || data?.payload?.audio || data?.audio || '';
          if (typeof hex === 'string' && hex) {
            audioChunks.push(Buffer.from(hex, 'hex'));
          }
          const isFinal = data?.is_final === true || data?.payload?.is_final === true;
          if (isFinal) {
            if (!finishSent) {
              finishSent = true;
              ws.send(JSON.stringify({ event: 'task_finish' }));
            }
            finished = true;
          }
          return;
        }

        if (type === 'task_finished') {
          settle(() => {
            const merged = Buffer.concat(audioChunks);
            if (merged.length === 0) {
              reject(new Error('MiniMax WebSocket TTS returned no audio payload'));
            } else {
              resolve(merged);
            }
          });
        }
      } catch (err: any) {
        settle(() => reject(new Error(err?.message || 'MiniMax WebSocket TTS parse failed')));
      }
    });

    ws.on('error', (err) => {
      pushUiLog(`[MiniMax TTS][WS][ERR] ${err?.message || String(err)}`);
      settle(() => reject(err));
    });

    ws.on('close', () => {
      if (settleCalled) return;
      settle(() => {
        const merged = Buffer.concat(audioChunks);
        if (started && merged.length > 0) {
          resolve(merged);
        } else {
          reject(new Error('MiniMax WebSocket TTS connection closed before audio was returned'));
        }
      });
    });
  });
}

// ── 内置项目书库（默认 :8001）────────────────
let aiLibraryHttpServer: http.Server | null = null;
let octAiLibraryAutoStart = true;
let octAiLibraryPath = '';
let octAiLibraryPort = AI_LIBRARY_DEFAULT_PORT;
/** 注入子进程 Gateway 的 AI_LIBRARY_URL；空则让 oct-gateway 用自身默认 */
let resolvedAiLibraryUrlForGateway = '';

type NativeLibraryBook = {
  id: string;
  title: string;
  author: string | null;
  source_type: string;
  source_format: string;
  source_path: string;
  total_chars: number;
  chapter_count: number;
  uploaded_at: string;
  metadata: Record<string, unknown>;
};

type NativeLibraryChapter = {
  id: string;
  book_id: string;
  chapter_index: number;
  title: string | null;
  start_char: number;
  end_char: number;
  char_count: number;
  preview: string;
};

type NativeLibraryIndex = {
  version: 1;
  books: NativeLibraryBook[];
  chapters: NativeLibraryChapter[];
};

function getNativeLibraryRoot(): string {
  return path.join(app.getPath('userData'), 'ai_library_data', 'library');
}

function getNativeLibrarySourcesRoot(): string {
  return path.join(getNativeLibraryRoot(), 'sources');
}

function getNativeLibraryIndexPath(): string {
  return path.join(getNativeLibraryRoot(), 'library.json');
}

function ensureNativeLibraryDirs(): void {
  fs.mkdirSync(getNativeLibrarySourcesRoot(), { recursive: true });
}

function readNativeLibraryIndex(): NativeLibraryIndex {
  ensureNativeLibraryDirs();
  const indexPath = getNativeLibraryIndexPath();
  if (!fs.existsSync(indexPath)) {
    return { version: 1, books: [], chapters: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    return {
      version: 1,
      books: Array.isArray(parsed.books) ? parsed.books : [],
      chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
    };
  } catch {
    return { version: 1, books: [], chapters: [] };
  }
}

function writeNativeLibraryIndex(index: NativeLibraryIndex): void {
  ensureNativeLibraryDirs();
  fs.writeFileSync(getNativeLibraryIndexPath(), JSON.stringify(index, null, 2), 'utf-8');
}

function decodeLibraryText(buffer: Buffer): string {
  const utf8 = buffer.toString('utf-8').replace(/^\ufeff/, '');
  const replacementCount = (utf8.match(/\ufffd/g) || []).length;
  if (replacementCount === 0) return utf8;
  try {
    const decoder = new TextDecoder('gb18030');
    const decoded = decoder.decode(buffer).replace(/^\ufeff/, '');
    const decodedReplacementCount = (decoded.match(/\ufffd/g) || []).length;
    return decodedReplacementCount < replacementCount ? decoded : utf8;
  } catch {
    return utf8;
  }
}

function normalizeChapterTitle(title: string): string {
  let normalized = String(title || '').trim();
  const patterns = [/^(第[一二三四五六七八九十百千零\d]+[章回])/, /^(Chapter\s+\d+)\b/i];
  for (const pattern of patterns) {
    while (true) {
      const match = normalized.match(pattern);
      if (!match) break;
      const prefix = match[1];
      const rest = normalized.slice(prefix.length).trimStart();
      if (!rest.startsWith(prefix)) break;
      normalized = `${prefix} ${rest.slice(prefix.length).trimStart()}`.trim();
    }
  }
  return normalized;
}

function bodyTextWithoutTitle(content: string): string {
  const lines = content.replace(/^\ufeff/, '').split(/\r?\n/);
  if (lines.length === 0) return '';
  return lines.slice(1).join('\n').trimStart();
}

function bodySignalChars(content: string): number {
  const body = bodyTextWithoutTitle(content);
  const compact = body.trim();
  if (!compact || /^[\s\-_=~*#·.。…—]+$/.test(compact)) return 0;
  return (body.match(/[\u4e00-\u9fffA-Za-z0-9]/g) || []).length;
}

function splitNativeLibraryChapters(text: string, bookId: string): NativeLibraryChapter[] {
  const cleanText = String(text || '').replace(/^\ufeff/, '');
  if (!cleanText) return [];
  const patterns = [
    /(?:^|\n)\s*(第[一二三四五六七八九十百千零\d]+[章回][^\n]*)/g,
    /(?:^|\n)\s*(Chapter\s+\d+[^\n]*)/gi,
    /(?:^|\n)\s*(#{1,3}\s+[^\n]+)/g,
  ];
  let matches: Array<{ start: number; title: string }> = [];
  for (const pattern of patterns) {
    matches = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cleanText)) !== null) {
      const title = normalizeChapterTitle(match[1] || '');
      const start = match.index + match[0].lastIndexOf(match[1] || '');
      matches.push({ start, title });
    }
    if (matches.length > 0) break;
  }
  matches.sort((a, b) => a.start - b.start);
  const deduped = matches.filter((entry, index) => index === 0 || entry.start !== matches[index - 1].start);

  if (deduped.length === 0) {
    return [{
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      book_id: bookId,
      chapter_index: 0,
      title: '全文',
      start_char: 0,
      end_char: cleanText.length,
      char_count: cleanText.length,
      preview: cleanText.slice(0, 200),
    }];
  }

  const candidates = deduped.map((entry, index) => {
    const end = index + 1 < deduped.length ? deduped[index + 1].start : cleanText.length;
    const content = cleanText.slice(entry.start, end);
    return { ...entry, end, content, bodySignal: bodySignalChars(content) };
  });
  let startIndex = 0;
  for (let i = 0; i < Math.min(candidates.length, 24); i += 1) {
    if (candidates[i].bodySignal >= 80) {
      startIndex = i;
      break;
    }
  }
  const filtered = candidates.slice(startIndex).filter((candidate) => candidate.bodySignal > 0);
  const finalCandidates = filtered.length > 0 ? filtered : [{
    start: 0,
    end: cleanText.length,
    title: '全文',
    content: cleanText,
    bodySignal: cleanText.length,
  }];
  return finalCandidates.map((candidate, index) => ({
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    book_id: bookId,
    chapter_index: index,
    title: candidate.title,
    start_char: candidate.start,
    end_char: candidate.end,
    char_count: candidate.content.length,
    preview: candidate.content.slice(0, 200),
  }));
}

function listNativeLibraryBooks(limit = 50, offset = 0): NativeLibraryBook[] {
  const index = readNativeLibraryIndex();
  return [...index.books]
    .sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)))
    .slice(offset, offset + limit);
}

function getNativeLibraryBook(bookId: string): NativeLibraryBook | null {
  const index = readNativeLibraryIndex();
  return index.books.find((book) => book.id === bookId) || null;
}

function listNativeLibraryChapters(bookId: string): NativeLibraryChapter[] {
  const index = readNativeLibraryIndex();
  return index.chapters
    .filter((chapter) => chapter.book_id === bookId)
    .sort((a, b) => a.chapter_index - b.chapter_index);
}

function getNativeLibraryChapterText(bookId: string, chapterIndex: number): { chapter: NativeLibraryChapter; text: string } | null {
  const book = getNativeLibraryBook(bookId);
  if (!book) return null;
  const chapter = listNativeLibraryChapters(bookId).find((item) => item.chapter_index === chapterIndex);
  if (!chapter) return null;
  const sourcePath = path.join(getNativeLibraryRoot(), book.source_path);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file missing: ${book.source_path}`);
  }
  const text = decodeLibraryText(fs.readFileSync(sourcePath));
  return {
    chapter,
    text: text.slice(chapter.start_char, chapter.end_char),
  };
}

async function uploadNativeLibraryBook(params: { filePath: string; title: string; author?: string }): Promise<{
  book_id: string;
  chapter_count: number;
  total_chars: number;
}> {
  const filePath = String(params.filePath || '').trim();
  const title = String(params.title || '').trim();
  const author = String(params.author || '').trim();
  if (!filePath) throw new Error('filePath required');
  if (!title) throw new Error('title required');
  const ext = path.extname(filePath).toLowerCase();
  if (!['.txt', '.md'].includes(ext)) {
    throw new Error('暂不支持该格式，请使用 .txt 或 .md 文件');
  }
  const buffer = await fs.promises.readFile(filePath);
  const text = decodeLibraryText(buffer);
  const bookId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const suffix = ext.slice(1);
  const sourceRel = path.join('sources', `${bookId}.${suffix}`).replace(/\\/g, '/');
  const sourceAbs = path.join(getNativeLibraryRoot(), sourceRel);
  ensureNativeLibraryDirs();
  await fs.promises.writeFile(sourceAbs, text, 'utf-8');
  const chapters = splitNativeLibraryChapters(text, bookId);
  const book: NativeLibraryBook = {
    id: bookId,
    title,
    author: author || null,
    source_type: 'novel',
    source_format: suffix,
    source_path: sourceRel,
    total_chars: text.length,
    chapter_count: chapters.length,
    uploaded_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    metadata: {},
  };
  const index = readNativeLibraryIndex();
  index.books = [book, ...index.books.filter((item) => item.id !== bookId)];
  index.chapters = [...index.chapters.filter((item) => item.book_id !== bookId), ...chapters];
  writeNativeLibraryIndex(index);
  return {
    book_id: bookId,
    chapter_count: chapters.length,
    total_chars: text.length,
  };
}

function deleteNativeLibraryBook(bookId: string): boolean {
  const index = readNativeLibraryIndex();
  const book = index.books.find((item) => item.id === bookId);
  if (!book) return false;
  index.books = index.books.filter((item) => item.id !== bookId);
  index.chapters = index.chapters.filter((item) => item.book_id !== bookId);
  writeNativeLibraryIndex(index);
  const sourcePath = path.join(getNativeLibraryRoot(), book.source_path);
  if (fs.existsSync(sourcePath)) {
    try {
      fs.unlinkSync(sourcePath);
    } catch {
      /* ignore orphan source cleanup failures */
    }
  }
  return true;
}

function sendNativeLibraryJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  });
  res.end(body);
}

function startNativeLibraryHttpServer(): Promise<boolean> {
  if (aiLibraryHttpServer?.listening) return Promise.resolve(true);
  ensureNativeLibraryDirs();
  aiLibraryHttpServer = http.createServer((req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        sendNativeLibraryJson(res, 200, { success: true });
        return;
      }
      const parsed = new URL(req.url || '/', `http://127.0.0.1:${octAiLibraryPort}`);
      const pathname = decodeURIComponent(parsed.pathname);
      if (req.method === 'GET' && pathname === '/health') {
        sendNativeLibraryJson(res, 200, {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: 'native-library-core-1',
          knowledge_base_ready: false,
          library_ready: true,
        });
        return;
      }
      if (req.method === 'GET' && pathname === '/api/library/list') {
        const limit = Math.max(1, Number(parsed.searchParams.get('limit') || 50));
        const offset = Math.max(0, Number(parsed.searchParams.get('offset') || 0));
        const books = listNativeLibraryBooks(limit, offset);
        sendNativeLibraryJson(res, 200, { success: true, books, total: books.length });
        return;
      }
      const chapterMatch = pathname.match(/^\/api\/library\/([^/]+)\/chapter\/(\d+)$/);
      if (req.method === 'GET' && chapterMatch) {
        const data = getNativeLibraryChapterText(chapterMatch[1], Number(chapterMatch[2]));
        if (!data) {
          sendNativeLibraryJson(res, 404, { success: false, detail: 'Chapter not found' });
          return;
        }
        sendNativeLibraryJson(res, 200, { success: true, book_id: chapterMatch[1], ...data });
        return;
      }
      const chaptersMatch = pathname.match(/^\/api\/library\/([^/]+)\/chapters$/);
      if (req.method === 'GET' && chaptersMatch) {
        const book = getNativeLibraryBook(chaptersMatch[1]);
        if (!book) {
          sendNativeLibraryJson(res, 404, { success: false, detail: 'Book not found' });
          return;
        }
        sendNativeLibraryJson(res, 200, {
          success: true,
          book_id: chaptersMatch[1],
          chapters: listNativeLibraryChapters(chaptersMatch[1]),
        });
        return;
      }
      const bookMatch = pathname.match(/^\/api\/library\/([^/]+)$/);
      if (bookMatch && req.method === 'GET') {
        const book = getNativeLibraryBook(bookMatch[1]);
        if (!book) {
          sendNativeLibraryJson(res, 404, { success: false, detail: 'Book not found' });
          return;
        }
        sendNativeLibraryJson(res, 200, { success: true, book });
        return;
      }
      if (bookMatch && req.method === 'DELETE') {
        const deleted = deleteNativeLibraryBook(bookMatch[1]);
        sendNativeLibraryJson(res, deleted ? 200 : 404, deleted
          ? { success: true, deleted: bookMatch[1] }
          : { success: false, detail: 'Book not found' });
        return;
      }
      if (req.method === 'POST' && pathname === '/api/search') {
        sendNativeLibraryJson(res, 501, {
          results: [],
          error: 'knowledge_search_disabled',
          message: 'Native Project Library only provides /api/library/* in this build.',
        });
        return;
      }
      sendNativeLibraryJson(res, 404, { success: false, detail: 'Not Found' });
    } catch (error: any) {
      sendNativeLibraryJson(res, 500, { success: false, detail: error?.message || String(error) });
    }
  });
  return new Promise((resolve) => {
    aiLibraryHttpServer?.once('error', (error: any) => {
      console.warn('[AI.library] Native library HTTP failed:', error?.message || String(error));
      aiLibraryHttpServer = null;
      resolve(false);
    });
    aiLibraryHttpServer?.listen(octAiLibraryPort, '127.0.0.1', () => {
      console.log(`[AI.library] Native project library ready http://127.0.0.1:${octAiLibraryPort}`);
      resolve(true);
    });
  });
}

function syncAiLibraryPluginConfigFromDisk(): void {
  octAiLibraryAutoStart = true;
  octAiLibraryPath = '';
  octAiLibraryPort = AI_LIBRARY_DEFAULT_PORT;

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (typeof data.OCT_AI_LIBRARY_AUTO_START === 'boolean') {
        octAiLibraryAutoStart = data.OCT_AI_LIBRARY_AUTO_START;
      }
      if (typeof data.OCT_AI_LIBRARY_PATH === 'string') octAiLibraryPath = data.OCT_AI_LIBRARY_PATH.trim();
      if (typeof data.OCT_AI_LIBRARY_PORT === 'number' && data.OCT_AI_LIBRARY_PORT > 0) {
        octAiLibraryPort = data.OCT_AI_LIBRARY_PORT;
      }
    } catch {
      /* ignore */
    }
  }

  const envAuto = (process.env.OCT_AI_LIBRARY_AUTO_START || '').trim().toLowerCase();
  if (envAuto === '1' || envAuto === 'true' || envAuto === 'yes') octAiLibraryAutoStart = true;
  if (envAuto === '0' || envAuto === 'false' || envAuto === 'no') octAiLibraryAutoStart = false;
  const envPath = (process.env.OCT_AI_LIBRARY_PATH || '').trim();
  if (envPath) octAiLibraryPath = envPath;
  const envPort = parseInt(process.env.OCT_AI_LIBRARY_PORT || '', 10);
  if (!Number.isNaN(envPort) && envPort > 0) octAiLibraryPort = envPort;

  const explicitUrl = (process.env.AI_LIBRARY_URL || '').trim();
  if (explicitUrl) {
    resolvedAiLibraryUrlForGateway = explicitUrl;
  } else if (octAiLibraryAutoStart) {
    resolvedAiLibraryUrlForGateway = `http://127.0.0.1:${octAiLibraryPort}`;
  } else {
    resolvedAiLibraryUrlForGateway = '';
  }
}

/** OCT 托管启动 AI.library；端口已占用时视为已运行 */
async function startAiLibraryBackend(): Promise<boolean> {
  syncAiLibraryPluginConfigFromDisk();
  if (!octAiLibraryAutoStart) {
    return false;
  }

  if (aiLibraryHttpServer?.listening) return true;

  if (await isPortInUse(octAiLibraryPort)) {
    console.log('[AI.library] 端口', octAiLibraryPort, '已占用，跳过启动（可能已在运行）');
    mainWindow?.webContents.send('openclaw-log-lines', [`[AI.library] 端口 ${octAiLibraryPort} 已在使用，跳过启动`]);
    return true;
  }

  const ok = await startNativeLibraryHttpServer();
  if (ok) {
    mainWindow?.webContents.send('openclaw-log-lines', [
      `[AI.library] 内置项目书库已启动 ✅ http://127.0.0.1:${octAiLibraryPort}`,
    ]);
    return true;
  }
  mainWindow?.webContents.send('openclaw-log-lines', ['[AI.library] 内置项目书库启动失败，对话仍可继续']);
  return false;
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: '#0a1a12',
    show: false, // 先隐藏，等页面加载完成后再显示
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    alwaysOnTop: false,
  });

  const revealMainWindow = (reason: string) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return;
    mainWindow.show();
    console.log('[Electron] Window shown:', reason);
  };

  // ready-to-show can be skipped when the renderer fails before first paint.
  mainWindow.once('ready-to-show', () => revealMainWindow('ready-to-show'));
  const revealFallbackTimer = setTimeout(() => revealMainWindow('fallback-timeout'), 2000);

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    const devPort = parseInt(process.env.VITE_DEV_PORT || '5176');
    const devUrl = process.env.VITE_DEV_SERVER_URL || `http://localhost:${devPort}`;
    console.log('[Electron] Loading dev URL:', devUrl);
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 如需调试可取消下方注释
  // if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  //   mainWindow.webContents.openDevTools({ mode: 'detach' });
  // }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    const currentUrl = mainWindow?.webContents.getURL() ?? '';
    if (url !== currentUrl && !url.startsWith('http://localhost')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_e, errCode, errDesc) => {
    clearTimeout(revealFallbackTimer);
    revealMainWindow('did-fail-load');
    console.error('[Electron] 页面加载失败:', errCode, errDesc);
    dialog.showErrorBox('加载失败', `错误代码：${errCode}\n${errDesc}`);
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    clearTimeout(revealFallbackTimer);
    revealMainWindow('render-process-gone');
    console.error('[Electron] 渲染进程崩溃:', details);
    dialog.showErrorBox('渲染进程崩溃', JSON.stringify(details));
  });

  mainWindow.webContents.on('did-finish-load', () => {
    clearTimeout(revealFallbackTimer);
    revealMainWindow('did-finish-load');
    const connected = openclawWs?.readyState === WebSocket.OPEN;
    sendStatus({ connected });
  });

  mainWindow.on('closed', async () => {
    appQuitting = true;
    if (openclawWs) {
      openclawWs.close();
      openclawWs = null;
    }
    if ((globalThis as any).logWatcher) {
      try { (globalThis as any).logWatcher.close(); } catch {}
      (globalThis as any).logWatcher = null;
    }
    if ((globalThis as any).logTailProcess) {
      try { (globalThis as any).logTailProcess.kill(); } catch {}
      (globalThis as any).logTailProcess = null;
    }
    if ((globalThis as any).gatewayProcess && !(globalThis as any).gatewayProcess.killed) {
      (globalThis as any).gatewayProcess.kill();
      (globalThis as any).gatewayProcess = null;
    }
    if ((globalThis as any).octGatewayProcess && !(globalThis as any).octGatewayProcess.killed) {
      (globalThis as any).expectOctGatewayProcessExit = true;
      try { (globalThis as any).octGatewayProcess.kill(); } catch {}
      (globalThis as any).octGatewayProcess = null;
      await new Promise(r => setTimeout(r, 500));
    }
    mainWindow = null;
    floatWindow?.close();
    floatWindow = null;
  });
}

function createFloatWindow() {
  if (floatWindow) return;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const width = 220;
  const height = 250;
  floatWindow = new BrowserWindow({
    width,
    height,
    x: sw - width - 24,
    y: sh - height - 24,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  (globalThis as any).floatWindow = floatWindow;
  floatWindow.setAlwaysOnTop(true, 'floating');
  floatWindow.loadFile(path.join(__dirname, '..', 'electron', 'float.html'));
  floatWindow.on('closed', () => {
    floatWindow = null;
    (globalThis as any).floatWindow = null;
  });
}



function generateId(): string {
  return `req-${Date.now()}-${++requestId}`;
}

/** 将连接/系统信息写入 Gateway 日志区，便于排查错误 */
function sendConnLog(line: string) {
  if (!line.trim() || appQuitting) return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('openclaw-log-lines', [`[连接] ${line.trim()}`]);
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(delay: number) {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectOpenClaw();
  }, delay);
}

function connectOpenClaw() {
  clearReconnectTimer();
  if (openclawWs?.readyState === WebSocket.OPEN || openclawWs?.readyState === WebSocket.CONNECTING) return;

  openclawWs = null;
  (globalThis as any).openclawWs = null;
  console.log('[OCT] Connecting to', OPENCLAW_WS_URL, 'retry:', (globalThis as any).reconnectRetryCount);
  sendConnLog(`正在连接 ${OPENCLAW_WS_URL} (重试 #${(globalThis as any).reconnectRetryCount})`);
  sendConnLog(`Token: ${(process.env.OCT_GATEWAY_TOKEN || OPENCLAW_TOKEN || '').trim() ? '已设置' : '未设置'}`);

  const ws = new WebSocket(OPENCLAW_WS_URL);
  openclawWs = ws;
  (globalThis as any).openclawWs = ws;

  let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  let pongTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const clearHeartbeat = () => {
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }
    if (pongTimeoutId) {
      clearTimeout(pongTimeoutId);
      pongTimeoutId = null;
    }
  };

  ws.on('open', () => {
    console.log('[OCT] WebSocket opened, waiting for challenge...');
    sendConnLog('WebSocket 已连接，等待 Gateway 下发 challenge...');
    heartbeatIntervalId = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (pongTimeoutId) {
        clearTimeout(pongTimeoutId);
        pongTimeoutId = null;
      }
      ws.ping();
      pongTimeoutId = setTimeout(() => {
        pongTimeoutId = null;
        ws.terminate();
      }, 20000);  // 从 10s 延长至 20s，给重型渲染留出余量
    }, 30000);
  });

  ws.on('pong', () => {
    if (pongTimeoutId) {
      clearTimeout(pongTimeoutId);
      pongTimeoutId = null;
    }
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (e) {
      console.error('[OCT] Parse error:', e);
      sendConnLog(`消息解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
  });

  let closeHandled = false;
  const scheduleReconnectForSocket = () => {
    if (closeHandled || appQuitting) return;
    closeHandled = true;
    clearHeartbeat();
    openclawWs = null;
    (globalThis as any).openclawWs = null;
    if ((globalThis as any).suppressAutoReconnect) {
      sendConnLog('当前为主动重连流程，跳过自动退避重连');
      return;
    }
    if (!mainWindow) return;
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    (globalThis as any).reconnectRetryCount++;
    if ((globalThis as any).reconnectRetryCount <= MAX_RECONNECT_RETRIES) {
      const delay = Math.min(5000 * Math.pow(2, (globalThis as any).reconnectRetryCount - 1), 60000);
      sendStatus({ connected: false, reconnecting: true });
      sendConnLog(`${delay / 1000} 秒后重连`);
      scheduleReconnect(delay);
    } else {
      sendStatus({ connected: false, error: '连接失败，请检查Gateway' });
      sendConnLog('已停止自动重连，请检查 Gateway 是否启动或点击「重启」');
    }
  };

  ws.on('close', (code: number, reason: Buffer) => {
    clearHeartbeat();
    const reasonStr = (reason?.length ? reason.toString('utf8') : '') || '(无)';
    console.log('[OCT] WebSocket disconnected', code, reasonStr);
    sendConnLog(`WebSocket 已断开 code=${code} reason=${reasonStr}，${(globalThis as any).reconnectRetryCount <= MAX_RECONNECT_RETRIES ? '将按退避延迟重连' : '已达重试上限'}`);
    scheduleReconnectForSocket();
  });

  ws.on('error', (error) => {
    clearHeartbeat();
    console.error('[OCT] Connection error:', error);
    const msg = error.message || String(error);
    sendConnLog(`连接错误: ${msg}，将按退避延迟重连`);
    if (msg.includes('ECONNRESET')) {
      sendConnLog('提示: 若持续出现 ECONNRESET，可能是 18789 被其他程序占用，请点「停止」再「启动」或「重启」确保仅运行 OCT Gateway');
    }
    sendStatus({ connected: false, reconnecting: true, error: '连接失败: ' + msg });
    scheduleReconnectForSocket();
  });
}

async function waitForPortRelease(port: number, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const inUse = await isPortInUse(port);
    if (!inUse) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function sendStatus(status: {
  connected: boolean;
  error?: string;
  model?: string;
  reconnecting?: boolean;
  capabilities?: {
    model?: string;
    toolsSupport?: 'supported' | 'unknown' | 'unsupported';
    capabilitySource?: string;
    supportsTools?: boolean;
    supportsStreamOptions?: boolean;
    mcpReady?: boolean;
    mcpServers?: number;
    mcpConnectedServers?: number;
  };
}) {
  if (appQuitting) return;
  if (status.connected) (globalThis as any).reconnectRetryCount = 0;
  if (status.model) currentGatewayModel = status.model;
  if (status.capabilities) currentGatewayCapabilities = status.capabilities;
  console.log('[OCT] Sending status to frontend:', status);
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('openclaw-status', status);
    console.log('[OCT] Status sent successfully');
  } else {
    console.warn('[OCT] mainWindow not available, skip send status');
  }
}

function sendMessage(msg: any) {
  if (appQuitting || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('openclaw-message', msg);
}

function sendImageResult(payload: any) {
  if (appQuitting || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('image-result', payload);
}

function sendScriptAdapterEvent(payload: any) {
  if (appQuitting || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('script-adapter-event', payload);
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
    const parts: string[] = [];
    for (const b of msg.content) {
      if (!b) continue;
      if (typeof b === 'string') { parts.push(b); continue; }
      const t = (b.type || '').toString().toLowerCase();
      // 常见文本块：text / output_text；部分实现可能没有 type 但有 text/content 字段
      const rawText =
        (typeof b.text === 'string' ? b.text : '') ||
        (typeof b.content === 'string' ? b.content : '') ||
        (typeof b.value === 'string' ? b.value : '') ||
        (typeof b.text?.value === 'string' ? b.text.value : '') ||
        (typeof b.text?.text === 'string' ? b.text.text : '');
      if (!rawText) continue;
      if (!t || t === 'text' || t === 'output_text' || t === 'output-text') {
        parts.push(String(rawText));
      }
    }
    return parts.join('');
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

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'qwen3.5-plus': 131072,
  'qwen3-max': 131072,
  'qwen3-max-2026-01-23': 131072,
  'qwen-plus': 131072,
  'qwen-max': 131072,
  'qwen-turbo': 1000000,
  'qwen3-coder-next': 262144,
  'qwen3-coder-plus': 262144,
  'kimi-k2.6': 262144,
  'kimi-k2.5': 262144,
  'MiniMax-M2.5': 1048576,
  'MiniMax-M2.7': 1000000,
  'MiniMax-M2.7-highspeed': 1000000,
  'MiniMax-M2.5-standalone': 1000000,
  'MiniMax-M2.5-highspeed': 1000000,
  'MiniMax-M2.1': 1000000,
  'MiniMax-M2.1-highspeed': 1000000,
  'MiniMax-M2': 1000000,
  'glm-5': 131072,
  'glm-4.7': 131072,
  'deepseek-v3': 65536,
  'deepseek-r1': 65536,
  'deepseek-v4-flash': 128000,
  'deepseek-v4-pro': 128000,
  'deepseek-chat': 65536,
  'deepseek-reasoner': 65536,
};

function inferContextWindow(model: any): number | null {
  const modelId = String(model || '').trim();
  if (!modelId) return null;
  if (MODEL_CONTEXT_WINDOWS[modelId] != null) return MODEL_CONTEXT_WINDOWS[modelId];
  const exactKey = Object.keys(MODEL_CONTEXT_WINDOWS).find((key) => modelId.startsWith(key));
  return exactKey ? MODEL_CONTEXT_WINDOWS[exactKey] : null;
}

function extractUsage(payload: any): { inputTokens?: number; outputTokens?: number; cost?: number; ctxUsed?: number; ctxMax?: number; session?: string; model?: string } | null {
  if (!payload) return null;
  const usage = payload.usage ?? payload.token_usage ?? payload.metrics ?? payload.metadata?.usage ?? null;
  const model =
    payload.model
    ?? payload.model_name
    ?? payload.responseModel
    ?? payload.response_model
    ?? usage?.model
    ?? usage?.model_name
    ?? usage?.response_model;
  const u =
    usage?.input_tokens
    ?? usage?.inputTokens
    ?? usage?.prompt_tokens
    ?? usage?.promptTokens
    ?? usage?.prefill_tokens
    ?? usage?.prompt_token_count;
  const o =
    usage?.output_tokens
    ?? usage?.outputTokens
    ?? usage?.completion_tokens
    ?? usage?.completionTokens
    ?? usage?.generated_tokens
    ?? usage?.completion_token_count
    ?? usage?.candidates_token_count;
  const total =
    usage?.total_tokens
    ?? usage?.totalTokens
    ?? usage?.token_count
    ?? payload.total_tokens;
  const cost = payload.cost ?? payload.total_cost ?? usage?.cost ?? usage?.total_cost;
  const ctxUsedRaw =
    payload.ctx_used
    ?? usage?.context_tokens
    ?? usage?.contextTokens
    ?? payload.context_length
    ?? usage?.context_length
    ?? usage?.current_context_tokens
    ?? usage?.input_tokens
    ?? usage?.inputTokens
    ?? usage?.prompt_tokens
    ?? usage?.promptTokens
    ?? total;
  const ctxUsed = ctxUsedRaw != null ? Number(ctxUsedRaw) : undefined;
  const inferredCtxMax = inferContextWindow(model);
  const ctxMaxRaw =
    payload.ctx_max
    ?? payload.max_context_length
    ?? usage?.max_context_length
    ?? usage?.maxContextLength
    ?? usage?.context_window
    ?? usage?.contextWindow
    ?? payload.context_window
    ?? inferredCtxMax;
  const ctxMax = ctxMaxRaw != null ? Number(ctxMaxRaw) : null;
  const session = payload.session ?? payload.session_id ?? payload.sessionId;
  if (u !== undefined || o !== undefined || cost !== undefined || session !== undefined || model !== undefined || ctxUsed !== undefined) {
    return {
      inputTokens: u != null ? Number(u) : undefined,
      outputTokens: o != null ? Number(o) : undefined,
      cost,
      ctxUsed,
      ctxMax: ctxMax ?? undefined,
      session,
      model,
    };
  }
  return null;
}

function forwardChatToFrontend(payload: any, eventName?: string, isStreaming = false) {
  const text = extractTextFromPayload(payload);
  const done = payload?.done ?? (payload?.state === 'done' || payload?.state === 'complete' ? true : isStreaming ? false : true);
  const usage = extractUsage(payload);
  if (usage?.session) {
    currentSessionKey = usage.session;
    saveSessionState({ ...(lastSessionState || {}), sessionKey: usage.session });
  }
  // 只信任 Gateway 显式传来的 system 标记，避免把普通 AI 文本误判进系统气泡。
  const isSystemReply = payload?.isSystemReply === true || payload?.type === 'system';
  
  // DEBUG: 当提取文本为空时，打印 payload 摘要帮助定位“正文丢失”
  try {
    const isEmptyText = !text || String(text).trim().length === 0;
    const maybeDone = done === true || payload?.state === 'done';
    if (isEmptyText && maybeDone) {
      console.warn('[ChatForward] empty text extracted. payload keys=', Object.keys(payload || {}));
      console.warn('[ChatForward] empty text extracted. payload snippet=', JSON.stringify(payload).slice(0, 800));
    }
  } catch {}

  if (text || done !== undefined) {
    const msg: any = { 
      type: 'event',
      event: 'chat',
      payload: {
        delta: payload?.delta ?? text,
        text: String(text || ''),
        state: payload?.state ?? (done ? 'done' : 'delta'),
        done: done ?? true,
      },
    };
    if (usage) msg.payload.usage = usage;
    if (isSystemReply) msg.payload.isSystemReply = true;
    if (payload?.turnId) msg.payload.turnId = String(payload.turnId);
    sendMessage(msg);
    if (text) floatFlash();
  }
}

function handleMessage(msg: any) {
  switch (msg.type) {
    case 'event':
      if (msg.event === 'connect.challenge') {
        sendOctConnectRequest();
      } else if (msg.event === 'script-adapter') {
        sendScriptAdapterEvent(msg.payload || {});
      } else if (msg.event === 'tool' || msg.event === 'agent-phase') {
        // 工具调用事件和 agent 阶段事件：直接透传，不经过 forwardChatToFrontend（避免 state:'done' 被误判为 chat done）
        sendMessage(msg);
      } else if (msg.event === 'chat' && msg.payload && (msg.payload.seg !== undefined || msg.payload.reset === true)) {
        // 段协议(seg)/续轮重置(reset)事件：原样透传。
        // 这些事件没有 state:'delta'/done 字段，若走 forwardChatToFrontend 会被默认判成空 done，
        // 导致每个段事件触发一次 finalize → 流式气泡碎片化；reset 字段也会被剥离。
        sendMessage(msg);
      } else if (msg.event === 'chat' && msg.payload) {
        const isDelta = msg.payload?.state === 'delta';
        forwardChatToFrontend(msg.payload, msg.event, isDelta);
      } else if (msg.event === 'agent' && (msg.data || msg.payload)) {
        const src = msg.data ?? msg.payload;
        const text = src?.delta ?? src?.text ?? extractTextFromPayload(src);
        const isDelta = src?.delta !== undefined;
        const usage = extractUsage(src);
        if (usage?.session) {
          currentSessionKey = usage.session;
          saveSessionState({ ...(lastSessionState || {}), sessionKey: usage.session });
        }
        if (text || src?.done !== undefined) {
          const out: any = { type: 'chat', text: String(text || ''), done: src?.done ?? !isDelta, event: msg.event };
          if (usage) out.usage = usage;
          if (src?.turnId) out.turnId = String(src.turnId);
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
      console.log('[OCT] Response: ok=', msg.ok, 'payload=', msg.payload ? JSON.stringify(msg.payload).slice(0, 200) : null);
      if (
        typeof msg.method === 'string'
        && (
          msg.method.startsWith('scriptAdapter.run.')
          || msg.method.startsWith('scriptAdapter.batch.')
          || msg.method.startsWith('scriptAdapter.intake.')
          || msg.method.startsWith('scriptAdapter.analysis.')
          || msg.method.startsWith('scriptAdapter.production.')
        )
      ) {
        const pending = scriptAdapterPendingRequests.get(String(msg.id || ''));
        if (pending) {
          clearTimeout(pending.timeout);
          scriptAdapterPendingRequests.delete(String(msg.id || ''));
          pending.resolve({
            success: Boolean(msg.ok),
            ...(msg.payload || {}),
            error: msg.ok ? undefined : (msg.error?.message || msg.payload?.error || 'Gateway 请求失败'),
          });
        }
      } else if (msg.method === 'image.generate') {
        sendImageResult(msg.payload || {});
      } else if (msg.ok && (msg.payload?.type === 'hello-ok' || msg.method === 'connect')) {
        const model = msg.payload?.model || msg.payload?.agent?.model || undefined;
        const capabilities = msg.payload?.capabilities || undefined;
        console.log('[OCT] Connection successful!');
        sendConnLog(`认证成功，已连接 (model: ${model || '—'})`);
        sendStatus({ connected: true, model, capabilities });
      } else if (!msg.ok) {
        const errMsg = msg.error?.message || JSON.stringify(msg.error) || 'Connection failed';
        console.error('[OCT] Error:', JSON.stringify(msg.error, null, 2));
        sendConnLog(`认证失败: ${errMsg}`);
        sendStatus({ 
          connected: false, 
          error: errMsg
        });
      } else if (msg.ok && msg.payload) {
        const text = extractTextFromPayload(msg.payload);
        if (text) forwardChatToFrontend(msg.payload, 'res');
        else sendStatus({ connected: true });
      } else if (msg.ok) {
        console.log('[OCT] Connection successful (no payload)!');
        sendConnLog('认证成功，已连接');
        sendStatus({ connected: true });
      }
      break;
      
    default:
      sendMessage(msg);
  }
}

function sendOctConnectRequest() {
  const token = (process.env.OCT_GATEWAY_TOKEN || OPENCLAW_TOKEN || '').trim();
  const connectMsg = {
    type: 'req',
    id: generateId(),
    method: 'connect',
    params: {
      auth: { token },
      client: { id: 'oct-terminal', version: '1.0.0', mode: 'frontend' }
    }
  };
  try {
    openclawWs?.send(JSON.stringify(connectMsg));
    console.log('[OCT] 已发送 connect 请求');
  } catch (err: any) {
    if (err?.code === 'EPIPE' || String(err?.message).includes('broken pipe')) {
      openclawWs = null;
      (globalThis as any).openclawWs = null;
      sendStatus({ connected: false, reconnecting: true });
      setTimeout(connectOpenClaw, 1500);
    } else {
      throw err;
    }
  }
}

interface UploadedFile {
  path?: string;
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  isText?: boolean;
  content?: string | null;
  base64?: string;
}

function sendChatMessage(
  content: string,
  imageDataUrl?: string | null,
  files?: UploadedFile[],
  pacingMs?: number,
  workbenchContext?: any,
  requestId?: string,
  projectContext?: any,
): { success: boolean; error?: string } {
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'WebSocket not connected' };
  }

  const message = typeof content === 'string' ? content : String(content ?? '');
  if (!imageDataUrl && (!files || files.length === 0) && (!message || typeof message !== 'string' || message.trim() === '')) {
    console.warn('[OCT] 消息为空，跳过发送');
    return { success: false, error: '消息不能为空' };
  }

  const normalizedRequestId = typeof requestId === 'string' ? requestId.trim() : '';
  const reqId = normalizedRequestId || generateId();
  const idempotencyKey = crypto.randomUUID();

  // OpenClaw chat.send: message 必须是字符串，图片放入 attachments；sessionKey 一致则 Gateway 在同一会话内回复
  const finalMessage = message.trim() || (imageDataUrl || (files && files.length > 0) ? '[文件/图片]' : '');
  const params: {
    sessionKey: string;
    idempotencyKey: string;
    message: string;
    attachments?: any[];
    pacingMs?: number;
    workbenchContext?: any;
    canvasContext?: any;
    projectContext?: any;
    thinkMode?: string;
  } = {
    sessionKey: currentSessionKey,
    idempotencyKey,
    message: finalMessage,
    pacingMs,
  };
  if (workbenchContext) {
    params.workbenchContext = workbenchContext;
    params.canvasContext = workbenchContext;
  }
  if (projectContext) {
    params.projectContext = projectContext;
  }
  // 思考强度作为请求参数随消息携带（静默生效，不走斜杠命令）
  if (currentThinkMode) {
    params.thinkMode = currentThinkMode;
  }

  // OpenClaw chat.send attachments: Gateway 期望 { type, mimeType, content }
  // 目前支持：image（图片）、audio（音频）
  const attachments: Array<{ type: 'image' | 'audio'; mimeType: string; fileName?: string; content: string }> = [];

  // 1. 粘贴/截图图片 (imageDataUrl)
  if (imageDataUrl) {
    const matches = imageDataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp|bmp));base64,(.+)$/);
    if (matches) {
      const [, mimeType, base64Data] = matches;
      attachments.push({ type: 'image', mimeType: mimeType!, content: base64Data });
    }
  }

  // 2. 附件中的图片/音频转为 base64 后加入（音频用于 Gemini input_audio 多模态）
  if (files && files.length > 0) {
    for (const f of files) {
      const mimeType = f.mimeType || 'application/octet-stream';
      const isImage = mimeType.startsWith('image/');
      const isAudio = mimeType.startsWith('audio/');
      if (!isImage && !isAudio) continue;

      let base64Data = f.base64;
      if (!base64Data && f.path) {
        try {
          base64Data = fs.readFileSync(f.path).toString('base64');
        } catch (e) {
          console.warn('[OCT] 读取附件失败，已跳过', { name: f.name, path: f.path, error: (e as any)?.message || String(e) });
          continue;
        }
      }
      if (!base64Data) continue;
      if (isImage) {
        attachments.push({ type: 'image', mimeType, fileName: f.name, content: base64Data });
      } else if (isAudio) {
        attachments.push({ type: 'audio', mimeType, fileName: f.name, content: base64Data });
      }
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
  console.log('[OCT DEBUG] sending to gateway:', payloadStr.slice(0, 200));
  try {
    openclawWs.send(payloadStr);
    return { success: true };
  } catch (err: any) {
    const isBrokenPipe = err?.code === 'EPIPE' || (err?.message && String(err.message).includes('broken pipe'));
    if (isBrokenPipe && openclawWs) {
      sendConnLog(`发送失败: broken pipe，连接已断开，1.5s 后重连`);
      openclawWs = null;
      (globalThis as any).openclawWs = null;
      sendStatus({ connected: false, reconnecting: true });
      setTimeout(connectOpenClaw, 1500);
    } else if (err?.message) {
      sendConnLog(`发送失败: ${err.message}`);
    }
    return {
      success: false,
      error: isBrokenPipe
        ? '连接已断开（如休眠/睡眠后），正在重连，请稍后再发'
        : (err?.message || String(err)),
    };
  }
}

function cancelChatMessage(): { success: boolean; error?: string } {
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'WebSocket not connected' };
  }

  const cancelMsg = {
    type: 'req',
    id: generateId(),
    method: 'chat.cancel',
    params: {
      sessionKey: currentSessionKey,
      reason: 'user_stop',
    },
  };

  try {
    openclawWs.send(JSON.stringify(cancelMsg));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

function getOpenClawStatus() {
  return {
    connected: openclawWs?.readyState === WebSocket.OPEN,
    sessionKey: currentSessionKey,
    model: currentGatewayModel,
    capabilities: currentGatewayCapabilities,
  };
}

// IPC handlers




// 通用文件上传对话框

// 剧本文件解析：.txt 直接读取，.docx 用 mammoth 转纯文本
function ensureScriptDraftDir(): string {
  const dir = path.join(app.getPath('userData'), 'script-drafts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeDraftName(input: string): string {
  const base = String(input || 'script')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return base || 'script';
}

function createScriptDraftPath(fileName: string): string {
  const draftDir = ensureScriptDraftDir();
  const stem = safeDraftName(path.basename(fileName, path.extname(fileName)));
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(draftDir, `${stem}-${ts}.txt`);
}





let pendingCodeWindowData: { language: string; code: string } | null = null;




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
  (globalThis as any).terminalWindow = terminalWindow;

  const termPath = path.join(__dirname, '..', 'electron', 'terminal-window.html');
  terminalWindow.loadFile(termPath);

  terminalWindow.on('closed', () => {
    if (terminalPty) {
      try { terminalPty.kill(); } catch (_) {}
      terminalPty = null;
    }
    terminalWindow = null;
    (globalThis as any).terminalWindow = null;
  });
}







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

(globalThis as any).logTailProcess = null;
(globalThis as any).logWatcher = null;

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




// ===== Gateway 进程管理 =====

function sendGatewayLogLine(line: string) {
  if (!line.trim() || isNoisyLogLine(line)) return;
  mainWindow?.webContents.send('openclaw-log-lines', [line.trim()]);
}

// OCT 自己的 Gateway 路径
function getOctGatewayEntry(): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'oct-gateway', 'index.js'),
    path.join(process.resourcesPath || '', 'app.asar', 'oct-gateway', 'index.js'),
    path.join(__dirname, '..', 'oct-gateway', 'index.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveGatewayConfigFileForSpawn(entry: string): string {
  if (app.isPackaged) return CONFIG_FILE;
  const projectConfig = path.join(path.dirname(entry), 'config.json');
  const devFlag = String(process.env.OCT_DEV_USE_PROJECT_CONFIG || '0').trim().toLowerCase();
  const devEnabled = !['0', 'false', 'off', 'no'].includes(devFlag);
  if (devEnabled && fs.existsSync(projectConfig)) return projectConfig;
  return CONFIG_FILE;
}

function ensureGatewayNativeModules(entry: string): { ok: boolean; error?: string } {
  const ensureScript = path.join(__dirname, '..', 'scripts', 'ensure-oct-gateway-native.js');
  if (!fs.existsSync(ensureScript)) return { ok: true };

  const rootDir = path.resolve(path.join(path.dirname(entry), '..'));
  const runtime = app.isPackaged ? 'electron' : 'node';
  const command = app.isPackaged ? process.execPath : 'node';
  const result = spawnSync(command, [ensureScript, '--runtime', runtime], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: buildOctChildEnv(app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    encoding: 'utf8',
  });

  const forwardLogs = (prefix: string, content: string | null | undefined) => {
    if (!content) return;
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => sendGatewayLogLine(`${prefix} ${line}`));
  };

  forwardLogs('[OCT Native]', result.stdout);
  forwardLogs('[OCT Native ERR]', result.stderr);

  if (result.status === 0) return { ok: true };
  return {
    ok: false,
    error: result.error?.message || `exit code ${result.status ?? -1}`,
  };
}

let octGatewayProcess: ReturnType<typeof spawn> | null = null;

async function startOctGateway(): Promise<{ success: boolean; error?: string }> {
  if (octGatewayProcess && !octGatewayProcess.killed) {
    return { success: true };
  }

  syncAiLibraryPluginConfigFromDisk();

  const entry = getOctGatewayEntry();
  if (!entry) {
    console.warn('[OCT Gateway] oct-gateway/index.js 未找到，回退到 OpenClaw');
    return { success: false, error: 'OCT Gateway 未找到' };
  }

  const promptsDir = getPromptsDir();
  const runtimeCommand = app.isPackaged ? process.execPath : 'node';
  const runtimeArgs = [entry];
  const gatewayConfigFile = resolveGatewayConfigFileForSpawn(entry);
  const nativeCheck = ensureGatewayNativeModules(entry);

  if (!nativeCheck.ok) {
    console.warn('[OCT Gateway] native preflight failed:', nativeCheck.error);
    return {
      success: false,
      error: `Gateway native 模块检查失败：${nativeCheck.error || 'unknown error'}`,
    };
  }

  try {
    const spawnedProcess = spawn(runtimeCommand, runtimeArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
      env: buildOctChildEnv({
        ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        OCT_GATEWAY_PORT: String(GATEWAY_PORT),
        OCT_PROMPTS_DIR: promptsDir,
        OCT_CONFIG_FILE: gatewayConfigFile,
        OCT_GATEWAY_TOKEN: (process.env.OCT_GATEWAY_TOKEN || OPENCLAW_TOKEN || '').trim(),
        ...(resolvedAiLibraryUrlForGateway && !(process.env.AI_LIBRARY_URL || '').trim()
          ? { AI_LIBRARY_URL: resolvedAiLibraryUrlForGateway }
          : {}),
      }),
    });
    octGatewayProcess = spawnedProcess;
    (globalThis as any).octGatewayProcess = spawnedProcess;

    octGatewayProcess.stdout?.on('data', (chunk: Buffer) => {
      chunk.toString('utf8').split('\n').forEach((l) => {
        if (l.trim()) sendGatewayLogLine(`[OCT] ${l.trim()}`);
      });
    });
    octGatewayProcess.stderr?.on('data', (chunk: Buffer) => {
      chunk.toString('utf8').split('\n').forEach((l) => {
        if (l.trim()) sendGatewayLogLine(`[OCT ERR] ${l.trim()}`);
      });
    });
    octGatewayProcess.on('exit', (code, signal) => {
      console.log('[Gateway] 进程退出', { code, signal: signal || undefined });
      octGatewayProcess = null;
      (globalThis as any).octGatewayProcess = null;
      const intentional = (globalThis as any).expectOctGatewayProcessExit;
      (globalThis as any).expectOctGatewayProcessExit = false;
      if (mainWindow && !mainWindow.isDestroyed() && !appQuitting) {
        if (!intentional) {
          (globalThis as any).suppressAutoReconnect = true;
          sendConnLog(
            `[Gateway] 进程已退出 code=${code == null ? -1 : code}，Gateway 已停止；请使用「启动/重启 Gateway」后再连`
          );
          mainWindow.webContents.send('gateway-status', {
            running: false,
            managed: true,
            exitCode: code == null ? -1 : code,
            processExit: true,
          });
        }
      }
    });

    console.log('[OCT Gateway] 已启动，PID:', octGatewayProcess.pid);
    console.log('[OCT Gateway] 配置文件:', gatewayConfigFile);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

// AI.library 插件（随 OCT 启动知识库 HTTP，默认 :8001）
async function getAiLibraryPlugin() {
  syncAiLibraryPluginConfigFromDisk();
  let healthy = false;
  try {
    const res = await fetch(`http://127.0.0.1:${octAiLibraryPort}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    healthy = res.ok;
  } catch {
    healthy = false;
  }
  const managed = !!aiLibraryHttpServer?.listening;
  const portInUse = await isPortInUse(octAiLibraryPort);
  return {
    success: true,
    data: {
      OCT_AI_LIBRARY_AUTO_START: octAiLibraryAutoStart,
      OCT_AI_LIBRARY_PATH: '',
      OCT_AI_LIBRARY_PORT: octAiLibraryPort,
      resolvedGatewayUrl: resolvedAiLibraryUrlForGateway,
      managed,
      portInUse,
      healthy,
      mode: 'native',
      dataRoot: getNativeLibraryRoot(),
    },
  };
}

async function saveAiLibraryPlugin(payload: {
  OCT_AI_LIBRARY_AUTO_START?: boolean;
  OCT_AI_LIBRARY_PATH?: string;
  OCT_AI_LIBRARY_PORT?: number;
}) {
  try {
    let cfg: Record<string, unknown> = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      } catch {
        /* ignore */
      }
    }
    if (payload.OCT_AI_LIBRARY_AUTO_START !== undefined) {
      cfg.OCT_AI_LIBRARY_AUTO_START = payload.OCT_AI_LIBRARY_AUTO_START;
    }
    if (payload.OCT_AI_LIBRARY_PATH !== undefined) {
      cfg.OCT_AI_LIBRARY_PATH = String(payload.OCT_AI_LIBRARY_PATH || '').trim();
    }
    if (payload.OCT_AI_LIBRARY_PORT !== undefined) {
      const p = Number(payload.OCT_AI_LIBRARY_PORT);
      if (!Number.isNaN(p) && p > 0) cfg.OCT_AI_LIBRARY_PORT = p;
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    loadOpenClawConfig();

    if (aiLibraryHttpServer?.listening) {
      await new Promise<void>((resolve) => {
        aiLibraryHttpServer?.close(() => resolve());
      });
      aiLibraryHttpServer = null;
    }
    await startAiLibraryBackend();

    const gwProc = octGatewayProcess;
    const hadGateway = !!(gwProc && !gwProc.killed);
    if (hadGateway && gwProc) {
      (globalThis as any).expectOctGatewayProcessExit = true;
      try {
        gwProc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      octGatewayProcess = null;
      (globalThis as any).octGatewayProcess = null;
      await new Promise((r) => setTimeout(r, 1200));
      const inUse = await isPortInUse(GATEWAY_PORT);
      if (inUse) await forceKillPort(GATEWAY_PORT);
      await new Promise((r) => setTimeout(r, 400));
      const octResult = await startOctGateway();
      if (octResult.success) {
        (globalThis as any).reconnectRetryCount = 0;
        await new Promise((r) => setTimeout(r, 400));
        connectOpenClaw();
      }
      mainWindow?.webContents.send('openclaw-log-lines', [
        '[AI.library] 配置已保存，Gateway 已重启以应用知识库地址',
      ]);
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}





function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// 检测端口是否被监听
async function checkPortListening(port: number, timeoutMs = 5000): Promise<boolean> {
  const net = require('net');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.connect(port, '127.0.0.1', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}





/** 清理 18789 端口上所有进程并启动 OCT Gateway（解决 ECONNRESET：端口被其他程序占用） */




type OctGatewayConfigAgentPerms = {
  normalizeAgentPermissions: (input: unknown) => Record<string, boolean>;
  DEFAULT_AGENT_PERMISSIONS: Record<string, boolean>;
};
let _octGatewayConfigAgentPerms: OctGatewayConfigAgentPerms | undefined;
function getOctGatewayConfigAgentPerms(): OctGatewayConfigAgentPerms {
  if (!_octGatewayConfigAgentPerms) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _octGatewayConfigAgentPerms = require(path.join(
      getGatewayDirForHelpers(),
      'config.js',
    )) as OctGatewayConfigAgentPerms;
  }
  return _octGatewayConfigAgentPerms;
}



function syncExternalOmniRouteVault(cfg: Record<string, any>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const omniRouteConfig = require(path.join(getGatewayDirForHelpers(), 'runtime', 'omniRoute.config.js'));
    omniRouteConfig?.clearCache?.();
    omniRouteConfig?.updateCredential?.('external_omniroute', {
      baseUrl: String(cfg.OMNIROUTE_BASE_URL || '').trim(),
      apiKey: String(cfg.OMNIROUTE_API_KEY || '').trim(),
    });
  } catch (err: any) {
    console.warn('[OmniRoute Vault] Failed to sync external credential:', err?.message || String(err));
  }
}

// API Key 配置管理：config.json 优先（与 save-api-keys 写入一致，保证回填）




// Provider 列表（供 Settings UI 服务商选择器使用）

// 测试 AI 连接（用当前配置发一个简单请求，可传入 formConfig 覆盖已保存配置）


const CHAT_HISTORY_PATH = path.join(os.homedir(), '.openclaw', 'claw-terminal-history.json');
const MAX_HISTORY = 100;





function sendScriptAdapterRunRequest(method: string, params: Record<string, unknown>) {
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
    return Promise.resolve({ success: false, error: 'Gateway 未连接，请先启动 Gateway' });
  }

  const reqId = `script_adapter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const msg = {
    type: 'req',
    id: reqId,
    method,
    params,
  };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      scriptAdapterPendingRequests.delete(reqId);
      resolve({ success: false, error: 'Gateway 请求超时' });
    }, SCRIPT_ADAPTER_REQUEST_TIMEOUT_MS);
    scriptAdapterPendingRequests.set(reqId, { resolve, timeout });

    try {
      openclawWs?.send(JSON.stringify(msg));
    } catch (err: any) {
      clearTimeout(timeout);
      scriptAdapterPendingRequests.delete(reqId);
      resolve({ success: false, error: err?.message || '发送失败' });
    }
  });
}
















// ── AI.library 书库 Phase 2：Electron 原生实现（不经 Python）────────────────














type PersistedMusicClip = {
  id: string;
  title: string;
  prompt: string;
  lyrics: string;
  instrumental: boolean;
  model: string;
  traceId?: string;
  durationMs?: number;
  sampleRate?: number;
  bitrate?: number;
  sizeBytes?: number;
  mimeType: string;
  filename: string;
  createdAt: number;
};

const MUSIC_STUDIO_DIR = path.join(app.getPath('userData'), 'music-studio');
const MUSIC_HISTORY_FILE = path.join(MUSIC_STUDIO_DIR, 'history.json');

function ensureMusicStudioDir(): void {
  if (!fs.existsSync(MUSIC_STUDIO_DIR)) {
    fs.mkdirSync(MUSIC_STUDIO_DIR, { recursive: true });
  }
}

function readMusicHistory(): PersistedMusicClip[] {
  ensureMusicStudioDir();
  if (!fs.existsSync(MUSIC_HISTORY_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(MUSIC_HISTORY_FILE, 'utf-8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeMusicHistory(items: PersistedMusicClip[]): void {
  ensureMusicStudioDir();
  fs.writeFileSync(MUSIC_HISTORY_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

function persistMusicClip(entry: PersistedMusicClip, audioBuffer: Buffer): void {
  ensureMusicStudioDir();
  const filePath = path.join(MUSIC_STUDIO_DIR, entry.filename);
  fs.writeFileSync(filePath, audioBuffer);

  const nextHistory = [entry, ...readMusicHistory().filter((item) => item.id !== entry.id)].slice(0, 8);
  writeMusicHistory(nextHistory);

  const keepFiles = new Set(nextHistory.map((item) => item.filename));
  for (const existing of fs.readdirSync(MUSIC_STUDIO_DIR)) {
    if (existing === path.basename(MUSIC_HISTORY_FILE)) continue;
    if (!keepFiles.has(existing)) {
      try {
        fs.unlinkSync(path.join(MUSIC_STUDIO_DIR, existing));
      } catch {}
    }
  }
}






app.whenReady().then(async () => {
  loadOpenClawConfig();
  const loaded = loadSessionState();
  if (loaded?.sessionKey) currentSessionKey = loaded.sessionKey;

  // 1. 先创建窗口（显示界面，但不连接）
  createWindow();

  // 将主进程函数暴露到 globalThis 供 IPC 模块调用
  (globalThis as any).mainWindow = mainWindow;
  (globalThis as any).floatWindow = floatWindow;
  (globalThis as any).codeWindow = codeWindow;
  (globalThis as any).terminalWindow = terminalWindow;
  (globalThis as any).openclawWs = openclawWs;
  (globalThis as any).getOpenclawWs = () => openclawWs;
  (globalThis as any).setOpenclawWs = (ws: WebSocket | null) => { openclawWs = ws; (globalThis as any).openclawWs = ws; };
  (globalThis as any).isPortInUse = isPortInUse;
  (globalThis as any).killPortProcess = killPortProcess;
  (globalThis as any).startOctGateway = startOctGateway;
  (globalThis as any).connectOpenClaw = connectOpenClaw;
  (globalThis as any).getOctGatewayEntry = getOctGatewayEntry;
  (globalThis as any).waitForPortRelease = waitForPortRelease;
  (globalThis as any).clearReconnectTimer = clearReconnectTimer;
  (globalThis as any).loadOpenClawConfig = loadOpenClawConfig;
  (globalThis as any).getGatewayDirForHelpers = getGatewayDirForHelpers;
  (globalThis as any).readAppConfig = readAppConfig;
  (globalThis as any).synthesizeMiniMaxViaWebSocket = synthesizeMiniMaxViaWebSocket;
  (globalThis as any).sendScriptAdapterRunRequest = sendScriptAdapterRunRequest;

  const ipcDeps: IpcDeps = {
    mainWindow,
    floatWindow,
    codeWindow,
    terminalWindow,
    openclawWs,
    getMainWindow: () => mainWindow,
    getOpenclawWs: () => openclawWs,
    setOpenclawWs: (ws) => {
      openclawWs = ws as WebSocket | null;
      (globalThis as any).openclawWs = ws;
    },
    getFloatWindow: () => floatWindow,
    setFloatWindow: (win: BrowserWindow | null) => { floatWindow = win; (globalThis as any).floatWindow = win; },
    getCodeWindow: () => codeWindow,
    setCodeWindow: (win: BrowserWindow | null) => { codeWindow = win; (globalThis as any).codeWindow = win; },
    getTerminalWindow: () => terminalWindow,
    setTerminalWindow: (win: BrowserWindow | null) => { terminalWindow = win; (globalThis as any).terminalWindow = win; },
    getTerminalPty: () => terminalPty,
    setTerminalPty: (nextPty) => { terminalPty = nextPty as pty.IPty | null; },
    createFloatWindow,
    createTerminalWindow,
    getPendingCodeWindowData: () => pendingCodeWindowData,
    setPendingCodeWindowData: (d: { language: string; code: string } | null) => { pendingCodeWindowData = d; },
    connectOpenClaw,
    sendChatMessage,
    cancelChatMessage,
    setSessionKey: (key: string) => {
      currentSessionKey = key || 'main';
      saveSessionState({ ...(lastSessionState || {}), sessionKey: currentSessionKey });
    },
    setThinkMode: (level: string) => {
      currentThinkMode = (level || '').trim().toLowerCase();
    },
    getOpenClawStatus,
    getAiLibraryPlugin,
    saveAiLibraryPlugin,
  };

  registerAllIpcHandlers(ipcDeps);

  // 2b. AI.library 插件（可选，在 Gateway 之前启动以便注入 AI_LIBRARY_URL）
  try {
    await startAiLibraryBackend();
  } catch (e) {
    console.warn('[AI.library] 启动异常:', e);
  }
  syncAiLibraryPluginConfigFromDisk();

  // 3. 清理可能残留的旧 Gateway 进程
  const inUse = await isPortInUse(GATEWAY_PORT);
  if (inUse) {
    console.log('[Gateway] 检测到端口占用，强制清理...');
    mainWindow?.webContents.send('openclaw-log-lines',
      ['[Gateway] 检测到旧进程，正在清理...']
    );
    await forceKillPort(GATEWAY_PORT);
    await new Promise(r => setTimeout(r, 800));
  }

  // 4. 启动 OCT Gateway
  const octResult = await startOctGateway();
  if (!octResult.success) {
    console.error('[Gateway] 启动失败:', octResult.error);
    mainWindow?.webContents.send('openclaw-log-lines',
      [`[ERR] Gateway 启动失败: ${octResult.error}`]
    );
    const config = loadClawConfig();
    registerScreenshotShortcut(config.screenshotShortcut);
    return;
  }

  // 5. 等待 Gateway 真正就绪（健康检查）
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 300));
    if (await isPortInUse(GATEWAY_PORT)) {
      ready = true;
      break;
    }
  }

  if (!ready) {
    mainWindow?.webContents.send('openclaw-log-lines',
      ['[ERR] Gateway 启动超时，请手动重启']
    );
    const config = loadClawConfig();
    registerScreenshotShortcut(config.screenshotShortcut);
    return;
  }

  mainWindow?.webContents.send('gateway-status', { running: true, managed: true });
  mainWindow?.webContents.send('openclaw-log-lines',
    ['[OCT Gateway] 已就绪 ✅']
  );

  // 6. Gateway 就绪后再连接 WebSocket
  await new Promise(r => setTimeout(r, 200));
  connectOpenClaw();

  const config = loadClawConfig();
  registerScreenshotShortcut(config.screenshotShortcut);
});



app.on('will-quit', async () => {
  appQuitting = true;
  globalShortcut.unregisterAll();
  
  // 停止所有子进程并清理端口
  if (octGatewayProcess && !octGatewayProcess.killed) {
    (globalThis as any).expectOctGatewayProcessExit = true;
    try { octGatewayProcess.kill('SIGTERM'); } catch {}
    octGatewayProcess = null;
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    try { gatewayProcess.kill('SIGTERM'); } catch {}
    gatewayProcess = null;
  }
  if (aiLibraryHttpServer?.listening) {
    await new Promise<void>((resolve) => aiLibraryHttpServer?.close(() => resolve()));
    aiLibraryHttpServer = null;
  }
  
  // 强制清理端口，确保下次启动时不会被占用
  try {
    await forceKillPort(GATEWAY_PORT);
    console.log('[Gateway] 端口已清理');
  } catch {}
});

// 窗口关闭前先清理进程和端口
app.on('before-quit', async (e) => {
  if (appQuitting) return; // 防止重复执行
  
  e.preventDefault(); // 阻止立即退出
  appQuitting = true;
  
  console.log('[App] 正在清理进程和端口...');
  
  // 1. 关闭 WebSocket 连接
  if (openclawWs) {
    try { openclawWs.close(); } catch {}
    openclawWs = null;
  }
  
  // 2. 停止所有子进程
  if (octGatewayProcess && !octGatewayProcess.killed) {
    (globalThis as any).expectOctGatewayProcessExit = true;
    try { octGatewayProcess.kill('SIGTERM'); } catch {}
    octGatewayProcess = null;
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    try { gatewayProcess.kill('SIGTERM'); } catch {}
    gatewayProcess = null;
  }
  if (aiLibraryHttpServer?.listening) {
    await new Promise<void>((resolve) => aiLibraryHttpServer?.close(() => resolve()));
    aiLibraryHttpServer = null;
  }

  // 3. 强制清理端口
  try {
    await forceKillPort(GATEWAY_PORT);
    console.log('[App] 端口 18789 已清理');
  } catch {}
  
  // 4. 等待一小段时间确保端口释放
  await new Promise(r => setTimeout(r, 500));
  
  // 5. 现在可以退出了
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// ═══════════════════════════════════════════════════════════════
// 本地任务存储
// ═══════════════════════════════════════════════════════════════
const TASKS_FILE_PATH = path.join(app.getPath('userData'), 'tasks.json');

interface TaskItem {
  id: string;
  content: string;
  priority: 'p0' | 'p1' | 'p2';
  done: boolean;
  source: 'amy' | 'user';
  createdAt: string;
}

interface TasksData {
  tasks: TaskItem[];
  parking: TaskItem[];
  intention: string;
  updatedAt: string;
}

function getTasksFilePath(): string {
  return TASKS_FILE_PATH;
}

function loadTasksData(): TasksData {
  try {
    if (fs.existsSync(TASKS_FILE_PATH)) {
      const content = fs.readFileSync(TASKS_FILE_PATH, 'utf-8');
      const data = JSON.parse(content);
      return {
        tasks: data.tasks || [],
        parking: data.parking || [],
        intention: data.intention || '',
        updatedAt: data.updatedAt || '',
      };
    }
  } catch (e) {
    console.error('[TasksLocal] 加载失败:', e);
  }
  return { tasks: [], parking: [], intention: '', updatedAt: '' };
}

function saveTasksData(data: TasksData): boolean {
  try {
    data.updatedAt = new Date().toISOString();
    const dir = path.dirname(TASKS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TASKS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[TasksLocal] 保存失败:', e);
    return false;
  }
}

/** 读取所有任务（返回原始 JSON） */
function normalizeTaskContent(content: string): string {
  return String(content || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isLikelyDuplicateTaskContent(a: string, b: string): boolean {
  const left = normalizeTaskContent(a);
  const right = normalizeTaskContent(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (shorter.length < 4) return false;

  return longer.includes(shorter) && longer.length - shorter.length <= 16;
}

function dedupeTaskItems(tasks: TaskItem[]): TaskItem[] {
  const deduped: TaskItem[] = [];
  for (const task of tasks || []) {
    const duplicate = deduped.find(existing => {
      if (!!existing.done !== !!task.done) return false;
      return isLikelyDuplicateTaskContent(existing.content, task.content);
    });
    if (!duplicate) deduped.push(task);
  }
  return deduped;
}


app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
