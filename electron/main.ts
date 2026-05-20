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
let reconnectRetryCount = 0;
/** 应用/主窗口正在关闭，避免 WebSocket 断开回调里向已销毁的窗口 send 导致报错 */
let appQuitting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let suppressAutoReconnect = false;
/** 为 true 时表示即将主动结束 OCT Gateway 子进程，exit 回调不应视为崩溃 */
let expectOctGatewayProcessExit = false;
let lastSessionState: { messages?: any[]; sessionKey?: string } | null = null;
let currentSessionKey: string = 'main';
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

type LocalVisionDownloadState = {
  status: 'ready' | 'not_downloaded' | 'downloading' | 'error';
  lastError: string;
  lastMessage: string;
};

let localVisionDownloadState: LocalVisionDownloadState = {
  status: 'not_downloaded',
  lastError: '',
  lastMessage: '',
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

function getLocalVisionConfig() {
  const cfg = readAppConfig();
  const imageAnalysis = (cfg.image_analysis && typeof cfg.image_analysis === 'object') ? cfg.image_analysis : {};
  const local = (imageAnalysis.local && typeof imageAnalysis.local === 'object') ? imageAnalysis.local : {};
  return {
    enabled: local.enabled !== false,
    modelCachePath: String(local.model_cache_path || './models/blip'),
    mirrorHost: String(local.mirror_host || ''),
    modelId: 'Xenova/blip-image-captioning-base',
  };
}

function getLocalVisionCacheDir(): string {
  const gatewayDir = getGatewayDirForHelpers();
  const localCfg = getLocalVisionConfig();
  return path.resolve(path.join(gatewayDir, localCfg.modelCachePath));
}

function countFilesRecursive(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(entryPath);
    } else {
      count += 1;
    }
  }
  return count;
}

function getLocalVisionStatusPayload() {
  const localCfg = getLocalVisionConfig();
  const cacheDir = getLocalVisionCacheDir();
  const fileCount = countFilesRecursive(cacheDir);
  const downloaded = fileCount > 0;
  let status: LocalVisionDownloadState['status'] = downloaded ? 'ready' : 'not_downloaded';
  if (localVisionDownloadState.status === 'downloading') status = 'downloading';
  if (localVisionDownloadState.status === 'error') status = 'error';
  const lastError = localVisionDownloadState.lastError || '';
  const lastMessage = localVisionDownloadState.lastMessage || '';
  return {
    status,
    enabled: localCfg.enabled,
    downloaded,
    modelId: localCfg.modelId,
    mirrorHost: localCfg.mirrorHost,
    cacheDir,
    fileCount,
    lastError,
    message: lastMessage
      || (status === 'ready'
        ? `本地视觉模型已就绪，可作为离线兜底。${localCfg.mirrorHost ? ' 当前优先使用自定义镜像，失败时会回退官方源。' : ''}`
        : status === 'downloading'
          ? `正在下载本地视觉模型，请保持网络畅通。${localCfg.mirrorHost ? ' 当前优先使用自定义镜像，失败时会自动回退官方源。' : ''}`
          : status === 'error'
            ? `下载失败：${lastError || '未知错误'}`
            : `未下载本地视觉模型。推荐优先使用 MCP 图片理解；若需要离线兜底，可手动下载。${localCfg.mirrorHost ? ' 当前已配置自定义镜像，失败时会自动回退官方源。' : ''}`),
  };
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

function getFallbackProviders() {
  return {
    'bailian-coding': {
      id: 'bailian-coding',
      name: '阿里云百炼 Coding Plan',
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      keyPlaceholder: 'sk-sp-xxxxxxxxxxxxxxxx',
      keyLink: 'https://bailian.console.aliyun.com/',
      defaultModel: 'qwen3.5-plus',
      models: [
        { id: 'qwen3.5-plus', label: 'Qwen 3.5 Plus（推荐）', tools: true, thinking: true },
        { id: 'qwen3-max-2026-01-23', label: 'Qwen 3 Max（最强推理）', tools: true, thinking: false },
        { id: 'qwen3-coder-next', label: 'Qwen 3 Coder Next（代码）', tools: true, thinking: false },
        { id: 'kimi-k2.5', label: 'Kimi K2.5（月之暗面）', tools: true, thinking: false },
        { id: 'MiniMax-M2.5', label: 'MiniMax M2.5', tools: true, thinking: false },
      ],
    },
    deepseek: {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      keyLink: 'https://platform.deepseek.com/',
      defaultModel: 'deepseek-v4-flash',
      models: [
        { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash（通用，推荐）', tools: true, thinking: false },
        { id: 'deepseek-v4-pro',   label: 'DeepSeek V4 Pro（深度推理）',    tools: false, thinking: true },
        { id: 'deepseek-chat',     label: 'DeepSeek Chat（旧版）',          tools: true, thinking: false },
        { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner（旧版）',      tools: false, thinking: true },
      ],
    },
    minimax: {
      id: 'minimax',
      name: 'MiniMax',
      baseUrl: 'https://api.minimaxi.com/v1',
      keyPlaceholder: 'sk-cp-xxxxxxxxxxxxxxxx',
      keyLink: 'https://platform.minimaxi.com/docs/token-plan/intro',
      defaultModel: 'MiniMax-M2.7',
      models: [
        { id: 'MiniMax-M2.7', label: 'MiniMax M2.7（最新，自我迭代）', tools: true, thinking: false },
        { id: 'MiniMax-M2.5', label: 'MiniMax M2.5（顶尖性能）', tools: true, thinking: false },
        { id: 'MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 极速版（100tps）', tools: true, thinking: false },
      ],
    },
    siliconflow: {
      id: 'siliconflow',
      name: '硅基流动 SiliconFlow',
      baseUrl: 'https://api.siliconflow.cn/v1',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      keyLink: 'https://cloud.siliconflow.cn/',
      defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
      models: [
        { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B（免费）', tools: true, thinking: false },
        { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3', tools: false, thinking: false },
        { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1（推理）', tools: false, thinking: true },
      ],
    },
    moonshot: {
      id: 'moonshot',
      name: 'Kimi 开放平台',
      baseUrl: 'https://api.moonshot.cn/v1',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      keyLink: 'https://platform.kimi.com/',
      defaultModel: 'kimi-k2.6',
      models: [
        { id: 'kimi-k2.6', label: 'Kimi K2.6（官方最新）', tools: true, thinking: false },
        { id: 'kimi-k2.5', label: 'Kimi K2.5（稳定）', tools: true, thinking: false },
        { id: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo（高速）', tools: true, thinking: false },
        { id: 'moonshot-v1-128k', label: 'Moonshot V1 128K（兼容）', tools: true, thinking: false },
      ],
    },
    newapi: {
      id: 'newapi',
      name: 'New API 外部分发网关',
      baseUrl: 'http://127.0.0.1:3000/v1',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      keyLink: 'https://docs.newapi.ai/',
      defaultModel: '__custom__',
      models: [
        { id: '__custom__', label: '✏️ New API 模型 ID（后台渠道模型名）', tools: true, thinking: false, custom: true },
        { id: 'qwen-plus', label: 'qwen-plus（百炼｜稳定通用）', tools: true, thinking: false },
        { id: 'qwen-turbo', label: 'qwen-turbo（百炼｜低延迟）', tools: true, thinking: false },
        { id: 'qwen-max', label: 'qwen-max（百炼｜高质量）', tools: true, thinking: false },
        { id: 'qwen3.5-plus', label: 'qwen3.5-plus（百炼｜新一代通用）', tools: true, thinking: false },
        { id: 'qwen3.6-flash-2026-04-16', label: 'qwen3.6-flash-2026-04-16（百炼｜高速）', tools: true, thinking: false },
        { id: 'qwen3.6-plus-2026-04-02', label: 'qwen3.6-plus-2026-04-02（百炼｜通用增强）', tools: true, thinking: false },
        { id: 'qwen3-coder-plus-2025-09-23', label: 'qwen3-coder-plus-2025-09-23（百炼｜代码）', tools: true, thinking: false },
        { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash（百炼｜快速）', tools: true, thinking: false },
        { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro（百炼｜高质量）', tools: true, thinking: false },
        { id: 'doubao-seed-2-0-lite-260215', label: 'doubao-seed-2-0-lite-260215（火山｜高速）', tools: true, thinking: false },
        { id: 'doubao-seed-2-0-pro-260215', label: 'doubao-seed-2-0-pro-260215（火山｜高质量）', tools: true, thinking: false },
        { id: 'doubao-1-5-lite-32k-250115', label: 'doubao-1-5-lite-32k-250115（火山｜稳定）', tools: true, thinking: false },
        { id: 'doubao-1-5-pro-32k-250115', label: 'doubao-1-5-pro-32k-250115（火山｜稳定增强）', tools: true, thinking: false },
      ],
      allowCustomModel: true,
    },
    google: {
      id: 'google',
      name: 'Google Gemini（Vertex AI 原生）',
      baseUrl: 'https://aiplatform.googleapis.com/v1beta1/projects/YOUR_PROJECT_ID/locations/us-central1/endpoints/openapi',
      keyPlaceholder: 'AQ.xxxxx 或绑定 Vertex 的 API Key',
      keyLink: 'https://console.cloud.google.com/vertex-ai/studio/settings/api-keys',
      defaultModel: 'google/gemini-2.5-flash',
      models: [
        { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash（推荐）', tools: true, thinking: true },
        { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite（低延迟）', tools: true, thinking: true },
        { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro（深度推理）', tools: true, thinking: true },
        { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash（预览）', tools: true, thinking: true },
        { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite（预览）', tools: true, thinking: true },
        { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro（预览）', tools: true, thinking: true },
        { id: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash（兼容）', tools: true, thinking: false },
        { id: 'google/gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite（低成本）', tools: true, thinking: false },
      ],
    },
    custom: {
      id: 'custom',
      name: '自定义 OpenAI 兼容服务',
      baseUrl: '',
      keyPlaceholder: 'your-api-key',
      keyLink: '',
      defaultModel: '__custom__',
      models: [
        { id: '__custom__', label: '✏️ 自定义模型（手动输入）', tools: true, thinking: false, custom: true },
      ],
      allowCustomModel: true,
    },
  };
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
let aiLibraryProcess: ReturnType<typeof spawn> | null = null;
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

  if (aiLibraryProcess && !aiLibraryProcess.killed) return true;
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

  // 窗口准备好后显示，避免白屏/黑屏
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    console.log('[Electron] Window ready to show');
  });

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

  mainWindow.on('closed', async () => {
    appQuitting = true;
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
    if (octGatewayProcess && !octGatewayProcess.killed) {
      expectOctGatewayProcessExit = true;
      octGatewayProcess.kill();
      octGatewayProcess = null;
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
  console.log('[OCT] Connecting to', OPENCLAW_WS_URL, 'retry:', reconnectRetryCount);
  sendConnLog(`正在连接 ${OPENCLAW_WS_URL} (重试 #${reconnectRetryCount})`);
  sendConnLog(`Token: ${(process.env.OCT_GATEWAY_TOKEN || OPENCLAW_TOKEN || '').trim() ? '已设置' : '未设置'}`);

  const ws = new WebSocket(OPENCLAW_WS_URL);
  openclawWs = ws;

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
    if (suppressAutoReconnect) {
      sendConnLog('当前为主动重连流程，跳过自动退避重连');
      return;
    }
    if (!mainWindow) return;
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    reconnectRetryCount++;
    if (reconnectRetryCount <= MAX_RECONNECT_RETRIES) {
      const delay = Math.min(5000 * Math.pow(2, reconnectRetryCount - 1), 60000);
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
    sendConnLog(`WebSocket 已断开 code=${code} reason=${reasonStr}，${reconnectRetryCount <= MAX_RECONNECT_RETRIES ? '将按退避延迟重连' : '已达重试上限'}`);
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
  if (status.connected) reconnectRetryCount = 0;
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
      } else if (msg.event === 'task-board-update') {
        mainWindow?.webContents.send('task-board-update');
        mainWindow?.webContents.executeJavaScript('window.dispatchEvent(new Event("tasks-updated"))').catch(() => {});
      } else if (msg.event === 'script-adapter') {
        sendScriptAdapterEvent(msg.payload || {});
      } else if (msg.event === 'tool' || msg.event === 'agent-phase') {
        // 工具调用事件和 agent 阶段事件：直接透传，不经过 forwardChatToFrontend（避免 state:'done' 被误判为 chat done）
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
      const isImage = mimeType.startsWith('image/');

      // 默认只传元数据；图片保留 base64（视觉直传），音频在发送时按需读取为 base64（Gemini input_audio）
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

ipcMain.handle('save-script-draft-cache', async (_, payload: {
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
  const result = await dialog.showOpenDialog(mainWindow!, {
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
      const { value } = await mammoth.extractRawText({ path: filePath });
      text = value;
    } else {
      // .txt 自动检测编码，优先 utf-8，GB18030 兜底
      const buf = fs.readFileSync(filePath);
      // 简单探测：utf-8 BOM 或纯 ASCII → utf8，否则用 latin1 再转
      text = buf.toString('utf-8');
      // 如果含乱码替换符说明编码不对，改用 GB18030（Windows 中文 txt 常见）
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
    // 根据平台使用不同的日志监控方式
    if (process.platform === 'win32') {
      // Windows: 使用 PowerShell
      const psPath = pathToUse.replace(/'/g, "''");
      const psCmd = `$p='${psPath}'; while($true){if(Test-Path -LiteralPath $p){Get-Content -LiteralPath $p -Tail 10 -Encoding UTF8}; Start-Sleep -Milliseconds 500}`;
      
      try {
        const { execSync } = require('child_process');
        execSync('where powershell.exe', { stdio: 'ignore', windowsHide: true });
        logTailProcess = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (e) {
        console.warn('[Main] PowerShell not found, using fallback log watcher');
        mainWindow?.webContents.send('openclaw-log-lines', ['[WARN] PowerShell 未找到，使用备用日志监控']);
        // 备用方案：fs.watch
        try {
          const fsWatcher = fs.watch(pathToUse, { persistent: false }, (eventType) => {
            if (eventType === 'change' && fs.existsSync(pathToUse)) {
              try {
                const content = fs.readFileSync(pathToUse, 'utf-8');
                const lines = content.split('\n').slice(-10);
                lines.forEach(line => {
                  if (line.trim()) mainWindow?.webContents.send('openclaw-log-lines', [line]);
                });
              } catch (e) {}
            }
          });
          (global as any).logFsWatcher = fsWatcher;
        } catch (e2) {
          console.error('[Main] Fallback log watcher failed:', e2);
        }
      }
    } else {
      // Mac/Linux: 使用 tail -f
      logTailProcess = spawn('tail', ['-f', pathToUse], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    }
    if (logTailProcess) {
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
    }

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
  const tasksPath = path.join(app.getPath('userData'), 'tasks.json');
  const vaultPath = path.join(app.getPath('userData'), 'vault.enc');
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
    octGatewayProcess = spawn(runtimeCommand, runtimeArgs, {
      cwd: path.dirname(entry),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
      env: buildOctChildEnv({
        ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        OCT_GATEWAY_PORT: String(GATEWAY_PORT),
        OCT_PROMPTS_DIR: promptsDir,
        OCT_CONFIG_FILE: gatewayConfigFile,
        OCT_GATEWAY_TOKEN: (process.env.OCT_GATEWAY_TOKEN || OPENCLAW_TOKEN || '').trim(),
        OPENCLAW_TASKS_PATH: tasksPath,
        OCT_VAULT_PATH: vaultPath,
        ...(resolvedAiLibraryUrlForGateway && !(process.env.AI_LIBRARY_URL || '').trim()
          ? { AI_LIBRARY_URL: resolvedAiLibraryUrlForGateway }
          : {}),
      }),
    });

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
      const intentional = expectOctGatewayProcessExit;
      expectOctGatewayProcessExit = false;
      if (mainWindow && !mainWindow.isDestroyed() && !appQuitting) {
        if (!intentional) {
          suppressAutoReconnect = true;
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
ipcMain.handle('get-ai-library-plugin', async () => {
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
  const managed = !!(aiLibraryHttpServer?.listening || (aiLibraryProcess && !aiLibraryProcess.killed));
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
});

ipcMain.handle(
  'save-ai-library-plugin',
  async (
    _,
    payload: {
      OCT_AI_LIBRARY_AUTO_START?: boolean;
      OCT_AI_LIBRARY_PATH?: string;
      OCT_AI_LIBRARY_PORT?: number;
    }
  ) => {
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
      if (aiLibraryProcess && !aiLibraryProcess.killed) {
        try {
          aiLibraryProcess.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        aiLibraryProcess = null;
        await new Promise((r) => setTimeout(r, 800));
      }
      await startAiLibraryBackend();

      const gwProc = octGatewayProcess;
      const hadGateway = !!(gwProc && !gwProc.killed);
      if (hadGateway && gwProc) {
        expectOctGatewayProcessExit = true;
        try {
          gwProc.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        octGatewayProcess = null;
        await new Promise((r) => setTimeout(r, 1200));
        const inUse = await isPortInUse(GATEWAY_PORT);
        if (inUse) await forceKillPort(GATEWAY_PORT);
        await new Promise((r) => setTimeout(r, 400));
        const octResult = await startOctGateway();
        if (octResult.success) {
          reconnectRetryCount = 0;
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
);

ipcMain.handle('get-memory-summarizer-config', async () => {
  try {
    const cfg = readAppConfig();
    const memoryCfg = cfg.memory && typeof cfg.memory === 'object' ? cfg.memory : {};
    const summarizer = memoryCfg.summarizer && typeof memoryCfg.summarizer === 'object'
      ? memoryCfg.summarizer
      : {};
    const apiCfg = summarizer.api && typeof summarizer.api === 'object' ? summarizer.api : {};
    return {
      success: true,
      data: {
        enabled: summarizer.enabled !== false,
        baseUrl: String(apiCfg.baseUrl || ''),
        apiKey: String(apiCfg.apiKey || ''),
        model: String(apiCfg.model || ''),
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
});

ipcMain.handle(
  'save-memory-summarizer-config',
  async (
    _,
    payload: {
      enabled?: boolean;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    }
  ) => {
    try {
      ensureConfigFile();
      const cfg = readAppConfig();
      const memoryCfg = cfg.memory && typeof cfg.memory === 'object' ? { ...cfg.memory } : {};
      const summarizer = memoryCfg.summarizer && typeof memoryCfg.summarizer === 'object'
        ? { ...memoryCfg.summarizer }
        : {};
      const apiCfg = summarizer.api && typeof summarizer.api === 'object'
        ? { ...summarizer.api }
        : {};

      if (payload.enabled !== undefined) summarizer.enabled = payload.enabled !== false;
      if (payload.baseUrl !== undefined) apiCfg.baseUrl = String(payload.baseUrl || '').trim();
      if (payload.apiKey !== undefined) apiCfg.apiKey = String(payload.apiKey || '').trim();
      if (payload.model !== undefined) apiCfg.model = String(payload.model || '').trim();

      summarizer.api = apiCfg;
      memoryCfg.summarizer = summarizer;
      cfg.memory = memoryCfg;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
      loadOpenClawConfig();

      const hadGateway = !!(octGatewayProcess && !octGatewayProcess.killed);
      if (hadGateway && octGatewayProcess) {
        expectOctGatewayProcessExit = true;
        try {
          octGatewayProcess.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        octGatewayProcess = null;
        mainWindow?.webContents.send('openclaw-log-lines', ['[记忆系统] 摘要模型配置已保存，正在重启 Gateway...']);
        await waitForPortRelease(GATEWAY_PORT, 5000);
        await new Promise((r) => setTimeout(r, 500));
        const octResult = await startOctGateway();
        if (octResult.success) {
          reconnectRetryCount = 0;
          await new Promise((r) => setTimeout(r, 500));
          connectOpenClaw();
        }
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }
);

const VECTOR_PROVIDER_PRESETS = {
  bailian: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'text-embedding-v4',
    dimensions: 1024,
  },
  volcengine: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    dimensions: 1024,
  },
};

function inferVectorProvider(baseUrl: string, model: string): 'bailian' | 'volcengine' | 'custom' {
  const u = String(baseUrl || '').toLowerCase();
  const m = String(model || '').toLowerCase();
  if (u.includes('dashscope') || m.includes('text-embedding-v3') || m.includes('text-embedding-v4')) return 'bailian';
  if (u.includes('volces') || u.includes('ark.cn-beijing') || u.includes('doubao')) return 'volcengine';
  return 'custom';
}

ipcMain.handle('get-memory-vector-recall-config', async () => {
  try {
    const cfg = readAppConfig();
    const memoryCfg = cfg.memory && typeof cfg.memory === 'object' ? cfg.memory : {};
    const vectorRecall = memoryCfg.vectorRecall && typeof memoryCfg.vectorRecall === 'object'
      ? memoryCfg.vectorRecall
      : {};
    const embedding = vectorRecall.embedding && typeof vectorRecall.embedding === 'object'
      ? vectorRecall.embedding
      : {};
    const recall = vectorRecall.recall && typeof vectorRecall.recall === 'object'
      ? vectorRecall.recall
      : {};
    const baseUrl = String(embedding.baseUrl || '');
    const model = String(embedding.model || '');
    return {
      success: true,
      data: {
        enabled: vectorRecall.enabled === true,
        provider: String(vectorRecall.provider || inferVectorProvider(baseUrl, model)),
        baseUrl,
        apiKey: String(embedding.apiKey || ''),
        model,
        dimensions: Number(embedding.dimensions || 1024),
        threshold: Number(recall.threshold || 0.75),
        topK: Number(recall.topK || 3),
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
});

ipcMain.handle(
  'save-memory-vector-recall-config',
  async (
    _,
    payload: {
      enabled?: boolean;
      provider?: 'bailian' | 'volcengine' | 'custom';
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      dimensions?: number;
      threshold?: number;
      topK?: number;
    }
  ) => {
    try {
      ensureConfigFile();
      const cfg = readAppConfig();
      const memoryCfg = cfg.memory && typeof cfg.memory === 'object' ? { ...cfg.memory } : {};
      const vectorRecall = memoryCfg.vectorRecall && typeof memoryCfg.vectorRecall === 'object'
        ? { ...memoryCfg.vectorRecall }
        : {};
      const embedding = vectorRecall.embedding && typeof vectorRecall.embedding === 'object'
        ? { ...vectorRecall.embedding }
        : {};
      const recall = vectorRecall.recall && typeof vectorRecall.recall === 'object'
        ? { ...vectorRecall.recall }
        : {};

      if (payload.enabled !== undefined) vectorRecall.enabled = payload.enabled === true;
      if (payload.provider !== undefined) vectorRecall.provider = payload.provider;
      if (payload.baseUrl !== undefined) embedding.baseUrl = String(payload.baseUrl || '').trim();
      if (payload.apiKey !== undefined) embedding.apiKey = String(payload.apiKey || '').trim();
      if (payload.model !== undefined) embedding.model = String(payload.model || '').trim();
      if (payload.dimensions !== undefined) {
        const n = Number(payload.dimensions);
        embedding.dimensions = Number.isFinite(n) && n > 0 ? Math.round(n) : 1024;
      }
      if (payload.provider === 'bailian') {
        embedding.baseUrl = payload.baseUrl || VECTOR_PROVIDER_PRESETS.bailian.baseUrl;
        embedding.model = payload.model || VECTOR_PROVIDER_PRESETS.bailian.model;
        embedding.dimensions = Number(payload.dimensions || VECTOR_PROVIDER_PRESETS.bailian.dimensions);
      } else if (payload.provider === 'volcengine') {
        embedding.baseUrl = payload.baseUrl || VECTOR_PROVIDER_PRESETS.volcengine.baseUrl;
        embedding.dimensions = Number(payload.dimensions || VECTOR_PROVIDER_PRESETS.volcengine.dimensions);
      }
      embedding.version = Number(embedding.version || 1);
      embedding.timeoutMs = Number(embedding.timeoutMs || 30000);
      if (payload.threshold !== undefined) {
        const n = Number(payload.threshold);
        recall.threshold = Number.isFinite(n) ? Math.min(0.99, Math.max(0.1, n)) : 0.75;
      }
      if (payload.topK !== undefined) {
        const n = Number(payload.topK);
        recall.topK = Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : 3;
      }

      vectorRecall.embedding = embedding;
      vectorRecall.recall = recall;
      memoryCfg.vectorRecall = vectorRecall;
      cfg.memory = memoryCfg;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
      loadOpenClawConfig();

      const hadGateway = !!(octGatewayProcess && !octGatewayProcess.killed);
      if (hadGateway && octGatewayProcess) {
        expectOctGatewayProcessExit = true;
        try {
          octGatewayProcess.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        octGatewayProcess = null;
        mainWindow?.webContents.send('openclaw-log-lines', ['[记忆系统] 向量召回配置已保存，正在重启 Gateway...']);
        await waitForPortRelease(GATEWAY_PORT, 5000);
        await new Promise((r) => setTimeout(r, 500));
        const octResult = await startOctGateway();
        if (octResult.success) {
          reconnectRetryCount = 0;
          await new Promise((r) => setTimeout(r, 500));
          connectOpenClaw();
        }
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }
);

/** MCP Server 管理 IPC */
ipcMain.handle('mcp-get-status', async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT + 1}/mcp/status`);
    return await res.json();
  } catch { return {}; }
});

ipcMain.handle('mcp-add-server', async (_, name: string, cfg: any) => {
  try {
    // 与 oct-gateway POST /mcp/server 一致：扁平字段 name + command + args + env（勿包在 config 里）
    const body = {
      name,
      command: cfg?.command,
      args: cfg?.args,
      env: cfg?.env && typeof cfg.env === 'object' ? cfg.env : {},
    };
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT + 1}/mcp/server`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e: any) { return { success: false, error: e?.message || String(e) }; }
});

ipcMain.handle('mcp-remove-server', async (_, name: string) => {
  try {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT + 1}/mcp/server/${name}`, {
      method: 'DELETE',
    });
    return await res.json();
  } catch (e: any) { return { success: false, error: e?.message || String(e) }; }
});

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

ipcMain.handle('start-gateway', async () => {
  // 清理端口
  if (await isPortInUse(GATEWAY_PORT)) {
    await killPortProcess(GATEWAY_PORT);
    await new Promise(r => setTimeout(r, 1500));
  }
  // 启动 OCT Gateway
  const result = await startOctGateway();
  if (result.success) {
    mainWindow?.webContents.send('openclaw-log-lines', ['[OCT Gateway] 已启动 ✅']);
    suppressAutoReconnect = false;
    reconnectRetryCount = 0;
    await new Promise((r) => setTimeout(r, 800));
    connectOpenClaw();
  }
  return result;
});

ipcMain.handle('stop-gateway', () => {
  // 停止 OCT Gateway
  if (octGatewayProcess && !octGatewayProcess.killed) {
    expectOctGatewayProcessExit = true;
    octGatewayProcess.kill();
    octGatewayProcess = null;
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill();
    gatewayProcess = null;
  }
  mainWindow?.webContents.send('gateway-status', { running: false, managed: false });
  mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 已停止']);
  return { success: true };
});

ipcMain.handle('gateway-restart', async () => {
  if (octGatewayProcess && !octGatewayProcess.killed) {
    expectOctGatewayProcessExit = true;
    octGatewayProcess.kill();
    octGatewayProcess = null;
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill();
    gatewayProcess = null;
  }
  mainWindow?.webContents.send('gateway-status', { running: false, managed: false });
  mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 正在重启...']);
  // 强制清理 18789 端口，避免 EADDRINUSE（旧进程未及时释放端口）
  await killPortProcess(GATEWAY_PORT);
  await new Promise(r => setTimeout(r, 2500));
  const octEntry = getOctGatewayEntry();
  if (octEntry) {
    const octResult = await startOctGateway();
    if (octResult.success) {
      await new Promise(r => setTimeout(r, 1500));
      mainWindow?.webContents.send('gateway-status', { running: true, managed: true });
      mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 已启动']);
      if (openclawWs) { openclawWs.close(); openclawWs = null; }
      suppressAutoReconnect = false;
      reconnectRetryCount = 0;
      connectOpenClaw();
      return { success: true };
    }
  }
  mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 重启失败']);
  return { success: false, error: 'OCT Gateway 启动失败' };
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

/** 清理 18789 端口上所有进程并启动 OCT Gateway（解决 ECONNRESET：端口被其他程序占用） */
ipcMain.handle('gateway-clear-port-and-start', async () => {
  mainWindow?.webContents.send('openclaw-log-lines', ['[System] 正在清理 18789 端口并启动 OCT Gateway...']);
  if (octGatewayProcess && !octGatewayProcess.killed) {
    expectOctGatewayProcessExit = true;
    octGatewayProcess.kill();
    octGatewayProcess = null;
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill();
    gatewayProcess = null;
  }
  const { execSync } = await import('child_process');
  const port = GATEWAY_PORT;
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', windowsHide: true });
    const lines = out.trim().split(/\r?\n/);
    const pidsToKill = new Set<number>();
    for (const line of lines) {
      if (!/LISTENING/i.test(line)) continue;
      const m = line.trim().match(/\s+(\d+)\s*$/);
      if (m) {
        const pid = parseInt(m[1], 10);
        if (pid > 0) pidsToKill.add(pid);
      }
    }
    for (const pid of pidsToKill) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf-8', windowsHide: true });
        mainWindow?.webContents.send('openclaw-log-lines', [`[System] 已终止监听端口 ${port} 的进程 PID ${pid}`]);
      } catch (_) {}
    }
    if (pidsToKill.size === 0) {
      mainWindow?.webContents.send('openclaw-log-lines', ['[System] 端口 18789 当前无进程监听']);
    }
  } catch (_) {
    mainWindow?.webContents.send('openclaw-log-lines', ['[System] 端口 18789 当前无进程监听']);
  }
  mainWindow?.webContents.send('gateway-status', { running: false, managed: false });
  await new Promise(r => setTimeout(r, 2000));
  const octEntry = getOctGatewayEntry();
  if (!octEntry) {
    mainWindow?.webContents.send('openclaw-log-lines', ['[System] 未找到 oct-gateway，无法启动']);
    return { success: false, error: 'OCT Gateway 未找到' };
  }
  const octResult = await startOctGateway();
  if (!octResult.success) {
    mainWindow?.webContents.send('openclaw-log-lines', [`[System] 启动失败: ${octResult.error}`]);
    return { success: false, error: octResult.error };
  }
  mainWindow?.webContents.send('openclaw-log-lines', ['[OCT Gateway] 已启动，等待就绪...']);
  await new Promise(r => setTimeout(r, 1500));
  mainWindow?.webContents.send('gateway-status', { running: true, managed: true });
  mainWindow?.webContents.send('openclaw-log-lines', ['[OCT Gateway] 已启动 ✅', '[连接] 正在连接...']);
  if (openclawWs) {
    openclawWs.close();
    openclawWs = null;
  }
  suppressAutoReconnect = false;
  reconnectRetryCount = 0;
  connectOpenClaw();
  return { success: true };
});

ipcMain.handle('gateway-status', async () => {
  const octRunning = !!(octGatewayProcess && !octGatewayProcess.killed);
  const portInUse = await isPortInUse(GATEWAY_PORT);
  return {
    running: octRunning || portInUse,
    managed: octRunning,
    portInUse,
    engine: octRunning ? 'oct-gateway' : portInUse ? 'external' : 'none',
  };
});

ipcMain.handle('get-env', (_, key: string) => process.env[key] || '');

/** 调用 oct-gateway 的工具执行接口（用于保险箱等） */
ipcMain.handle('invoke-gateway-tool', async (_, toolName: string, args: any) => {
  const toolPort = GATEWAY_PORT + 1;
  try {
    const res = await fetch(`http://127.0.0.1:${toolPort}/tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolName, args: args || {} }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '工具执行失败');
    return data.result;
  } catch (e: any) {
    throw new Error(e?.message || 'Gateway 工具调用失败');
  }
});

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

ipcMain.handle('get-agent-permissions', async () => {
  try {
    const { normalizeAgentPermissions, DEFAULT_AGENT_PERMISSIONS } = getOctGatewayConfigAgentPerms();
    ensureConfigFile();
    let cfg: Record<string, any> = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      } catch {}
    }
    const permissions = normalizeAgentPermissions(cfg.AGENT_PERMISSIONS || DEFAULT_AGENT_PERMISSIONS);
    return { success: true, data: permissions };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('save-agent-permissions', async (_, permissions: {
  shellCommands?: boolean;
  fileWrite?: boolean;
  networkRequests?: boolean;
  softwareInstall?: boolean;
  systemConfig?: boolean;
}) => {
  try {
    const { normalizeAgentPermissions, DEFAULT_AGENT_PERMISSIONS } = getOctGatewayConfigAgentPerms();
    ensureConfigFile();
    let cfg: Record<string, any> = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      } catch {}
    }
    cfg.AGENT_PERMISSIONS = normalizeAgentPermissions({
      ...(cfg.AGENT_PERMISSIONS || DEFAULT_AGENT_PERMISSIONS),
      ...(permissions || {}),
    });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    return { success: true, data: cfg.AGENT_PERMISSIONS };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
});

// API Key 配置管理：config.json 优先（与 save-api-keys 写入一致，保证回填）
ipcMain.handle('get-api-keys', async () => {
  try {
    const keys: Record<string, string> = {};
    const envObj: Record<string, string> = {};
    const envFilePath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envFilePath)) {
      const envContent = fs.readFileSync(envFilePath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [k, ...vParts] = trimmed.split('=');
          if (k) envObj[k.trim()] = vParts.join('=').trim();
        }
      }
    }
    // config.json 优先（设置面板保存目标），空则用 .env
    const cfg: Record<string, unknown> = fs.existsSync(CONFIG_FILE)
      ? (() => { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; } })()
      : {};
    const pick = (k: string, cfgVal: unknown, def = '') => {
      const c = (cfgVal ?? '').toString().trim();
      return c || (envObj[k] ?? '').toString().trim() || def;
    };
    keys.OPENCLAW_WS_URL = pick('OPENCLAW_WS_URL', cfg.OPENCLAW_WS_URL, 'ws://127.0.0.1:18789');
    keys.OPENCLAW_TOKEN = pick('OPENCLAW_TOKEN', cfg.OPENCLAW_TOKEN);
    keys.OCT_SETTINGS_MODE = pick('OCT_SETTINGS_MODE', cfg.OCT_SETTINGS_MODE);
    keys.OCT_PROVIDER = pick('OCT_PROVIDER', cfg.OCT_PROVIDER);
    keys.OCT_MODEL = pick('OCT_MODEL', cfg.OCT_MODEL);
    keys.SCRIPT_ADAPTER_REAL_AGENTS = pick('SCRIPT_ADAPTER_REAL_AGENTS', cfg.SCRIPT_ADAPTER_REAL_AGENTS);
    keys.DASHSCOPE_API_KEY = pick('DASHSCOPE_API_KEY', cfg.DASHSCOPE_API_KEY);
    keys.DEEPSEEK_API_KEY = pick('DEEPSEEK_API_KEY', cfg.DEEPSEEK_API_KEY);
    keys.MINIMAX_API_KEY = pick('MINIMAX_API_KEY', cfg.MINIMAX_API_KEY);
    keys.MOONSHOT_API_KEY = pick('MOONSHOT_API_KEY', cfg.MOONSHOT_API_KEY);
    keys.NEWAPI_API_KEY = pick('NEWAPI_API_KEY', cfg.NEWAPI_API_KEY);
    keys.IMAGE_PROVIDER = pick('IMAGE_PROVIDER', cfg.IMAGE_PROVIDER, 'minimax');
    keys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY = pick('IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY', cfg.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY, 'false');
    keys.IMAGE_MINIMAX_API_KEY = pick('IMAGE_MINIMAX_API_KEY', cfg.IMAGE_MINIMAX_API_KEY);
    keys.IMAGE_MINIMAX_BASE_URL = pick('IMAGE_MINIMAX_BASE_URL', cfg.IMAGE_MINIMAX_BASE_URL);
    keys.IMAGE_MINIMAX_MODEL = pick('IMAGE_MINIMAX_MODEL', cfg.IMAGE_MINIMAX_MODEL);
    keys.IMAGE_SILICONFLOW_API_KEY = pick('IMAGE_SILICONFLOW_API_KEY', cfg.IMAGE_SILICONFLOW_API_KEY);
    keys.IMAGE_SILICONFLOW_BASE_URL = pick('IMAGE_SILICONFLOW_BASE_URL', cfg.IMAGE_SILICONFLOW_BASE_URL);
    keys.IMAGE_SILICONFLOW_MODEL = pick('IMAGE_SILICONFLOW_MODEL', cfg.IMAGE_SILICONFLOW_MODEL);
    keys.IMAGE_OPENAI_API_KEY = pick('IMAGE_OPENAI_API_KEY', cfg.IMAGE_OPENAI_API_KEY);
    keys.IMAGE_OPENAI_BASE_URL = pick('IMAGE_OPENAI_BASE_URL', cfg.IMAGE_OPENAI_BASE_URL);
    keys.IMAGE_OPENAI_MODEL = pick('IMAGE_OPENAI_MODEL', cfg.IMAGE_OPENAI_MODEL);
    const imgProvider = (keys.IMAGE_PROVIDER || 'minimax').toLowerCase();
    const providerPrefix = imgProvider === 'siliconflow' ? 'SILICONFLOW' : imgProvider === 'openai' ? 'OPENAI' : 'MINIMAX';
    keys.IMAGE_API_KEY = (
      keys[`IMAGE_${providerPrefix}_API_KEY`]
      || pick('IMAGE_API_KEY', cfg.IMAGE_API_KEY)
    );
    keys.IMAGE_BASE_URL = (
      keys[`IMAGE_${providerPrefix}_BASE_URL`]
      || pick('IMAGE_BASE_URL', cfg.IMAGE_BASE_URL)
    );
    keys.IMAGE_MODEL = (
      keys[`IMAGE_${providerPrefix}_MODEL`]
      || pick('IMAGE_MODEL', cfg.IMAGE_MODEL)
    );
    keys.IMAGE_SIZE = pick('IMAGE_SIZE', cfg.IMAGE_SIZE, '1024x1024');
    keys.TTS_MINIMAX_VOICE_ID = pick('TTS_MINIMAX_VOICE_ID', cfg.TTS_MINIMAX_VOICE_ID, DEFAULT_CONFIG.TTS_MINIMAX_VOICE_ID);
    keys.CUSTOM_API_KEY = pick('CUSTOM_API_KEY', cfg.CUSTOM_API_KEY);
    keys.DASHSCOPE_BASE_URL = pick('DASHSCOPE_BASE_URL', cfg.DASHSCOPE_BASE_URL);
    keys.DEEPSEEK_BASE_URL = pick('DEEPSEEK_BASE_URL', cfg.DEEPSEEK_BASE_URL);
    keys.MINIMAX_BASE_URL = pick('MINIMAX_BASE_URL', cfg.MINIMAX_BASE_URL);
    keys.MOONSHOT_BASE_URL = pick('MOONSHOT_BASE_URL', cfg.MOONSHOT_BASE_URL);
    keys.NEWAPI_BASE_URL = pick('NEWAPI_BASE_URL', cfg.NEWAPI_BASE_URL);
    keys.CUSTOM_BASE_URL = pick('CUSTOM_BASE_URL', cfg.CUSTOM_BASE_URL);
    keys.GOOGLE_AI_API_KEY = pick('GOOGLE_AI_API_KEY', cfg.GOOGLE_AI_API_KEY);
    keys.GOOGLE_AI_BASE_URL = pick('GOOGLE_AI_BASE_URL', cfg.GOOGLE_AI_BASE_URL);
    keys.HTTPS_PROXY = pick('HTTPS_PROXY', cfg.HTTPS_PROXY);
    keys.HTTP_PROXY = pick('HTTP_PROXY', cfg.HTTP_PROXY);
    keys.BRAVE_SEARCH_API_KEY = pick('BRAVE_SEARCH_API_KEY', cfg.BRAVE_SEARCH_API_KEY);
    keys.TAVILY_API_KEY = pick('TAVILY_API_KEY', cfg.TAVILY_API_KEY);
    keys.SILICONFLOW_API_KEY = pick('SILICONFLOW_API_KEY', cfg.SILICONFLOW_API_KEY);
    keys.VISION_API_KEY = pick('VISION_API_KEY', cfg.VISION_API_KEY);
    keys.VISION_BASE_URL = pick('VISION_BASE_URL', cfg.VISION_BASE_URL);
    keys.VISION_MODEL = pick('VISION_MODEL', cfg.VISION_MODEL);
    return {
      success: true,
      data: {
        DASHSCOPE_API_KEY: keys.DASHSCOPE_API_KEY || '',
        DEEPSEEK_API_KEY: keys.DEEPSEEK_API_KEY || '',
        MINIMAX_API_KEY: keys.MINIMAX_API_KEY || '',
        MOONSHOT_API_KEY: keys.MOONSHOT_API_KEY || '',
        NEWAPI_API_KEY: keys.NEWAPI_API_KEY || '',
        IMAGE_PROVIDER: keys.IMAGE_PROVIDER || 'minimax',
        IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: (keys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY || 'false').toLowerCase() === 'true',
        IMAGE_API_KEY: keys.IMAGE_API_KEY || '',
        IMAGE_BASE_URL: keys.IMAGE_BASE_URL || '',
        IMAGE_MODEL: keys.IMAGE_MODEL || '',
        IMAGE_MINIMAX_API_KEY: keys.IMAGE_MINIMAX_API_KEY || '',
        IMAGE_MINIMAX_BASE_URL: keys.IMAGE_MINIMAX_BASE_URL || '',
        IMAGE_MINIMAX_MODEL: keys.IMAGE_MINIMAX_MODEL || '',
        IMAGE_SILICONFLOW_API_KEY: keys.IMAGE_SILICONFLOW_API_KEY || '',
        IMAGE_SILICONFLOW_BASE_URL: keys.IMAGE_SILICONFLOW_BASE_URL || '',
        IMAGE_SILICONFLOW_MODEL: keys.IMAGE_SILICONFLOW_MODEL || '',
        IMAGE_OPENAI_API_KEY: keys.IMAGE_OPENAI_API_KEY || '',
        IMAGE_OPENAI_BASE_URL: keys.IMAGE_OPENAI_BASE_URL || '',
        IMAGE_OPENAI_MODEL: keys.IMAGE_OPENAI_MODEL || '',
        IMAGE_SIZE: keys.IMAGE_SIZE || '1024x1024',
        TTS_MINIMAX_VOICE_ID: keys.TTS_MINIMAX_VOICE_ID || DEFAULT_CONFIG.TTS_MINIMAX_VOICE_ID,
        CUSTOM_API_KEY: keys.CUSTOM_API_KEY || '',
        OPENCLAW_WS_URL: keys.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789',
        OPENCLAW_TOKEN: keys.OPENCLAW_TOKEN || '',
        OCT_SETTINGS_MODE: keys.OCT_SETTINGS_MODE || '',
        OCT_PROVIDER: keys.OCT_PROVIDER || '',
        OCT_MODEL: keys.OCT_MODEL || '',
        SCRIPT_ADAPTER_REAL_AGENTS: keys.SCRIPT_ADAPTER_REAL_AGENTS || '',
        DASHSCOPE_BASE_URL: keys.DASHSCOPE_BASE_URL || '',
        DEEPSEEK_BASE_URL: keys.DEEPSEEK_BASE_URL || '',
        MINIMAX_BASE_URL: keys.MINIMAX_BASE_URL || '',
        MOONSHOT_BASE_URL: keys.MOONSHOT_BASE_URL || '',
        NEWAPI_BASE_URL: keys.NEWAPI_BASE_URL || '',
        CUSTOM_BASE_URL: keys.CUSTOM_BASE_URL || '',
        GOOGLE_AI_API_KEY: keys.GOOGLE_AI_API_KEY || '',
        GOOGLE_AI_BASE_URL: keys.GOOGLE_AI_BASE_URL || '',
        HTTPS_PROXY: keys.HTTPS_PROXY || '',
        HTTP_PROXY: keys.HTTP_PROXY || '',
        BRAVE_SEARCH_API_KEY: keys.BRAVE_SEARCH_API_KEY || '',
        TAVILY_API_KEY: keys.TAVILY_API_KEY || '',
        SILICONFLOW_API_KEY: keys.SILICONFLOW_API_KEY || '',
        VISION_API_KEY: keys.VISION_API_KEY || '',
        VISION_BASE_URL: keys.VISION_BASE_URL || '',
        VISION_MODEL: keys.VISION_MODEL || '',
      }
    };
  } catch (e: any) {
    console.error('[API Keys] Failed to read:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('save-api-keys', async (_, keys: {
    DASHSCOPE_API_KEY?: string;
    DEEPSEEK_API_KEY?: string;
    MINIMAX_API_KEY?: string;
    MOONSHOT_API_KEY?: string;
    NEWAPI_API_KEY?: string;
    IMAGE_PROVIDER?: string;
    IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY?: boolean | string;
    IMAGE_API_KEY?: string;
    IMAGE_BASE_URL?: string;
    IMAGE_MODEL?: string;
    IMAGE_MINIMAX_API_KEY?: string;
    IMAGE_MINIMAX_BASE_URL?: string;
    IMAGE_MINIMAX_MODEL?: string;
    IMAGE_SILICONFLOW_API_KEY?: string;
    IMAGE_SILICONFLOW_BASE_URL?: string;
    IMAGE_SILICONFLOW_MODEL?: string;
    IMAGE_OPENAI_API_KEY?: string;
    IMAGE_OPENAI_BASE_URL?: string;
    IMAGE_OPENAI_MODEL?: string;
    IMAGE_SIZE?: string;
    TTS_MINIMAX_VOICE_ID?: string;
    CUSTOM_API_KEY?: string;
    OPENCLAW_WS_URL?: string;
    OPENCLAW_TOKEN?: string;
    OCT_SETTINGS_MODE?: string;
    OCT_PROVIDER?: string;
    OCT_MODEL?: string;
    SCRIPT_ADAPTER_REAL_AGENTS?: string;
    CUSTOM_MODEL?: string;
    DASHSCOPE_BASE_URL?: string;
    DEEPSEEK_BASE_URL?: string;
    MINIMAX_BASE_URL?: string;
    MOONSHOT_BASE_URL?: string;
    NEWAPI_BASE_URL?: string;
    VISION_API_KEY?: string;
    VISION_BASE_URL?: string;
    VISION_MODEL?: string;
    CUSTOM_BASE_URL?: string;
    GOOGLE_AI_API_KEY?: string;
    GOOGLE_AI_BASE_URL?: string;
    HTTPS_PROXY?: string;
    HTTP_PROXY?: string;
    BRAVE_SEARCH_API_KEY?: string;
    TAVILY_API_KEY?: string;
    SILICONFLOW_API_KEY?: string;
  }) => {
  try {
    // 先写 userData/config.json（主要存储，renderer 读取来源）
    ensureConfigFile();
    let cfg: Record<string, string> = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      } catch {}
    }
    if (keys.OPENCLAW_WS_URL !== undefined) cfg.OPENCLAW_WS_URL = keys.OPENCLAW_WS_URL || '';
    if (keys.OPENCLAW_TOKEN !== undefined) cfg.OPENCLAW_TOKEN = keys.OPENCLAW_TOKEN || '';
    if (keys.OCT_SETTINGS_MODE !== undefined) cfg.OCT_SETTINGS_MODE = keys.OCT_SETTINGS_MODE || '';
    if (keys.DASHSCOPE_API_KEY !== undefined) cfg.DASHSCOPE_API_KEY = keys.DASHSCOPE_API_KEY || '';
    if (keys.DEEPSEEK_API_KEY !== undefined) cfg.DEEPSEEK_API_KEY = keys.DEEPSEEK_API_KEY || '';
    if (keys.MINIMAX_API_KEY !== undefined) cfg.MINIMAX_API_KEY = keys.MINIMAX_API_KEY || '';
    if (keys.MOONSHOT_API_KEY !== undefined) cfg.MOONSHOT_API_KEY = keys.MOONSHOT_API_KEY || '';
    if (keys.NEWAPI_API_KEY !== undefined) cfg.NEWAPI_API_KEY = keys.NEWAPI_API_KEY || '';
    if (keys.IMAGE_PROVIDER !== undefined) cfg.IMAGE_PROVIDER = keys.IMAGE_PROVIDER || 'minimax';
    if (keys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY !== undefined) {
      cfg.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY =
        String(keys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY).toLowerCase() === 'true' ? 'true' : 'false';
    }
    if (keys.IMAGE_API_KEY !== undefined) cfg.IMAGE_API_KEY = keys.IMAGE_API_KEY || '';
    if (keys.IMAGE_BASE_URL !== undefined) cfg.IMAGE_BASE_URL = keys.IMAGE_BASE_URL || '';
    if (keys.IMAGE_MODEL !== undefined) cfg.IMAGE_MODEL = keys.IMAGE_MODEL || '';
    if (keys.IMAGE_MINIMAX_API_KEY !== undefined) cfg.IMAGE_MINIMAX_API_KEY = keys.IMAGE_MINIMAX_API_KEY || '';
    if (keys.IMAGE_MINIMAX_BASE_URL !== undefined) cfg.IMAGE_MINIMAX_BASE_URL = keys.IMAGE_MINIMAX_BASE_URL || '';
    if (keys.IMAGE_MINIMAX_MODEL !== undefined) cfg.IMAGE_MINIMAX_MODEL = keys.IMAGE_MINIMAX_MODEL || '';
    if (keys.IMAGE_SILICONFLOW_API_KEY !== undefined) cfg.IMAGE_SILICONFLOW_API_KEY = keys.IMAGE_SILICONFLOW_API_KEY || '';
    if (keys.IMAGE_SILICONFLOW_BASE_URL !== undefined) cfg.IMAGE_SILICONFLOW_BASE_URL = keys.IMAGE_SILICONFLOW_BASE_URL || '';
    if (keys.IMAGE_SILICONFLOW_MODEL !== undefined) cfg.IMAGE_SILICONFLOW_MODEL = keys.IMAGE_SILICONFLOW_MODEL || '';
    if (keys.IMAGE_OPENAI_API_KEY !== undefined) cfg.IMAGE_OPENAI_API_KEY = keys.IMAGE_OPENAI_API_KEY || '';
    if (keys.IMAGE_OPENAI_BASE_URL !== undefined) cfg.IMAGE_OPENAI_BASE_URL = keys.IMAGE_OPENAI_BASE_URL || '';
    if (keys.IMAGE_OPENAI_MODEL !== undefined) cfg.IMAGE_OPENAI_MODEL = keys.IMAGE_OPENAI_MODEL || '';
    if (keys.IMAGE_SIZE !== undefined) cfg.IMAGE_SIZE = keys.IMAGE_SIZE || '1024x1024';
    if (keys.TTS_MINIMAX_VOICE_ID !== undefined) cfg.TTS_MINIMAX_VOICE_ID = keys.TTS_MINIMAX_VOICE_ID || DEFAULT_CONFIG.TTS_MINIMAX_VOICE_ID;
    if (keys.CUSTOM_API_KEY !== undefined) cfg.CUSTOM_API_KEY = keys.CUSTOM_API_KEY || '';
    if (keys.OCT_PROVIDER !== undefined) cfg.OCT_PROVIDER = keys.OCT_PROVIDER || '';
    if (keys.OCT_MODEL !== undefined) cfg.OCT_MODEL = keys.OCT_MODEL || '';
    if (keys.SCRIPT_ADAPTER_REAL_AGENTS !== undefined) cfg.SCRIPT_ADAPTER_REAL_AGENTS = keys.SCRIPT_ADAPTER_REAL_AGENTS || '';
    if (keys.CUSTOM_MODEL !== undefined) cfg.CUSTOM_MODEL = keys.CUSTOM_MODEL || '';
    if (keys.DASHSCOPE_BASE_URL !== undefined) cfg.DASHSCOPE_BASE_URL = keys.DASHSCOPE_BASE_URL || '';
    if (keys.DEEPSEEK_BASE_URL !== undefined) cfg.DEEPSEEK_BASE_URL = keys.DEEPSEEK_BASE_URL || '';
    if (keys.MINIMAX_BASE_URL !== undefined) cfg.MINIMAX_BASE_URL = keys.MINIMAX_BASE_URL || '';
    if (keys.MOONSHOT_BASE_URL !== undefined) cfg.MOONSHOT_BASE_URL = keys.MOONSHOT_BASE_URL || '';
    if (keys.NEWAPI_BASE_URL !== undefined) cfg.NEWAPI_BASE_URL = keys.NEWAPI_BASE_URL || '';
    if (keys.CUSTOM_BASE_URL !== undefined) cfg.CUSTOM_BASE_URL = keys.CUSTOM_BASE_URL || '';
    if (keys.GOOGLE_AI_API_KEY !== undefined) cfg.GOOGLE_AI_API_KEY = keys.GOOGLE_AI_API_KEY || '';
    if (keys.GOOGLE_AI_BASE_URL !== undefined) cfg.GOOGLE_AI_BASE_URL = keys.GOOGLE_AI_BASE_URL || '';
    if (keys.HTTPS_PROXY !== undefined) cfg.HTTPS_PROXY = keys.HTTPS_PROXY || '';
    if (keys.HTTP_PROXY !== undefined) cfg.HTTP_PROXY = keys.HTTP_PROXY || '';
    if (keys.BRAVE_SEARCH_API_KEY !== undefined) cfg.BRAVE_SEARCH_API_KEY = keys.BRAVE_SEARCH_API_KEY || '';
    if (keys.TAVILY_API_KEY !== undefined) cfg.TAVILY_API_KEY = keys.TAVILY_API_KEY || '';
    if (keys.SILICONFLOW_API_KEY !== undefined) cfg.SILICONFLOW_API_KEY = keys.SILICONFLOW_API_KEY || '';
    if (keys.VISION_API_KEY !== undefined) cfg.VISION_API_KEY = keys.VISION_API_KEY || '';
    if (keys.VISION_BASE_URL !== undefined) cfg.VISION_BASE_URL = keys.VISION_BASE_URL || '';
    if (keys.VISION_MODEL !== undefined) cfg.VISION_MODEL = keys.VISION_MODEL || '';
    Object.assign(cfg, {
      OPENCLAW_WS_URL: cfg.OPENCLAW_WS_URL ?? DEFAULT_CONFIG.OPENCLAW_WS_URL,
      OPENCLAW_TOKEN: cfg.OPENCLAW_TOKEN ?? '',
    });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');

    // 验证回读
    let verified: Record<string, string> = {};
    try {
      verified = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {}
    const expectBrave = (keys.BRAVE_SEARCH_API_KEY || '').trim();
    const expectTavily = (keys.TAVILY_API_KEY || '').trim();
    if (expectBrave && !(verified.BRAVE_SEARCH_API_KEY || '').trim()) {
      return { success: false, error: 'Brave Search API Key 保存验证失败，请重试' };
    }
    if (expectTavily && !(verified.TAVILY_API_KEY || '').trim()) {
      return { success: false, error: 'Tavily API Key 保存验证失败，请重试' };
    }

    loadOpenClawConfig();
    suppressAutoReconnect = true;
    clearReconnectTimer();
    if (openclawWs) {
      openclawWs.close();
      openclawWs = null;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    mainWindow?.webContents.send('openclaw-log-lines', ['[连接] 保存配置完成，检查 Gateway...']);
    // AI 配置或搜索引擎 Key 变更需重启 Gateway 才能生效
    const aiConfigChanged = keys.OCT_PROVIDER !== undefined || keys.OCT_MODEL !== undefined
      || keys.SCRIPT_ADAPTER_REAL_AGENTS !== undefined
      || keys.OPENCLAW_TOKEN !== undefined
      || keys.CUSTOM_MODEL !== undefined
      || keys.DASHSCOPE_BASE_URL !== undefined || keys.DEEPSEEK_BASE_URL !== undefined
      || keys.MINIMAX_BASE_URL !== undefined
      || keys.IMAGE_PROVIDER !== undefined || keys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY !== undefined
      || keys.IMAGE_API_KEY !== undefined || keys.IMAGE_BASE_URL !== undefined || keys.IMAGE_MODEL !== undefined
      || keys.IMAGE_MINIMAX_API_KEY !== undefined || keys.IMAGE_MINIMAX_BASE_URL !== undefined || keys.IMAGE_MINIMAX_MODEL !== undefined
      || keys.IMAGE_SILICONFLOW_API_KEY !== undefined || keys.IMAGE_SILICONFLOW_BASE_URL !== undefined || keys.IMAGE_SILICONFLOW_MODEL !== undefined
      || keys.IMAGE_OPENAI_API_KEY !== undefined || keys.IMAGE_OPENAI_BASE_URL !== undefined || keys.IMAGE_OPENAI_MODEL !== undefined
      || keys.IMAGE_SIZE !== undefined
      || keys.CUSTOM_BASE_URL !== undefined
      || keys.DASHSCOPE_API_KEY !== undefined || keys.DEEPSEEK_API_KEY !== undefined
      || keys.MINIMAX_API_KEY !== undefined
      || keys.NEWAPI_API_KEY !== undefined || keys.NEWAPI_BASE_URL !== undefined
      || keys.CUSTOM_API_KEY !== undefined
      || keys.GOOGLE_AI_API_KEY !== undefined || keys.GOOGLE_AI_BASE_URL !== undefined
      || keys.HTTPS_PROXY !== undefined || keys.HTTP_PROXY !== undefined
      || keys.BRAVE_SEARCH_API_KEY !== undefined || keys.TAVILY_API_KEY !== undefined
      || keys.VISION_API_KEY !== undefined
      || keys.VISION_BASE_URL !== undefined
      || keys.VISION_MODEL !== undefined
      || keys.SILICONFLOW_API_KEY !== undefined;
    if (aiConfigChanged && octGatewayProcess && !octGatewayProcess.killed) {
      expectOctGatewayProcessExit = true;
      octGatewayProcess.kill();
      octGatewayProcess = null;
      mainWindow?.webContents.send('openclaw-log-lines', ['[系统] AI 配置已更新，正在重启 Gateway...']);
      await waitForPortRelease(GATEWAY_PORT, 5000);
      await new Promise(r => setTimeout(r, 500));
    }
    const inUse = await isPortInUse(GATEWAY_PORT);
    if (!inUse) {
      mainWindow?.webContents.send('openclaw-log-lines', ['[系统] 端口 18789 空闲，正在自动启动 OCT Gateway...']);
      const octEntry = getOctGatewayEntry();
      if (octEntry) {
        const octResult = await startOctGateway();
        if (octResult.success) {
          mainWindow?.webContents.send('openclaw-log-lines', ['[OCT Gateway] 已自动启动', '[连接] 1.5s 后发起连接']);
          mainWindow?.webContents.send('gateway-status', { running: true, managed: true });
          await new Promise(r => setTimeout(r, 1500));
        } else {
          mainWindow?.webContents.send('openclaw-log-lines', [`[系统] Gateway 启动失败: ${octResult.error}`]);
        }
      } else {
        mainWindow?.webContents.send('openclaw-log-lines', ['[系统] 未找到 oct-gateway，请手动启动 Gateway']);
      }
    } else {
      mainWindow?.webContents.send('openclaw-log-lines', ['[系统] 端口 18789 已占用，直接连接']);
    }
    suppressAutoReconnect = false;
    reconnectRetryCount = 0;
    connectOpenClaw();
    
    return { success: true };
  } catch (e: any) {
    suppressAutoReconnect = false;
    console.error('[API Keys] Failed to save:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-persona-settings', async () => {
  try {
    ensureConfigFile();
    const cfg: Record<string, string> = fs.existsSync(CONFIG_FILE)
      ? (() => { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; } })()
      : {};
    return {
      success: true,
      data: {
        OCT_AI_NAME: (cfg.OCT_AI_NAME || DEFAULT_CONFIG.OCT_AI_NAME).toString(),
        OCT_USER_NAME: (cfg.OCT_USER_NAME || DEFAULT_CONFIG.OCT_USER_NAME).toString(),
        OCT_PERSONA_STYLE: (cfg.OCT_PERSONA_STYLE || DEFAULT_CONFIG.OCT_PERSONA_STYLE).toString(),
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('save-persona-settings', async (_, payload: {
  OCT_AI_NAME?: string;
  OCT_USER_NAME?: string;
  OCT_PERSONA_STYLE?: string;
}) => {
  try {
    ensureConfigFile();
    let cfg: Record<string, string> = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      } catch {}
    }

    const normalizeName = (value: string | undefined, fallback: string, maxLen: number) => {
      const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
      return (trimmed || fallback).slice(0, maxLen);
    };
    const normalizeStyle = (value: string | undefined) => {
      const trimmed = String(value || '').trim();
      return ['neutral', 'warm', 'companion'].includes(trimmed) ? trimmed : DEFAULT_CONFIG.OCT_PERSONA_STYLE;
    };

    cfg.OCT_AI_NAME = normalizeName(payload.OCT_AI_NAME, DEFAULT_CONFIG.OCT_AI_NAME, 24);
    cfg.OCT_USER_NAME = normalizeName(payload.OCT_USER_NAME, DEFAULT_CONFIG.OCT_USER_NAME, 24);
    cfg.OCT_PERSONA_STYLE = normalizeStyle(payload.OCT_PERSONA_STYLE);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
});

// 本地视觉模型（BLIP）已移除，以下 IPC 保留空壳以兼容旧版前端调用
ipcMain.handle('get-local-vision-status', async () => ({ success: true, status: 'not_downloaded', enabled: false, downloaded: false, message: '本地视觉功能已移除，请使用「图片理解 API」配置。' }));
ipcMain.handle('save-local-vision-settings', async () => ({ success: true }));
ipcMain.handle('download-local-vision-model', async () => ({ success: false, status: 'error', downloaded: false, message: '本地视觉功能已移除，请使用「图片理解 API」配置。', error: '功能已移除' }));

// Provider 列表（供 Settings UI 服务商选择器使用）
ipcMain.handle('get-provider-list', async () => {
  try {
    const gatewayDir = path.dirname(getOctGatewayEntry() || path.join(__dirname, '..', 'oct-gateway', 'index.js'));
    const providersPath = path.join(gatewayDir, 'providers.js');
    if (!fs.existsSync(providersPath)) {
      return { success: true, error: '', data: getFallbackProviders() };
    }
    const { PROVIDERS } = require(providersPath);
    return { success: true, data: PROVIDERS };
  } catch (e: any) {
    console.error('[get-provider-list]', e.message);
    return { success: true, error: e.message, data: getFallbackProviders() };
  }
});

// 测试 AI 连接（用当前配置发一个简单请求，可传入 formConfig 覆盖已保存配置）
ipcMain.handle('test-ai-connection', async (_, formConfig?: Record<string, string>) => {
  try {
    let cfg: Record<string, string> = readAppConfig();
    if (formConfig && typeof formConfig === 'object') {
      cfg = { ...cfg, ...formConfig };
    }
    const gatewayDir = path.dirname(getOctGatewayEntry() || path.join(__dirname, '..', 'oct-gateway', 'index.js'));
    const providersPath = path.join(gatewayDir, 'providers.js');
    const { PROVIDERS } = fs.existsSync(providersPath) ? require(providersPath) : { PROVIDERS: getFallbackProviders() };
    const providerId =
      (cfg.OCT_PROVIDER && String(cfg.OCT_PROVIDER).trim())
      || (
        (cfg.CUSTOM_BASE_URL || cfg.CUSTOM_API_KEY || cfg.CUSTOM_MODEL)
          ? 'custom'
          : ((cfg.DASHSCOPE_BASE_URL || '').includes('coding.dashscope') ? 'bailian-coding' : 'bailian')
      );
    const provider = (PROVIDERS as Record<string, any>)[providerId] || (PROVIDERS as Record<string, any>)['bailian-coding'];
    const baseUrl =
      providerId === 'deepseek' ? (cfg.DEEPSEEK_BASE_URL || provider?.baseUrl || '')
      : providerId === 'minimax' ? (cfg.MINIMAX_BASE_URL || provider?.baseUrl || '')
      : providerId === 'moonshot' ? (cfg.MOONSHOT_BASE_URL || provider?.baseUrl || '')
      : providerId === 'newapi' ? (cfg.NEWAPI_BASE_URL || provider?.baseUrl || '')
      : providerId === 'custom' ? (cfg.CUSTOM_BASE_URL || provider?.baseUrl || '')
      : providerId === 'google' ? (cfg.GOOGLE_AI_BASE_URL || provider?.baseUrl || '')
      : (cfg.DASHSCOPE_BASE_URL || provider?.baseUrl || '');
    const apiKey =
      providerId === 'deepseek' ? (cfg.DEEPSEEK_API_KEY || '')
      : providerId === 'minimax' ? (cfg.MINIMAX_API_KEY || '')
      : providerId === 'moonshot' ? (cfg.MOONSHOT_API_KEY || '')
      : providerId === 'newapi' ? (cfg.NEWAPI_API_KEY || '')
      : providerId === 'custom' ? (cfg.CUSTOM_API_KEY || '')
      : providerId === 'google' ? (cfg.GOOGLE_AI_API_KEY || '')
      : (cfg.DASHSCOPE_API_KEY || '');
    const model = providerId === 'newapi' && cfg.OCT_MODEL === '__custom__' && cfg.CUSTOM_MODEL
      ? cfg.CUSTOM_MODEL
      : (cfg.OCT_MODEL || provider?.defaultModel || 'qwen3.5-plus');
    if (!baseUrl || !apiKey) {
      return { success: false, error: '请先填写 API Key 并选择服务商' };
    }
    if (providerId === 'google') {
      const googleApiMode = String(cfg.GOOGLE_API_MODE || 'native').trim().toLowerCase();
      if (googleApiMode !== 'openai_compat') {
        const googleNativePath = path.join(gatewayDir, 'services', 'googleNative.js');
        const googleNative = fs.existsSync(googleNativePath) ? require(googleNativePath) : null;
        if (!googleNative?.resolveGoogleClientConfig || !googleNative?.sanitizeGoogleModelId) {
          return { success: false, error: 'Google 原生 SDK 未就绪，请重启应用后重试。' };
        }
        const clientConfig = googleNative.resolveGoogleClientConfig({
          GOOGLE_AI_API_KEY: apiKey,
          GOOGLE_AI_BASE_URL: baseUrl,
          GOOGLE_API_MODE: googleApiMode,
          GOOGLE_CLOUD_PROJECT: cfg.GOOGLE_CLOUD_PROJECT || '',
          GOOGLE_CLOUD_LOCATION: cfg.GOOGLE_CLOUD_LOCATION || '',
          GOOGLE_GENAI_API_VERSION: cfg.GOOGLE_GENAI_API_VERSION || '',
        });
        const normalizedModel = googleNative.sanitizeGoogleModelId(model);
        const response = await clientConfig.client.models.generateContent({
          model: normalizedModel,
          contents: 'hi',
        });
        if (!response?.text && !response?.data && !response?.functionCalls) {
          return { success: false, error: 'Google 原生连接未返回可识别内容，请检查模型和配额。' };
        }
        return { success: true, message: 'Google 原生连接成功' };
      }
    }
    const fetchBaseUrl =
      providerId === 'google' ? getGoogleBaseUrlHelper().sanitizeGoogleOpenAiBaseUrl(baseUrl) : baseUrl;
    if (providerId === 'minimax' && !String(apiKey).trim().startsWith('sk-cp-')) {
      return {
        success: false,
        error: 'MiniMax 现在需要 Token Plan 专属 API Key（通常以 sk-cp- 开头），普通按量计费 Key 不能直接用于 M2.7。',
      };
    }
    if (providerId === 'moonshot' && String(apiKey).trim().startsWith('sk-sp-')) {
      return {
        success: false,
        error: 'Kimi 官方直连接口需要 MOONSHOT_API_KEY，不能复用阿里云百炼 Coding Plan 的 sk-sp- Key。请在 Kimi 开放平台生成独立 Key。',
      };
    }
    const testHeaders: Record<string, string> =
      providerId === 'google'
        ? { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
    const res = await fetch(`${fetchBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const errText = await res.text();
      if (providerId === 'minimax' && (res.status === 401 || res.status === 403)) {
        return {
          success: false,
          error: `MiniMax 鉴权失败（${res.status}）。请确认你填写的是 Token Plan API Key（sk-cp-...），并且套餐当前包含 ${model} 的权限。`,
        };
      }
      return { success: false, error: `API 返回 ${res.status}: ${errText.slice(0, 200)}` };
    }
    return { success: true, message: '连接成功' };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
});

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

ipcMain.handle('openclaw-send', (_, payload: string | {
  content: string;
  imageDataUrl?: string | null;
  files?: UploadedFile[];
  pacingMs?: number;
  workbenchContext?: any;
  canvasContext?: any;
  requestId?: string;
  projectContext?: any;
}) => {
  let content: string;
  let imageDataUrl: string | null | undefined;
  let files: UploadedFile[] | undefined;
  let pacingMs: number | undefined;
  let workbenchContext: any;
  let requestId: string | undefined;
  let projectContext: any;

  if (typeof payload === 'string') {
    content = payload;
    imageDataUrl = null;
    files = undefined;
    pacingMs = undefined;
    workbenchContext = undefined;
    requestId = undefined;
    projectContext = undefined;
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
    files = undefined;
    pacingMs = undefined;
    workbenchContext = undefined;
    requestId = undefined;
    projectContext = undefined;
  }

  return sendChatMessage(content, imageDataUrl, files, pacingMs, workbenchContext, requestId, projectContext);
});

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

ipcMain.handle('script-adapter-run-start', (_event, payload: {
  taskId: string;
  taskTitle: string;
  source?: string;
  useMock?: boolean;
  sourceText?: string;
  config?: Record<string, unknown>;
}) => {
  const taskId = String(payload?.taskId || `script-adapter-${Date.now()}`);
  return sendScriptAdapterRunRequest('scriptAdapter.run.start', {
    taskId,
    taskTitle: String(payload?.taskTitle || '多人演播有声书样章'),
    source: String(payload?.source || 'content-workbench'),
    useMock: payload?.useMock !== false,
    sourceText: String(payload?.sourceText || ''),
    config: payload?.config || {},
  });
});

ipcMain.handle('script-adapter-run-cancel', (_event, payload: { taskId: string; reason?: string }) => {
  return sendScriptAdapterRunRequest('scriptAdapter.run.cancel', {
    taskId: String(payload?.taskId || ''),
    reason: String(payload?.reason || 'cancelled_by_user'),
  });
});

ipcMain.handle('script-adapter-run-list', () => {
  return sendScriptAdapterRunRequest('scriptAdapter.run.list', {});
});

ipcMain.handle('script-adapter-intake-start', (_event, payload: Record<string, unknown>) => {
  return sendScriptAdapterRunRequest('scriptAdapter.intake.start', payload || {});
});

ipcMain.handle('script-adapter-analysis-start', (_event, payload: Record<string, unknown>) => {
  return sendScriptAdapterRunRequest('scriptAdapter.analysis.start', payload || {});
});

ipcMain.handle('script-adapter-production-handoff', (_event, payload: Record<string, unknown>) => {
  return sendScriptAdapterRunRequest('scriptAdapter.production.handoff', payload || {});
});

ipcMain.handle('script-adapter-batch-start', (_event, payload: {
  bookId: string;
  chapterIndices: number[];
  bookTitle?: string;
  config?: Record<string, unknown>;
  estimate?: Record<string, unknown>;
}) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.start', {
    bookId: String(payload?.bookId || ''),
    chapterIndices: Array.isArray(payload?.chapterIndices) ? payload.chapterIndices : [],
    bookTitle: payload?.bookTitle ? String(payload.bookTitle) : undefined,
    config: payload?.config || {},
    estimate: payload?.estimate || {},
  });
});

ipcMain.handle('script-adapter-batch-status', (_event, payload: { batchId: string }) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.status', {
    batchId: String(payload?.batchId || ''),
  });
});

ipcMain.handle('script-adapter-batch-list', (_event, payload: { limit?: number; offset?: number } | undefined) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.list', {
    limit: Number(payload?.limit) > 0 ? Math.floor(Number(payload?.limit)) : 20,
    offset: Number(payload?.offset) >= 0 ? Math.floor(Number(payload?.offset)) : 0,
  });
});

ipcMain.handle('script-adapter-batch-cancel', (_event, payload: { batchId: string }) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.cancel', {
    batchId: String(payload?.batchId || ''),
  });
});

ipcMain.handle('script-adapter-batch-subscribe', (_event, batchId: string) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.subscribe', {
    batchId: String(batchId || ''),
  });
});

ipcMain.handle('script-adapter-batch-approve-gate', (_event, payload: { batchId: string; gateId: string; reviewerNote?: string }) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.approveGate', payload || {});
});

ipcMain.handle('script-adapter-batch-reject-gate', (_event, payload: { batchId: string; gateId: string; reviewerNote?: string }) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.rejectGate', payload || {});
});

ipcMain.handle('script-adapter-batch-rerun', (_event, payload: { batchId: string; chapterIndex: number }) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.rerunChapter', {
    batchId: String(payload?.batchId || ''),
    chapterIndex: Number(payload?.chapterIndex),
  });
});

ipcMain.handle('script-adapter-batch-delete', (_event, payload: { batchId: string }) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.delete', {
    batchId: String(payload?.batchId || ''),
  });
});

// ── AI.library 书库 Phase 2：Electron 原生实现（不经 Python）────────────────
ipcMain.handle('library:list', async (_event, payload: { limit?: number; offset?: number }) => {
  const limit = Number(payload?.limit) > 0 ? Math.floor(Number(payload.limit)) : 50;
  const offset = Number(payload?.offset) >= 0 ? Math.floor(Number(payload.offset)) : 0;
  try {
    const books = listNativeLibraryBooks(limit, offset);
    return { success: true, data: { success: true, books, total: books.length } };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `LIBRARY_LIST_FAILED: ${msg}` };
  }
});

ipcMain.handle('library:get', async (_event, payload: { bookId: string }) => {
  if (!payload?.bookId) return { success: false, error: 'bookId required' };
  try {
    const book = getNativeLibraryBook(payload.bookId);
    if (!book) return { success: false, error: `Book ${payload.bookId} not found` };
    return { success: true, data: { success: true, book } };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `LIBRARY_GET_FAILED: ${msg}` };
  }
});

ipcMain.handle('library:chapters', async (_event, payload: { bookId: string }) => {
  if (!payload?.bookId) return { success: false, error: 'bookId required' };
  try {
    const book = getNativeLibraryBook(payload.bookId);
    if (!book) return { success: false, error: `Book ${payload.bookId} not found` };
    return {
      success: true,
      data: { success: true, book_id: payload.bookId, chapters: listNativeLibraryChapters(payload.bookId) },
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `LIBRARY_CHAPTERS_FAILED: ${msg}` };
  }
});

ipcMain.handle('library:chapter', async (_event, payload: { bookId: string; chapterIndex: number }) => {
  if (!payload?.bookId) return { success: false, error: 'bookId required' };
  if (typeof payload?.chapterIndex !== 'number' || Number.isNaN(payload.chapterIndex)) {
    return { success: false, error: 'chapterIndex required' };
  }
  try {
    const data = getNativeLibraryChapterText(payload.bookId, payload.chapterIndex);
    if (!data) return { success: false, error: `Chapter ${payload.chapterIndex} not found in book ${payload.bookId}` };
    return { success: true, data: { success: true, book_id: payload.bookId, ...data } };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `LIBRARY_CHAPTER_FAILED: ${msg}` };
  }
});

ipcMain.handle('library:pickFile', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择小说文件',
      filters: [
        { name: '文本文件', extensions: ['txt', 'md'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' };
    }
    return { success: true, filePath: result.filePaths[0] };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `PICK_FILE_FAILED: ${msg}` };
  }
});

ipcMain.handle('library:upload', async (_event, payload: {
  filePath: string;
  title: string;
  author?: string;
}) => {
  const filePath = String(payload?.filePath || '').trim();
  const title = String(payload?.title || '').trim();
  const author = String(payload?.author || '').trim();

  if (!filePath) return { success: false, error: 'filePath required' };
  if (!title) return { success: false, error: 'title required' };

  try {
    const data = await uploadNativeLibraryBook({ filePath, title, author });
    return { success: true, data };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `UPLOAD_FAILED: ${msg}` };
  }
});

ipcMain.handle('library:delete', async (_event, payload: { bookId: string }) => {
  if (!payload?.bookId) return { success: false, error: 'bookId required' };
  try {
    const deleted = deleteNativeLibraryBook(payload.bookId);
    if (!deleted) return { success: false, error: `Book ${payload.bookId} not found` };
    return { success: true, data: { success: true, deleted: payload.bookId } };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `LIBRARY_DELETE_FAILED: ${msg}` };
  }
});

ipcMain.handle('delivery:exportMarkdown', async (_event, payload: { filename: string; content: string }) => {
  try {
    const result = await dialog.showSaveDialog({
      title: '保存交付包',
      defaultPath: String(payload?.filename || 'delivery.md'),
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return { success: false, error: 'cancelled' };
    }
    await fs.promises.writeFile(result.filePath, String(payload?.content || ''), 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `WRITE_FAILED: ${msg}` };
  }
});

ipcMain.handle('delivery:exportDocx', async (_event, payload: {
  filename: string;
  documentTitle: string;
  data: any;
}) => {
  try {
    const result = await dialog.showSaveDialog({
      title: '保存 Word 交付包',
      defaultPath: String(payload?.filename || 'delivery.docx'),
      filters: [
        { name: 'Word', extensions: ['docx'] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return { success: false, error: 'cancelled' };
    }

    const docxModule = await import('docx');
    const {
      AlignmentType,
      BorderStyle,
      Document,
      HeadingLevel,
      Packer,
      Paragraph,
      Table,
      TableCell,
      TableRow,
      TextRun,
      WidthType,
    } = docxModule;
    const sections = Array.isArray(payload?.data?.sections) ? payload.data.sections : [];
    const metadata = Array.isArray(payload?.data?.metadata) ? payload.data.metadata : [];
    const children: any[] = [];

    children.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: String(payload?.documentTitle || '多人演播交付包'), bold: true })],
    }));

    for (const item of metadata) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${String(item?.label || '')}：`, bold: true }),
          new TextRun(String(item?.value || '')),
        ],
      }));
    }

    children.push(new Paragraph({ text: '' }));

    for (const section of sections) {
      children.push(new Paragraph({
        heading: section.level === 1 ? HeadingLevel.HEADING_1 : section.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        children: [new TextRun(String(section.title || ''))],
      }));

      for (const block of Array.isArray(section.blocks) ? section.blocks : []) {
        if (block.type === 'paragraph') {
          children.push(new Paragraph(String(block.text || '')));
          continue;
        }
        if (block.type === 'scriptLine') {
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `[${String(block.speaker || '旁白')}] `, bold: true }),
              new TextRun(String(block.text || '')),
            ],
          }));
          if (block.note) {
            children.push(new Paragraph({
              children: [new TextRun({ text: `改编说明：${String(block.note)}`, italics: true })],
            }));
          }
          continue;
        }
        if (block.type === 'bullet') {
          for (const item of Array.isArray(block.items) ? block.items : []) {
            children.push(new Paragraph({
              text: String(item || ''),
              bullet: { level: 0 },
            }));
          }
          continue;
        }
        if (block.type === 'table') {
          const rows = [];
          rows.push(new TableRow({
            children: (Array.isArray(block.columns) ? block.columns : []).map((column: string) => new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(column || ''), bold: true })] })],
            })),
          }));
          for (const row of Array.isArray(block.rows) ? block.rows : []) {
            rows.push(new TableRow({
              children: row.map((cell: string) => new TableCell({
                children: [new Paragraph(String(cell || ''))],
              })),
            }));
          }
          children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'D9DDE3' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D9DDE3' },
              left: { style: BorderStyle.SINGLE, size: 1, color: 'D9DDE3' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'D9DDE3' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E6E9EF' },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E6E9EF' },
            },
          }));
        }
      }

      children.push(new Paragraph({ text: '' }));
    }

    const document = new Document({
      sections: [{ properties: {}, children }],
    });
    const buffer = await Packer.toBuffer(document);
    await fs.promises.writeFile(result.filePath, buffer);
    return { success: true, filePath: result.filePath };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `DOCX_WRITE_FAILED: ${msg}` };
  }
});

ipcMain.handle('image-generate', async (_event, payload: {
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
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
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

ipcMain.handle('open-external-url', async (_event, url: string) => {
  const target = String(url || '').trim();
  if (!target) return { success: false, error: 'URL 不能为空' };
  await shell.openExternal(target);
  return { success: true };
});

ipcMain.handle('download-image', async (_event, payload: { url: string; suggestedName?: string }) => {
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
    const saveResult = mainWindow
      ? await dialog.showSaveDialog(mainWindow, saveOptions)
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

ipcMain.handle('openclaw-status', () => {
  return {
    connected: openclawWs?.readyState === WebSocket.OPEN,
    sessionKey: currentSessionKey,
    model: currentGatewayModel,
    capabilities: currentGatewayCapabilities,
  };
});

ipcMain.handle('show-notification', (_, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

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

ipcMain.handle('tts-speak', async (_, payload: { text: string; providerPreference?: 'auto' | 'browser' | 'dashscope' | 'minimax' }) => {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  const providerPreference = payload?.providerPreference || 'auto';
  if (!text) {
    return { success: false, error: 'TTS text is empty' };
  }

  const cfg = readAppConfig();
  const dashscopeApiKey = String(cfg.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
  const minimaxApiKey = String(cfg.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY || '').trim();
  const minimaxVoiceId = String(cfg.TTS_MINIMAX_VOICE_ID || 'male-qn-qingse').trim() || 'male-qn-qingse';
  const dashscopeBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const { wsBase: minimaxWsUrl } = getMiniMaxEndpoints(cfg);
  const currentProviderId = String(cfg.OCT_PROVIDER || '').trim();

  const providers: Array<'minimax' | 'dashscope'> =
    providerPreference === 'browser' ? []
    : providerPreference === 'minimax' ? ['minimax']
    : providerPreference === 'dashscope' ? ['dashscope']
    : currentProviderId === 'minimax' ? ['minimax']
    : currentProviderId === 'bailian' || currentProviderId === 'bailian-coding' ? ['dashscope']
    : [];

  const errors: string[] = [];

  for (const provider of providers) {
    try {
      if (provider === 'minimax') {
        if (!minimaxApiKey) {
          errors.push('MiniMax API Key not configured');
          continue;
        }
        pushUiLog(`[MiniMax TTS] start provider=MiniMax model=speech-2.8-hd voice=${minimaxVoiceId} chars=${text.length}`);
        try {
          const audioBuffer = await synthesizeMiniMaxViaWebSocket({
            wsUrl: minimaxWsUrl,
            apiKey: minimaxApiKey,
            text,
            voiceId: minimaxVoiceId,
          });
          pushUiLog(`[MiniMax TTS] success provider=MiniMax model=speech-2.8-hd voice=${minimaxVoiceId} chars=${text.length} bytes=${audioBuffer.length}`);
          return {
            success: true,
            provider: 'minimax',
            audioBase64: audioBuffer.toString('base64'),
            mimeType: 'audio/mpeg',
          };
        } catch (err: any) {
          pushUiLog(`[MiniMax TTS][ERR] ${err?.message || 'unknown error'}`);
          errors.push(`MiniMax WebSocket TTS failed: ${err?.message || 'unknown error'}`);
          if (providerPreference === 'minimax') {
            break;
          }
          continue;
        }
      }

      if (!dashscopeApiKey) {
        errors.push('DashScope API Key not configured');
        continue;
      }
      pushUiLog(`[DashScope TTS] start provider=DashScope voice=longxiaochun chars=${text.length}`);
      const res = await fetch(`${dashscopeBaseUrl.replace(/\/$/, '')}/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${dashscopeApiKey}`,
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
        pushUiLog(`[DashScope TTS][ERR] ${res.status} ${errText.slice(0, 160)}`);
        errors.push(`DashScope TTS API error ${res.status}: ${errText}`);
        continue;
      }
      const buf = await res.arrayBuffer();
      pushUiLog(`[DashScope TTS] success provider=DashScope voice=longxiaochun chars=${text.length} bytes=${buf.byteLength}`);
      return {
        success: true,
        provider: 'dashscope',
        audioBase64: Buffer.from(buf).toString('base64'),
        mimeType: 'audio/mpeg',
      };
    } catch (e: any) {
      errors.push(`${provider} TTS request failed: ${e?.message || 'unknown error'}`);
    }
  }

  return { success: false, error: errors.join(' | ') || (providerPreference === 'browser' ? 'Browser TTS handled in renderer' : 'No matching cloud TTS capability for current provider') };
});

ipcMain.handle('music-history-load', async () => {
  try {
    const history = readMusicHistory();
    const clips = history.flatMap((item) => {
      const filePath = path.join(MUSIC_STUDIO_DIR, item.filename);
      if (!fs.existsSync(filePath)) return [];
      return [{ ...item, filePath }];
    });
    return { success: true, clips };
  } catch (e: any) {
    return { success: false, error: e?.message || '音乐历史读取失败', clips: [] };
  }
});

ipcMain.handle('music-history-delete', async (_, id: string) => {
  try {
    const history = readMusicHistory();
    const item = history.find((h) => h.id === id);
    if (item) {
      const filePath = path.join(MUSIC_STUDIO_DIR, item.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    writeMusicHistory(history.filter((h) => h.id !== id));
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || '删除失败' };
  }
});

ipcMain.handle('music-generate', async (_, payload: {
  title?: string;
  model?: string;
  prompt?: string;
  lyrics?: string;
  instrumental?: boolean;
  lyricsOptimizer?: boolean;
  sampleRate?: number;
  bitrate?: number;
  format?: 'mp3' | 'wav';
}) => {
  const cfg = readAppConfig();
  const apiKey = String(cfg.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY || '').trim();
  const baseUrl = String(cfg.MINIMAX_BASE_URL || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1').trim().replace(/\/$/, '');
  const model = String(payload?.model || 'music-2.6').trim() || 'music-2.6';
  const title = String(payload?.title || '').trim();
  const prompt = String(payload?.prompt || '').trim();
  const lyrics = String(payload?.lyrics || '').trim();
  const instrumental = !!payload?.instrumental;
  const lyricsOptimizer = !!payload?.lyricsOptimizer;
  const sampleRate = Number(payload?.sampleRate) || 44100;
  const bitrate = Number(payload?.bitrate) || 256000;
  const format = payload?.format === 'wav' ? 'wav' : 'mp3';

  if (!apiKey) {
    return { success: false, error: 'MiniMax API Key 未配置，请先在设置中填写 Token Plan API Key。' };
  }
  if (!prompt) {
    return { success: false, error: '请先填写音乐描述。' };
  }
  if (!instrumental && !lyrics && !lyricsOptimizer) {
    return { success: false, error: '当前是人声歌曲模式，请填写歌词，或开启“自动生成歌词”。' };
  }

  pushUiLog(`[MiniMax Music] start model=${model} instrumental=${instrumental} lyricsOptimizer=${lyricsOptimizer} promptChars=${prompt.length} lyricsChars=${lyrics.length}`);

  try {
    const res = await fetch(`${baseUrl}/music_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        lyrics,
        lyrics_optimizer: lyricsOptimizer,
        is_instrumental: instrumental,
        output_format: 'hex',
        audio_setting: {
          sample_rate: sampleRate,
          bitrate,
          format,
        },
      }),
      signal: AbortSignal.timeout(240000),
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const errMsg = data?.base_resp?.status_msg || text || `HTTP ${res.status}`;
      pushUiLog(`[MiniMax Music][ERR] ${res.status} ${String(errMsg).slice(0, 200)}`);
      return { success: false, error: `MiniMax Music API 返回 ${res.status}: ${String(errMsg).slice(0, 300)}` };
    }

    const audioHex = String(data?.data?.audio || '').trim();
    if (!audioHex) {
      const statusMsg = data?.base_resp?.status_msg || '未返回音频数据';
      pushUiLog(`[MiniMax Music][ERR] empty audio payload msg=${String(statusMsg).slice(0, 160)}`);
      return { success: false, error: `MiniMax Music 未返回音频数据：${statusMsg}` };
    }

    const audioBuffer = Buffer.from(audioHex, 'hex');
    const musicDuration = Number(data?.extra_info?.music_duration) || 0;
    const musicSampleRate = Number(data?.extra_info?.music_sample_rate) || sampleRate;
    const musicBitrate = Number(data?.extra_info?.bitrate) || bitrate;
    const musicSize = Number(data?.extra_info?.music_size) || audioBuffer.length;
    const traceId = String(data?.trace_id || '').trim();
    const clipId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const filename = `${clipId}.${format === 'wav' ? 'wav' : 'mp3'}`;

    persistMusicClip({
      id: clipId,
      title: title || `track_${clipId}`,
      prompt,
      lyrics,
      instrumental,
      model,
      traceId,
      durationMs: musicDuration,
      sampleRate: musicSampleRate,
      bitrate: musicBitrate,
      sizeBytes: musicSize,
      mimeType,
      filename,
      createdAt: Date.now(),
    }, audioBuffer);

    pushUiLog(`[MiniMax Music] success model=${model} durationMs=${musicDuration} bytes=${audioBuffer.length} trace=${traceId || 'n/a'}`);

    return {
      success: true,
      clipId,
      filePath: path.join(MUSIC_STUDIO_DIR, filename),
      mimeType,
      model,
      traceId,
      durationMs: musicDuration,
      sampleRate: musicSampleRate,
      bitrate: musicBitrate,
      sizeBytes: musicSize,
    };
  } catch (e: any) {
    pushUiLog(`[MiniMax Music][ERR] ${e?.message || String(e)}`);
    return { success: false, error: e?.message || 'MiniMax Music 请求失败' };
  }
});

ipcMain.handle('lyrics-generate', async (_, payload: {
  prompt?: string;
  title?: string;
}) => {
  const cfg = readAppConfig();
  const apiKey = String(cfg.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY || '').trim();
  const baseUrl = String(cfg.MINIMAX_BASE_URL || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1').trim().replace(/\/$/, '');
  const prompt = String(payload?.prompt || '').trim();
  const title = String(payload?.title || '').trim();

  if (!apiKey) {
    return { success: false, error: 'MiniMax API Key 未配置，请先在设置中填写 Token Plan API Key。' };
  }

  pushUiLog(`[MiniMax Lyrics] start promptChars=${prompt.length} titleChars=${title.length}`);

  try {
    const res = await fetch(`${baseUrl}/lyrics_generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        mode: 'write_full_song',
        prompt,
        ...(title ? { title } : {}),
      }),
      signal: AbortSignal.timeout(120000),
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const errMsg = data?.base_resp?.status_msg || text || `HTTP ${res.status}`;
      pushUiLog(`[MiniMax Lyrics][ERR] ${res.status} ${String(errMsg).slice(0, 200)}`);
      return { success: false, error: `MiniMax Lyrics API 返回 ${res.status}: ${String(errMsg).slice(0, 300)}` };
    }

    const generatedLyrics = String(data?.lyrics || '').trim();
    const songTitle = String(data?.song_title || title || '').trim();
    const styleTags = String(data?.style_tags || '').trim();

    if (!generatedLyrics) {
      const statusMsg = data?.base_resp?.status_msg || '未返回歌词';
      pushUiLog(`[MiniMax Lyrics][ERR] empty lyrics msg=${String(statusMsg).slice(0, 160)}`);
      return { success: false, error: `MiniMax Lyrics 未返回歌词：${statusMsg}` };
    }

    pushUiLog(`[MiniMax Lyrics] success title=${songTitle || 'n/a'} styleTagsChars=${styleTags.length} lyricsChars=${generatedLyrics.length}`);
    return {
      success: true,
      title: songTitle,
      styleTags,
      lyrics: generatedLyrics,
    };
  } catch (e: any) {
    pushUiLog(`[MiniMax Lyrics][ERR] ${e?.message || String(e)}`);
    return { success: false, error: e?.message || 'MiniMax Lyrics 请求失败' };
  }
});

app.whenReady().then(async () => {
  loadOpenClawConfig();
  const loaded = loadSessionState();
  if (loaded?.sessionKey) currentSessionKey = loaded.sessionKey;

  // 1. 先创建窗口（显示界面，但不连接）
  createWindow();

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

ipcMain.handle('get-screenshot-shortcut', () => {
  return loadClawConfig().screenshotShortcut;
});

ipcMain.handle('set-screenshot-shortcut', (_, shortcut: string) => {
  const s = typeof shortcut === 'string' ? shortcut.trim() : 'Alt+A';
  saveClawConfig({ screenshotShortcut: s });
  registerScreenshotShortcut(s);
  return { success: true };
});

app.on('will-quit', async () => {
  appQuitting = true;
  globalShortcut.unregisterAll();
  
  // 停止所有子进程并清理端口
  if (octGatewayProcess && !octGatewayProcess.killed) {
    expectOctGatewayProcessExit = true;
    try { octGatewayProcess.kill('SIGTERM'); } catch {}
    octGatewayProcess = null;
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    try { gatewayProcess.kill('SIGTERM'); } catch {}
    gatewayProcess = null;
  }
  if (aiLibraryProcess && !aiLibraryProcess.killed) {
    try { aiLibraryProcess.kill('SIGTERM'); } catch {}
    aiLibraryProcess = null;
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
    expectOctGatewayProcessExit = true;
    try { octGatewayProcess.kill('SIGTERM'); } catch {}
    octGatewayProcess = null;
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    try { gatewayProcess.kill('SIGTERM'); } catch {}
    gatewayProcess = null;
  }
  if (aiLibraryProcess && !aiLibraryProcess.killed) {
    try { aiLibraryProcess.kill('SIGTERM'); } catch {}
    aiLibraryProcess = null;
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

ipcMain.handle('tasks-read', async () => {
  const filePath = path.join(app.getPath('userData'), 'tasks.json');
  try {
    console.log('[TasksLocal] tasks-read filePath:', filePath);
  } catch {}
  if (!fs.existsSync(filePath)) {
    return { tasks: [], parking: [], intention: '', updatedAt: '' };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const dedupedTasks = dedupeTaskItems(raw.tasks || []);
  try {
    console.log('[TasksLocal] tasks-read counts:', {
      tasks: Array.isArray(raw?.tasks) ? raw.tasks.length : 0,
      dedupedTasks: dedupedTasks.length,
      parking: Array.isArray(raw?.parking) ? raw.parking.length : 0,
      updatedAt: raw?.updatedAt || '',
    });
  } catch {}
  return {
    tasks: dedupedTasks,
    parking: raw.parking || [],
    intention: raw.intention || '',
    updatedAt: raw.updatedAt || '',
  };
});

/** 写入任务数据（全量覆盖） */
ipcMain.handle('tasks-write', async (_: Electron.IpcMainInvokeEvent, data: { tasks: TaskItem[]; parking: any[]; intention?: string }) => {
  const filePath = path.join(app.getPath('userData'), 'tasks.json');
  const payload = {
    tasks: dedupeTaskItems(data.tasks || []),
    parking: data.parking || [],
    intention: data.intention || '',
    updatedAt: new Date().toISOString(),
  };
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  mainWindow?.webContents.send('task-board-update');
  mainWindow?.webContents.executeJavaScript('window.dispatchEvent(new Event("tasks-updated"))').catch(() => {});
  return { ok: true };
});

/** 添加任务 */
ipcMain.handle('tasks-add', async (_, { content, priority, source }: {
  content: string;
  priority: 'p0' | 'p1' | 'p2';
  source: 'amy' | 'user';
}) => {
  const data = loadTasksData();
  const duplicate = (data.tasks || []).find(t => !t.done && isLikelyDuplicateTaskContent(t.content, content));
  if (duplicate) {
    return { ok: true, taskId: duplicate.id, deduped: true };
  }
  const newTask: TaskItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content: content.trim(),
    priority,
    done: false,
    source,
    createdAt: new Date().toISOString(),
  };
  data.tasks.push(newTask);
  if (saveTasksData(data)) {
    // 通知前端刷新
    mainWindow?.webContents.send('task-board-update');
    mainWindow?.webContents.executeJavaScript(
      'window.dispatchEvent(new Event("tasks-updated"))'
    ).catch(() => {});
    return { ok: true, taskId: newTask.id };
  }
  return { ok: false, error: '保存失败' };
});

/** 更新任务（完成状态/内容/优先级） */
ipcMain.handle('tasks-update', async (_, { taskId, updates }: {
  taskId: string;
  updates: Partial<Pick<TaskItem, 'done' | 'content' | 'priority'>>;
}) => {
  const data = loadTasksData();
  const idx = data.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return { ok: false, error: '任务不存在' };
  
  data.tasks[idx] = { ...data.tasks[idx], ...updates };
  if (saveTasksData(data)) {
    mainWindow?.webContents.send('task-board-update');
    return { ok: true };
  }
  return { ok: false, error: '保存失败' };
});

/** 删除任务 */
ipcMain.handle('tasks-delete', async (_, { taskId }: { taskId: string }) => {
  const data = loadTasksData();
  const originalLen = data.tasks.length;
  data.tasks = data.tasks.filter(t => t.id !== taskId);
  if (data.tasks.length === originalLen) {
    return { ok: false, error: '任务不存在' };
  }
  if (saveTasksData(data)) {
    mainWindow?.webContents.send('task-board-update');
    return { ok: true };
  }
  return { ok: false, error: '保存失败' };
});

/** 清空已完成任务 */
ipcMain.handle('tasks-clear-completed', async () => {
  const data = loadTasksData();
  const completedCount = data.tasks.filter(t => t.done).length;
  data.tasks = data.tasks.filter(t => !t.done);
  if (saveTasksData(data)) {
    mainWindow?.webContents.send('task-board-update');
    return { ok: true, cleared: completedCount };
  }
  return { ok: false, error: '保存失败' };
});

/** 设置今日意图 */
ipcMain.handle('tasks-set-intention', async (_, { intention }: { intention: string }) => {
  const data = loadTasksData();
  data.intention = intention;
  if (saveTasksData(data)) {
    return { ok: true };
  }
  return { ok: false, error: '保存失败' };
});

/** 添加到停车场 */
ipcMain.handle('tasks-parking-add', async (_, { content }: { content: string }) => {
  const data = loadTasksData();
  const newItem: TaskItem = {
    id: `${Date.now()}`,
    content: content.trim(),
    priority: 'p2',
    done: false,
    source: 'amy',
    createdAt: new Date().toISOString(),
  };
  data.parking.push(newItem);
  if (saveTasksData(data)) {
    return { ok: true, itemId: newItem.id };
  }
  return { ok: false, error: '保存失败' };
});

/** 从停车场移除 */
ipcMain.handle('tasks-parking-remove', async (_, { itemId }: { itemId: string }) => {
  const data = loadTasksData();
  data.parking = data.parking.filter(p => p.id !== itemId);
  if (saveTasksData(data)) {
    return { ok: true };
  }
  return { ok: false, error: '保存失败' };
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
