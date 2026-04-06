// Load .env file
import * as dotenv from 'dotenv';
import * as path from 'path';
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { app, BrowserWindow, ipcMain, Notification, dialog, screen, globalShortcut, shell } from 'electron';
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
/** 应用/主窗口正在关闭，避免 WebSocket 断开回调里向已销毁的窗口 send 导致报错 */
let appQuitting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastSessionState: { messages?: any[]; sessionKey?: string } | null = null;
let currentSessionKey: string = 'main';
const SESSION_STATE_FILE = path.join(app.getPath('userData'), 'session-state.json');
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_CONFIG = {
  OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
  OPENCLAW_TOKEN: '',
  OCT_AI_NAME: 'OpenClaw',
  OCT_USER_NAME: '用户',
  OCT_PERSONA_STYLE: 'warm',
  TTS_MINIMAX_VOICE_ID: 'male-qn-qingse',
  /** 随 OCT 启动 AI.library（知识库 HTTP 服务，默认端口 8001，与 Nocturne :8000 错开） */
  OCT_AI_LIBRARY_AUTO_START: false,
  OCT_AI_LIBRARY_PATH: '',
  OCT_AI_LIBRARY_PORT: 8001,
  /** SQLite busy_timeout(ms)，缓解 database is locked，默认 10000，可设为 5000~60000 */
  NOCTURNE_BUSY_TIMEOUT: 10000,
};

// （已移除授权码机制，公开发布版无需激活）

// Gateway 进程管理
const GATEWAY_PORT = 18789;
/** AI.library 插件默认 HTTP 端口（勿与 Nocturne 8000 冲突） */
const AI_LIBRARY_DEFAULT_PORT = 8001;

// 获取 Nocturne Memory 路径（打包后 resources/nocturne_memory，开发时项目 resources/nocturne_memory）
function getNocturnePath(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'nocturne_memory'),
    path.join(__dirname, '..', 'resources', 'nocturne_memory'),
    path.join(__dirname, '..', '..', 'resources', 'nocturne_memory'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

// 获取 Nocturne 预编译 exe 路径（PyInstaller 打包，无需 Python）
// 打包后位于 resources/nocturne_server/nocturne_server.exe
function getNocturneExePath(): string {
  const exeName = process.platform === 'win32' ? 'nocturne_server.exe' : 'nocturne_server';
  const candidates = [
    path.join(process.resourcesPath || '', 'nocturne_server', exeName),
    path.join(__dirname, '..', 'resources', 'nocturne_server', exeName),
    path.join(__dirname, '..', '..', 'resources', 'nocturne_server', exeName),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

// 获取 Nocturne MCP Server 脚本绝对路径
function getNocturneMcpPath(): string {
  const base = getNocturnePath();
  return base ? path.join(base, 'backend', 'mcp_server.py') : '';
}

// 获取用于运行 Nocturne 的 Python 可执行路径（需 3.10+）
// 返回 [executable, ...extraArgs] 以便 spawn 正确拆分
function getPythonForNocturne(): string[] {
  const { execSync } = require('child_process');
  const cmds: string[][] = process.platform === 'win32'
    ? [['py', '-3'], ['python']]
    : [['python3'], ['python']];
  for (const parts of cmds) {
    try {
      const v = execSync(`${parts.join(' ')} --version`, { encoding: 'utf8', timeout: 3000 });
      const m = v.match(/Python 3\.(\d+)/);
      if (m && parseInt(m[1], 10) >= 10) return parts;
      if (!m) return parts;
    } catch {
      continue;
    }
  }
  return process.platform === 'win32' ? ['py', '-3'] : ['python3'];
}

// 确保 Nocturne 的 .env 存在（DATABASE_URL 指向 userData）
// 同时写入 nocturne_memory/.env 与 backend/.env，保证 uvicorn cwd=backend 时能加载到
function ensureNocturneEnv(): void {
  const base = getNocturnePath();
  if (!base) return;
  const rootEnvPath = path.join(base, '.env');
  if (fs.existsSync(rootEnvPath)) return;
  const userDataDir = app.getPath('userData');
  try {
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
  } catch {}
  const dbPath = path.join(userDataDir, 'nocturne_memory.db');
  const dbUrl = `sqlite+aiosqlite:///${dbPath.replace(/\\/g, '/')}`;
  const envContent = `# OCT + Nocturne Memory - auto-generated
DATABASE_URL=${dbUrl}
VALID_DOMAINS=core,writer,notes,system

# 热记忆（L1）：每次 system://boot 自动加载
# 按优先级排列：AI 身份 → 用户信息（发布版不含个人记忆路径，用户可自行添加）
CORE_MEMORY_URIS=core://agent/identity,core://agent/principles,core://my_user,core://my_user/profile,core://agent/my_user
`;
  const envPaths = [rootEnvPath, path.join(base, 'backend', '.env')];
  for (const envPath of envPaths) {
    try {
      const dir = path.dirname(envPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(envPath, envContent, 'utf-8');
      console.log('[Nocturne] .env ready:', envPath);
    } catch (e) {
      console.warn('[Nocturne] Failed to write .env at', envPath, e);
    }
  }
}

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
      OPENCLAW_TOKEN = typeof data.OPENCLAW_TOKEN === 'string' ? (data.OPENCLAW_TOKEN || '').trim() : '';
    } catch (e) {
      console.warn('[Config] Failed to load config.json:', e);
    }
  } else if (fs.existsSync(envPath)) {
    OPENCLAW_WS_URL = (process.env.OPENCLAW_WS_URL || '').trim() || DEFAULT_CONFIG.OPENCLAW_WS_URL;
    OPENCLAW_TOKEN = (process.env.OPENCLAW_TOKEN || '').trim();
  } else {
    ensureConfigFile();
    OPENCLAW_WS_URL = DEFAULT_CONFIG.OPENCLAW_WS_URL;
    OPENCLAW_TOKEN = DEFAULT_CONFIG.OPENCLAW_TOKEN;
  }
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

// ── AI.library 插件（与 Nocturne :8000 错开，默认 :8001）────────────────
let aiLibraryProcess: ReturnType<typeof spawn> | null = null;
let octAiLibraryAutoStart = false;
let octAiLibraryPath = '';
let octAiLibraryPort = AI_LIBRARY_DEFAULT_PORT;
/** 注入子进程 Gateway 的 AI_LIBRARY_URL；空则让 oct-gateway 用自身默认 */
let resolvedAiLibraryUrlForGateway = '';

function syncAiLibraryPluginConfigFromDisk(): void {
  octAiLibraryAutoStart = false;
  octAiLibraryPath = '';
  octAiLibraryPort = AI_LIBRARY_DEFAULT_PORT;

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (data.OCT_AI_LIBRARY_AUTO_START === true) octAiLibraryAutoStart = true;
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
  } else if (octAiLibraryAutoStart && octAiLibraryPath) {
    resolvedAiLibraryUrlForGateway = `http://127.0.0.1:${octAiLibraryPort}`;
  } else {
    resolvedAiLibraryUrlForGateway = '';
  }
}

function getAiLibraryPythonCommand(root: string): { cmd: string; args: string[] } {
  const winVenv = path.join(root, 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(winVenv)) return { cmd: winVenv, args: ['api_server.py'] };
  const unixVenv = path.join(root, 'venv', 'bin', 'python3');
  if (fs.existsSync(unixVenv)) return { cmd: unixVenv, args: ['api_server.py'] };
  const py = getPythonForNocturne();
  return { cmd: py[0], args: [...py.slice(1), 'api_server.py'] };
}

/** OCT 托管启动 AI.library；端口已占用时视为已运行 */
async function startAiLibraryBackend(): Promise<boolean> {
  syncAiLibraryPluginConfigFromDisk();
  if (!octAiLibraryAutoStart) {
    return false;
  }
  if (!octAiLibraryPath) {
    console.warn('[AI.library] 已启用自动启动但未配置 OCT_AI_LIBRARY_PATH');
    mainWindow?.webContents.send('openclaw-log-lines', ['[AI.library] 请在设置中填写知识库目录路径']);
    return false;
  }

  const root = path.resolve(octAiLibraryPath.replace(/^["']|["']$/g, ''));
  if (!fs.existsSync(path.join(root, 'api_server.py'))) {
    console.warn('[AI.library] 目录无效（缺少 api_server.py）:', root);
    mainWindow?.webContents.send('openclaw-log-lines', [`[AI.library] 路径无效: ${root}`]);
    return false;
  }

  if (aiLibraryProcess && !aiLibraryProcess.killed) return true;

  if (await isPortInUse(octAiLibraryPort)) {
    console.log('[AI.library] 端口', octAiLibraryPort, '已占用，跳过启动（可能已在运行）');
    mainWindow?.webContents.send('openclaw-log-lines', [`[AI.library] 端口 ${octAiLibraryPort} 已在使用，跳过启动`]);
    return true;
  }

  const { cmd, args } = getAiLibraryPythonCommand(root);
  console.log('[AI.library] 启动:', cmd, args.join(' '), 'cwd=', root);
  aiLibraryProcess = spawn(cmd, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: false,
    env: {
      ...process.env,
      API_HOST: '0.0.0.0',
      API_PORT: String(octAiLibraryPort),
      PYTHONIOENCODING: 'utf-8',
    },
  });

  aiLibraryProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log('[AI.library]', msg);
  });
  aiLibraryProcess.on('exit', (code) => {
    console.log('[AI.library] 进程退出 code:', code);
    aiLibraryProcess = null;
  });
  aiLibraryProcess.on('error', (err) => {
    console.error('[AI.library] 启动失败:', err.message);
    aiLibraryProcess = null;
  });

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${octAiLibraryPort}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        console.log('[AI.library] 已就绪 http://127.0.0.1:' + octAiLibraryPort);
        mainWindow?.webContents.send('openclaw-log-lines', [
          `[AI.library] 知识库服务已启动 ✅ http://127.0.0.1:${octAiLibraryPort}`,
        ]);
        return true;
      }
    } catch {
      /* retry */
    }
  }
  console.warn('[AI.library] 启动超时，请检查 api_server 日志');
  mainWindow?.webContents.send('openclaw-log-lines', ['[AI.library] 启动超时，对话仍可继续（检索将静默跳过）']);
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
      octGatewayProcess.kill();
      octGatewayProcess = null;
      await new Promise(r => setTimeout(r, 500));
    }
    if (nocturneBackendProcess && !nocturneBackendProcess.killed) {
      nocturneBackendProcess.kill();
      nocturneBackendProcess = null;
    }
    mainWindow = null;
    floatWindow?.close();
    floatWindow = null;
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

/** 将连接/系统信息写入 Gateway 日志区，便于排查错误 */
function sendConnLog(line: string) {
  if (!line.trim() || appQuitting) return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('openclaw-log-lines', [`[连接] ${line.trim()}`]);
}

function connectOpenClaw() {
  if (openclawWs?.readyState === WebSocket.OPEN) return;

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
  const scheduleReconnect = () => {
    if (closeHandled || appQuitting) return;
    closeHandled = true;
    clearHeartbeat();
    openclawWs = null;
    if (!mainWindow) return;
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    reconnectRetryCount++;
    if (reconnectRetryCount <= MAX_RECONNECT_RETRIES) {
      const delay = Math.min(5000 * Math.pow(2, reconnectRetryCount - 1), 60000);
      sendStatus({ connected: false, reconnecting: true });
      sendConnLog(`${delay / 1000} 秒后重连`);
      setTimeout(connectOpenClaw, delay);
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
    scheduleReconnect();
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
    scheduleReconnect();
  });
}

function sendStatus(status: { connected: boolean; error?: string; model?: string; reconnecting?: boolean }) {
  if (appQuitting) return;
  if (status.connected) reconnectRetryCount = 0;
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
  if (usage?.session) {
    currentSessionKey = usage.session;
    saveSessionState({ ...(lastSessionState || {}), sessionKey: usage.session });
  }
  // 斜杠命令的系统回复：payload 直接有 text，无 message.content
  const isSystemReply = !!(payload?.text && typeof payload.text === 'string' && !payload?.message?.content);
  
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
      if (msg.ok && (msg.payload?.type === 'hello-ok' || msg.method === 'connect')) {
        const model = msg.payload?.model || msg.payload?.agent?.model || undefined;
        console.log('[OCT] Connection successful!');
        sendConnLog(`认证成功，已连接 (model: ${model || '—'})`);
        sendStatus({ connected: true, model });
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
  const token = process.env.OCT_GATEWAY_TOKEN || '';
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
  canvasContext?: any
): { success: boolean; error?: string } {
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'WebSocket not connected' };
  }

  const message = typeof content === 'string' ? content : String(content ?? '');
  if (!imageDataUrl && (!files || files.length === 0) && (!message || typeof message !== 'string' || message.trim() === '')) {
    console.warn('[OCT] 消息为空，跳过发送');
    return { success: false, error: '消息不能为空' };
  }

  const reqId = generateId();
  const idempotencyKey = crypto.randomUUID();

  // OpenClaw chat.send: message 必须是字符串，图片放入 attachments；sessionKey 一致则 Gateway 在同一会话内回复
  const finalMessage = message.trim() || (imageDataUrl || (files && files.length > 0) ? '[文件/图片]' : '');
  const params: { sessionKey: string; idempotencyKey: string; message: string; attachments?: any[]; pacingMs?: number; canvasContext?: any } = {
    sessionKey: currentSessionKey,
    idempotencyKey,
    message: finalMessage,
    pacingMs,
  };
  if (canvasContext) params.canvasContext = canvasContext;

  // OpenClaw chat.send attachments: Gateway normalizeRpcAttachmentsToChatAttachments 期望 { type, mimeType, content }
  const attachments: Array<{ type: string; mimeType: string; fileName?: string; content: string }> = [];

  // 1. 粘贴/截图图片 (imageDataUrl)
  if (imageDataUrl) {
    const matches = imageDataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp|bmp));base64,(.+)$/);
    if (matches) {
      const [, mimeType, base64Data] = matches;
      attachments.push({ type: 'image', mimeType: mimeType!, content: base64Data });
    }
  }

  // 2. 附件中的图片转为 base64 后加入（Gateway 仅处理 image/*，非图片暂不传）
  if (files && files.length > 0) {
    for (const f of files) {
      const base64Data = f.base64;
      const mimeType = f.mimeType || 'application/octet-stream';
      if (!base64Data) continue;
      if (mimeType.startsWith('image/')) {
        attachments.push({ type: 'image', mimeType, fileName: f.name, content: base64Data });
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

      // 只传元数据，不读文件内容。图片需 base64 供 vision 使用，其余由 AMY 用 read_file 按需读取
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
    path.join(__dirname, '..', 'oct-gateway', 'index.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
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

  const promptsDir = path.join(__dirname, '..', 'docs', '01_system_prompts');
  const tasksPath = path.join(app.getPath('userData'), 'tasks.json');
  const vaultPath = path.join(app.getPath('userData'), 'vault.enc');

  try {
    octGatewayProcess = spawn('node', [entry], {
      cwd: path.dirname(entry),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
      env: {
        ...process.env,
        OCT_GATEWAY_PORT: String(GATEWAY_PORT),
        OCT_PROMPTS_DIR: promptsDir,
        OCT_CONFIG_FILE: CONFIG_FILE,
        OPENCLAW_TASKS_PATH: tasksPath,
        OCT_VAULT_PATH: vaultPath,
        ...(resolvedAiLibraryUrlForGateway && !(process.env.AI_LIBRARY_URL || '').trim()
          ? { AI_LIBRARY_URL: resolvedAiLibraryUrlForGateway }
          : {}),
      },
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
    octGatewayProcess.on('exit', (code) => {
      console.log('[OCT Gateway] 退出，code:', code);
      octGatewayProcess = null;
      if (mainWindow && !mainWindow.isDestroyed() && !appQuitting) {
        mainWindow.webContents.send('gateway-status', { running: false, managed: false });
      }
    });

    console.log('[OCT Gateway] 已启动，PID:', octGatewayProcess.pid);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

// Nocturne Memory 集成
ipcMain.handle('get-nocturne-status', async () => {
  const base = getNocturnePath();
  const available = !!base;
  let backendAlive = false;
  let frontendAlive = false;
  let domains: Array<{ domain: string }> = [];
  let coreMemoryUris: string[] = [];
  if (base) {
    try {
      const envPath = path.join(base, '.env');
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const m = envContent.match(/CORE_MEMORY_URIS=(.+)/);
      if (m) coreMemoryUris = m[1]!.split(',').map((s: string) => s.trim()).filter(Boolean);
    } catch {}
    backendAlive = await isPortInUse(8000);
    frontendAlive = await isPortInUse(3000);
    if (backendAlive) {
      try {
        const res = await fetch('http://127.0.0.1:8000/browse/domains', { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) domains = data;
          else if (data?.data && Array.isArray(data.data)) domains = data.data;
        }
      } catch {}
    }
  }
  return {
    available,
    path: base || '',
    backendAlive,
    frontendAlive,
    domains,
    coreMemoryUris,
  };
});
ipcMain.handle('open-nocturne-management', () => {
  shell.openExternal('http://localhost:3000');
  return { success: true };
});
ipcMain.handle('restart-nocturne-backend', async () => {
  if (nocturneBackendProcess && !nocturneBackendProcess.killed) {
    nocturneBackendProcess.kill();
    nocturneBackendProcess = null;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const ok = await startNocturneBackend();
  return { success: ok };
});

// AI.library 插件（随 OCT 启动知识库 HTTP，默认 :8001，与 Nocturne :8000 错开）
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
  const managed = !!(aiLibraryProcess && !aiLibraryProcess.killed);
  const portInUse = await isPortInUse(octAiLibraryPort);
  return {
    success: true,
    data: {
      OCT_AI_LIBRARY_AUTO_START: octAiLibraryAutoStart,
      OCT_AI_LIBRARY_PATH: octAiLibraryPath,
      OCT_AI_LIBRARY_PORT: octAiLibraryPort,
      resolvedGatewayUrl: resolvedAiLibraryUrlForGateway,
      managed,
      portInUse,
      healthy,
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

ipcMain.handle('seed-nocturne-memories', async (): Promise<{ success: boolean; error?: string; output?: string }> => {
  const base = getNocturnePath();
  if (!base) return { success: false, error: 'Nocturne 未找到' };
  const scriptPath = path.join(base, 'backend', 'scripts', 'seed_oct_memories.py');
  if (!fs.existsSync(scriptPath)) return { success: false, error: 'seed 脚本未找到' };
  const { execSync } = require('child_process');
  const pythonCmd = getPythonForNocturne().join(' ');
  try {
    const cwd = path.join(base, 'backend');
    const cfg: Record<string, string> = fs.existsSync(CONFIG_FILE)
      ? (() => { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; } })()
      : {};
    const out = execSync(`${pythonCmd} -m scripts.seed_oct_memories`, {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
      env: {
        ...process.env,
        PYTHONPATH: cwd,
        PYTHONIOENCODING: 'utf-8',
        OCT_AI_NAME: (cfg.OCT_AI_NAME || DEFAULT_CONFIG.OCT_AI_NAME).toString(),
        OCT_USER_NAME: (cfg.OCT_USER_NAME || DEFAULT_CONFIG.OCT_USER_NAME).toString(),
      },
    });
    return { success: true, output: out };
  } catch (e: any) {
    const msg = e?.stderr || e?.stdout || e?.message || String(e);
    return { success: false, error: msg || '执行失败' };
  }
});
ipcMain.handle('setup-nocturne-memory', async (): Promise<{ success: boolean; error?: string }> => {
  const base = getNocturnePath();
  if (!base) return { success: false, error: 'Nocturne 未找到' };
  const reqPath = path.join(base, 'backend', 'requirements.txt');
  if (!fs.existsSync(reqPath)) return { success: false, error: 'requirements.txt 未找到' };
  const { execSync } = require('child_process');
  const pythonCmd = getPythonForNocturne().join(' ');
  try {
    execSync(`${pythonCmd} -m pip install -r "${reqPath}"`, {
      cwd: path.join(base, 'backend'),
      encoding: 'utf8',
      timeout: 120000,
      stdio: 'pipe',
    });
    ensureNocturneEnv();
    return { success: true };
  } catch (e: any) {
    const msg = e?.stderr || e?.message || String(e);
    return { success: false, error: msg || 'pip 安装失败，请确保已安装 Python' };
  }
});

// Nocturne 进程管理
let nocturneBackendProcess: ReturnType<typeof spawn> | null = null;
let nocturneFrontendProcess: ReturnType<typeof spawn> | null = null;

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

async function startNocturneBackend(): Promise<boolean> {
  if (nocturneBackendProcess && !nocturneBackendProcess.killed) return true;

  const portInUse = await isPortInUse(8000);
  if (portInUse) {
    console.log('[Nocturne] 端口 8000 已被占用，跳过启动');
    return true;
  }

  let nocturneBusyTimeout = String(
    process.env.NOCTURNE_BUSY_TIMEOUT ||
    (() => {
      try {
        if (fs.existsSync(CONFIG_FILE)) {
          const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
          if (cfg.NOCTURNE_BUSY_TIMEOUT != null) return cfg.NOCTURNE_BUSY_TIMEOUT;
        }
      } catch {}
      return DEFAULT_CONFIG.NOCTURNE_BUSY_TIMEOUT ?? 10000;
    })()
  );

  const userDataDir = app.getPath('userData');
  const dbPath = path.join(userDataDir, 'nocturne_memory.db');
  const dbUrl = `sqlite+aiosqlite:///${dbPath.replace(/\\/g, '/')}`;

  // 优先使用预编译 exe（打包后无需 Python）
  const exePath = getNocturneExePath();
  if (exePath) {
    const exeDir = path.dirname(exePath);
    console.log('[Nocturne] 使用预编译 exe:', exePath);
    nocturneBackendProcess = spawn(exePath, [], {
      cwd: exeDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        CORE_MEMORY_URIS: 'core://agent/identity,core://agent/principles,core://my_user,core://my_user/profile,core://agent/my_user',
        VALID_DOMAINS: 'core,writer,notes,system',
        NOCTURNE_BUSY_TIMEOUT: nocturneBusyTimeout,
        PYTHONIOENCODING: 'utf-8',
      },
    });
  } else {
    // 回退：使用 Python 运行（开发环境）
    const base = getNocturnePath();
    if (!base) {
      console.warn('[Nocturne] 未找到 nocturne_memory 目录或 nocturne_server.exe，跳过自动启动');
      return false;
    }
    ensureNocturneEnv();
    const [pyExe, ...pyArgs] = getPythonForNocturne();
    const backendPath = path.join(base, 'backend');
    nocturneBackendProcess = spawn(pyExe, [...pyArgs, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: backendPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        NOCTURNE_BUSY_TIMEOUT: nocturneBusyTimeout,
        PYTHONPATH: backendPath,
        PYTHONIOENCODING: 'utf-8',
      },
    });
  }

  // Nocturne stderr 持久化到 userData，便于排查 DB 锁等问题
  const nocturneLogPath = path.join(userDataDir, 'nocturne_stderr.log');
  let nocturneStderrStream: fs.WriteStream | null = null;
  try {
    nocturneStderrStream = fs.createWriteStream(nocturneLogPath, { flags: 'a' });
    nocturneStderrStream.write(`\n--- Nocturne 启动 ${new Date().toISOString()} ---\n`);
  } catch (e) {
    console.warn('[Nocturne] 无法创建日志文件:', nocturneLogPath, (e as Error)?.message);
  }
  nocturneBackendProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) {
      console.log('[Nocturne]', msg);
      nocturneStderrStream?.write(`[${new Date().toISOString()}] ${msg}\n`, (err) => {
        if (err) console.warn('[Nocturne] 写入日志失败:', (err as Error)?.message);
      });
    }
  });
  nocturneBackendProcess.on('exit', (code) => {
    nocturneStderrStream?.end();
    nocturneStderrStream = null;
    console.log('[Nocturne] 后端退出，code:', code);
    nocturneBackendProcess = null;
    if (mainWindow && !mainWindow.isDestroyed() && !appQuitting) {
      mainWindow.webContents.send('nocturne-status', { backendAlive: false });
    }
  });
  nocturneBackendProcess.on('error', (err) => {
    console.error('[Nocturne] 启动失败:', err.message);
    nocturneBackendProcess = null;
    if (mainWindow && !mainWindow.isDestroyed() && !appQuitting) {
      mainWindow.webContents.send('nocturne-status', { backendAlive: false, error: err.message });
    }
  });

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isPortInUse(8000)) break;
  }
  if (!(await isPortInUse(8000))) {
    console.warn('[Nocturne] 端口 8000 未就绪，启动超时');
    return false;
  }

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        console.log('[Nocturne] 后端已就绪 port 8000 + DB 健康');
        mainWindow?.webContents.send('openclaw-log-lines', ['[Nocturne] 记忆系统已启动 ✅']);
        return true;
      }
    } catch {}
  }
  console.warn('[Nocturne] /health 未返回 200，可能数据库未连接');
  mainWindow?.webContents.send('openclaw-log-lines', ['[Nocturne] 端口已监听，若仍显示不可用请点「重启 Nocturne 后端」']);
  return true;
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

ipcMain.handle('start-nocturne-dashboard', async (): Promise<{ success: boolean; error?: string; backendUrl?: string; frontendUrl?: string }> => {
  const base = getNocturnePath();
  if (!base) return { success: false, error: 'Nocturne 未找到' };

  const frontendPath = path.join(base, 'frontend');

  // 后端已经在 startNocturneBackend() 里启动了，直接检查
  const backendAlive = await isPortInUse(8000);
  if (!backendAlive) {
    await startNocturneBackend();
    await new Promise((r) => setTimeout(r, 3000));
  }

  // 启动前端（如果还没跑）
  const frontendAlive = await isPortInUse(3000);
  if (!frontendAlive && fs.existsSync(path.join(frontendPath, 'package.json'))) {
    if (!nocturneFrontendProcess || nocturneFrontendProcess.killed) {
      nocturneFrontendProcess = spawn('npm', ['run', 'dev'], {
        cwd: frontendPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: false,
        shell: true,
      });
      nocturneFrontendProcess.on('exit', () => {
        nocturneFrontendProcess = null;
      });

      // 等待前端就绪，最多 15 秒
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isPortInUse(3000)) break;
      }
    }
  }

  shell.openExternal('http://localhost:3000');

  return {
    success: true,
    backendUrl: 'http://localhost:8000',
    frontendUrl: 'http://localhost:3000',
  };
});

ipcMain.handle('stop-nocturne-dashboard', () => {
  if (nocturneBackendProcess && !nocturneBackendProcess.killed) {
    nocturneBackendProcess.kill();
    nocturneBackendProcess = null;
  }
  if (nocturneFrontendProcess && !nocturneFrontendProcess.killed) {
    nocturneFrontendProcess.kill();
    nocturneFrontendProcess = null;
  }
  return { success: true };
});

ipcMain.handle('nocturne-dashboard-status', () => {
  return {
    backendRunning: nocturneBackendProcess && !nocturneBackendProcess.killed,
    frontendRunning: nocturneFrontendProcess && !nocturneFrontendProcess.killed,
    backendPid: nocturneBackendProcess?.pid,
    frontendPid: nocturneFrontendProcess?.pid,
  };
});

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
  }
  return result;
});

ipcMain.handle('stop-gateway', () => {
  // 停止 OCT Gateway
  if (octGatewayProcess && !octGatewayProcess.killed) {
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
    keys.OCT_PROVIDER = pick('OCT_PROVIDER', cfg.OCT_PROVIDER);
    keys.OCT_MODEL = pick('OCT_MODEL', cfg.OCT_MODEL);
    keys.DASHSCOPE_API_KEY = pick('DASHSCOPE_API_KEY', cfg.DASHSCOPE_API_KEY);
    keys.DEEPSEEK_API_KEY = pick('DEEPSEEK_API_KEY', cfg.DEEPSEEK_API_KEY);
    keys.MINIMAX_API_KEY = pick('MINIMAX_API_KEY', cfg.MINIMAX_API_KEY);
    keys.TTS_MINIMAX_VOICE_ID = pick('TTS_MINIMAX_VOICE_ID', cfg.TTS_MINIMAX_VOICE_ID, DEFAULT_CONFIG.TTS_MINIMAX_VOICE_ID);
    keys.CUSTOM_API_KEY = pick('CUSTOM_API_KEY', cfg.CUSTOM_API_KEY);
    keys.DASHSCOPE_BASE_URL = pick('DASHSCOPE_BASE_URL', cfg.DASHSCOPE_BASE_URL);
    keys.DEEPSEEK_BASE_URL = pick('DEEPSEEK_BASE_URL', cfg.DEEPSEEK_BASE_URL);
    keys.MINIMAX_BASE_URL = pick('MINIMAX_BASE_URL', cfg.MINIMAX_BASE_URL);
    keys.CUSTOM_BASE_URL = pick('CUSTOM_BASE_URL', cfg.CUSTOM_BASE_URL);
    keys.BRAVE_SEARCH_API_KEY = pick('BRAVE_SEARCH_API_KEY', cfg.BRAVE_SEARCH_API_KEY);
    keys.TAVILY_API_KEY = pick('TAVILY_API_KEY', cfg.TAVILY_API_KEY);
    return { 
      success: true, 
      data: { 
        DASHSCOPE_API_KEY: keys.DASHSCOPE_API_KEY || '', 
        DEEPSEEK_API_KEY: keys.DEEPSEEK_API_KEY || '',
        MINIMAX_API_KEY: keys.MINIMAX_API_KEY || '',
        TTS_MINIMAX_VOICE_ID: keys.TTS_MINIMAX_VOICE_ID || DEFAULT_CONFIG.TTS_MINIMAX_VOICE_ID,
        CUSTOM_API_KEY: keys.CUSTOM_API_KEY || '',
        OPENCLAW_WS_URL: keys.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789',
        OPENCLAW_TOKEN: keys.OPENCLAW_TOKEN || '',
        OCT_PROVIDER: keys.OCT_PROVIDER || '',
        OCT_MODEL: keys.OCT_MODEL || '',
        DASHSCOPE_BASE_URL: keys.DASHSCOPE_BASE_URL || '',
        DEEPSEEK_BASE_URL: keys.DEEPSEEK_BASE_URL || '',
        MINIMAX_BASE_URL: keys.MINIMAX_BASE_URL || '',
        CUSTOM_BASE_URL: keys.CUSTOM_BASE_URL || '',
        BRAVE_SEARCH_API_KEY: keys.BRAVE_SEARCH_API_KEY || '',
        TAVILY_API_KEY: keys.TAVILY_API_KEY || '',
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
    TTS_MINIMAX_VOICE_ID?: string;
    CUSTOM_API_KEY?: string;
    OPENCLAW_WS_URL?: string;
    OPENCLAW_TOKEN?: string;
    OCT_PROVIDER?: string;
    OCT_MODEL?: string;
    CUSTOM_MODEL?: string;
    DASHSCOPE_BASE_URL?: string;
    DEEPSEEK_BASE_URL?: string;
    MINIMAX_BASE_URL?: string;
    CUSTOM_BASE_URL?: string;
    BRAVE_SEARCH_API_KEY?: string;
    TAVILY_API_KEY?: string;
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
    if (keys.DASHSCOPE_API_KEY !== undefined) cfg.DASHSCOPE_API_KEY = keys.DASHSCOPE_API_KEY || '';
    if (keys.DEEPSEEK_API_KEY !== undefined) cfg.DEEPSEEK_API_KEY = keys.DEEPSEEK_API_KEY || '';
    if (keys.MINIMAX_API_KEY !== undefined) cfg.MINIMAX_API_KEY = keys.MINIMAX_API_KEY || '';
    if (keys.TTS_MINIMAX_VOICE_ID !== undefined) cfg.TTS_MINIMAX_VOICE_ID = keys.TTS_MINIMAX_VOICE_ID || DEFAULT_CONFIG.TTS_MINIMAX_VOICE_ID;
    if (keys.CUSTOM_API_KEY !== undefined) cfg.CUSTOM_API_KEY = keys.CUSTOM_API_KEY || '';
    if (keys.OCT_PROVIDER !== undefined) cfg.OCT_PROVIDER = keys.OCT_PROVIDER || '';
    if (keys.OCT_MODEL !== undefined) cfg.OCT_MODEL = keys.OCT_MODEL || '';
    if (keys.CUSTOM_MODEL !== undefined) cfg.CUSTOM_MODEL = keys.CUSTOM_MODEL || '';
    if (keys.DASHSCOPE_BASE_URL !== undefined) cfg.DASHSCOPE_BASE_URL = keys.DASHSCOPE_BASE_URL || '';
    if (keys.DEEPSEEK_BASE_URL !== undefined) cfg.DEEPSEEK_BASE_URL = keys.DEEPSEEK_BASE_URL || '';
    if (keys.MINIMAX_BASE_URL !== undefined) cfg.MINIMAX_BASE_URL = keys.MINIMAX_BASE_URL || '';
    if (keys.CUSTOM_BASE_URL !== undefined) cfg.CUSTOM_BASE_URL = keys.CUSTOM_BASE_URL || '';
    if (keys.BRAVE_SEARCH_API_KEY !== undefined) cfg.BRAVE_SEARCH_API_KEY = keys.BRAVE_SEARCH_API_KEY || '';
    if (keys.TAVILY_API_KEY !== undefined) cfg.TAVILY_API_KEY = keys.TAVILY_API_KEY || '';
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
    if (openclawWs) {
      openclawWs.close();
      openclawWs = null;
    }
    mainWindow?.webContents.send('openclaw-log-lines', ['[连接] 保存配置完成，检查 Gateway...']);
    // AI 配置或搜索引擎 Key 变更需重启 Gateway 才能生效
    const aiConfigChanged = keys.OCT_PROVIDER !== undefined || keys.OCT_MODEL !== undefined
      || keys.CUSTOM_MODEL !== undefined
      || keys.DASHSCOPE_BASE_URL !== undefined || keys.DEEPSEEK_BASE_URL !== undefined
      || keys.MINIMAX_BASE_URL !== undefined
      || keys.CUSTOM_BASE_URL !== undefined
      || keys.DASHSCOPE_API_KEY !== undefined || keys.DEEPSEEK_API_KEY !== undefined
      || keys.MINIMAX_API_KEY !== undefined
      || keys.CUSTOM_API_KEY !== undefined
      || keys.BRAVE_SEARCH_API_KEY !== undefined || keys.TAVILY_API_KEY !== undefined;
    if (aiConfigChanged && octGatewayProcess && !octGatewayProcess.killed) {
      octGatewayProcess.kill();
      octGatewayProcess = null;
      mainWindow?.webContents.send('openclaw-log-lines', ['[系统] AI 配置已更新，正在重启 Gateway...']);
      await new Promise(r => setTimeout(r, 1500));
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
    reconnectRetryCount = 0;
    connectOpenClaw();
    
    return { success: true };
  } catch (e: any) {
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

// Provider 列表（供 Settings UI 服务商选择器使用）
ipcMain.handle('get-provider-list', async () => {
  try {
    const gatewayDir = path.dirname(getOctGatewayEntry() || path.join(__dirname, '..', 'oct-gateway', 'index.js'));
    const providersPath = path.join(gatewayDir, 'providers.js');
    if (!fs.existsSync(providersPath)) {
      return { success: false, error: 'providers.js 未找到', data: null };
    }
    const { PROVIDERS } = require(providersPath);
    return { success: true, data: PROVIDERS };
  } catch (e: any) {
    console.error('[get-provider-list]', e.message);
    return { success: false, error: e.message, data: null };
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
    const { PROVIDERS } = fs.existsSync(providersPath) ? require(providersPath) : { PROVIDERS: {} };
    const providerId = cfg.OCT_PROVIDER || ((cfg.DASHSCOPE_BASE_URL || '').includes('coding.dashscope') ? 'bailian-coding' : 'bailian');
    const provider = (PROVIDERS as Record<string, any>)[providerId] || (PROVIDERS as Record<string, any>)['bailian-coding'];
    const baseUrl =
      providerId === 'deepseek' ? (cfg.DEEPSEEK_BASE_URL || provider?.baseUrl || '')
      : providerId === 'minimax' ? (cfg.MINIMAX_BASE_URL || provider?.baseUrl || '')
      : providerId === 'custom' ? (cfg.CUSTOM_BASE_URL || provider?.baseUrl || '')
      : (cfg.DASHSCOPE_BASE_URL || provider?.baseUrl || '');
    const apiKey =
      providerId === 'deepseek' ? (cfg.DEEPSEEK_API_KEY || '')
      : providerId === 'minimax' ? (cfg.MINIMAX_API_KEY || '')
      : providerId === 'custom' ? (cfg.CUSTOM_API_KEY || '')
      : (cfg.DASHSCOPE_API_KEY || '');
    const model = cfg.OCT_MODEL || provider?.defaultModel || 'qwen3.5-plus';
    if (!baseUrl || !apiKey) {
      return { success: false, error: '请先填写 API Key 并选择服务商' };
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
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

ipcMain.handle('openclaw-send', (_, payload: string | { content: string; imageDataUrl?: string | null; files?: UploadedFile[]; pacingMs?: number; canvasContext?: any }) => {
  let content: string;
  let imageDataUrl: string | null | undefined;
  let files: UploadedFile[] | undefined;
  let pacingMs: number | undefined;
  let canvasContext: any;

  if (typeof payload === 'string') {
    content = payload;
    imageDataUrl = null;
    files = undefined;
    pacingMs = undefined;
    canvasContext = undefined;
  } else if (payload && typeof payload === 'object') {
    const c = payload.content;
    content = typeof c === 'string' ? c : (c ? String(c) : '');
    imageDataUrl = payload.imageDataUrl;
    files = payload.files;
    pacingMs = payload.pacingMs;
    canvasContext = payload.canvasContext;
  } else {
    content = '';
    imageDataUrl = null;
    files = undefined;
    pacingMs = undefined;
    canvasContext = undefined;
  }

  return sendChatMessage(content, imageDataUrl, files, pacingMs, canvasContext);
});

ipcMain.handle('openclaw-status', () => {
  return { connected: openclawWs?.readyState === WebSocket.OPEN, sessionKey: currentSessionKey };
});

ipcMain.handle('show-notification', (_, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

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

ipcMain.handle('asr-transcribe', async (_, payload: { audioDataUrl: string; language?: string }) => {
  const audioDataUrl = typeof payload?.audioDataUrl === 'string' ? payload.audioDataUrl.trim() : '';
  const language = typeof payload?.language === 'string' ? payload.language.trim() : 'zh';
  if (!audioDataUrl.startsWith('data:audio/')) {
    return { success: false, error: 'Invalid audio payload' };
  }

  const cfg = readAppConfig();
  const apiKey = String(cfg.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
  if (!apiKey) {
    return { success: false, error: 'DASHSCOPE_API_KEY not configured for ASR' };
  }

  const configuredBase = String(cfg.DASHSCOPE_BASE_URL || '').trim();
  const baseUrl = configuredBase.includes('dashscope-intl')
    ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
    : 'https://dashscope.aliyuncs.com/compatible-mode/v1';

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen3-asr-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: audioDataUrl,
                },
              },
            ],
          },
        ],
        stream: false,
        asr_options: {
          language,
          enable_itn: false,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `ASR API error ${res.status}: ${errText}` };
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') {
      return { success: false, error: 'ASR returned no transcript text' };
    }

    return { success: true, text: text.trim() };
  } catch (e: any) {
    return { success: false, error: e?.message || 'ASR request failed' };
  }
});

app.whenReady().then(async () => {
  loadOpenClawConfig();
  const loaded = loadSessionState();
  if (loaded?.sessionKey) currentSessionKey = loaded.sessionKey;

  // 1. 先创建窗口（显示界面，但不连接）
  createWindow();

  // 2. 启动 Nocturne（不等待，后台跑）
  startNocturneBackend().catch(e =>
    console.warn('[Nocturne] 自动启动失败:', e)
  );

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
    try { octGatewayProcess.kill('SIGTERM'); } catch {}
    octGatewayProcess = null;
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    try { gatewayProcess.kill('SIGTERM'); } catch {}
    gatewayProcess = null;
  }
  if (nocturneBackendProcess && !nocturneBackendProcess.killed) {
    try { nocturneBackendProcess.kill('SIGTERM'); } catch {}
    nocturneBackendProcess = null;
  }
  if (nocturneFrontendProcess && !nocturneFrontendProcess.killed) {
    try { nocturneFrontendProcess.kill('SIGTERM'); } catch {}
    nocturneFrontendProcess = null;
  }
  if (aiLibraryProcess && !aiLibraryProcess.killed) {
    try { aiLibraryProcess.kill('SIGTERM'); } catch {}
    aiLibraryProcess = null;
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
    try { octGatewayProcess.kill('SIGTERM'); } catch {}
    octGatewayProcess = null;
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    try { gatewayProcess.kill('SIGTERM'); } catch {}
    gatewayProcess = null;
  }
  if (nocturneBackendProcess && !nocturneBackendProcess.killed) {
    try { nocturneBackendProcess.kill('SIGTERM'); } catch {}
    nocturneBackendProcess = null;
  }
  if (nocturneFrontendProcess && !nocturneFrontendProcess.killed) {
    try { nocturneFrontendProcess.kill('SIGTERM'); } catch {}
    nocturneFrontendProcess = null;
  }
  if (aiLibraryProcess && !aiLibraryProcess.killed) {
    try { aiLibraryProcess.kill('SIGTERM'); } catch {}
    aiLibraryProcess = null;
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
// Nocturne Memory — 完整 API 代理层
// 把 Nocturne 的 6 个工具全部暴露为 IPC，AMY 通过这里直接访问
// 追加到 main.ts 末尾（app.on('activate') 之前）
// ═══════════════════════════════════════════════════════════════

const NOCTURNE_BASE = 'http://127.0.0.1:8000';

/** 检查 Nocturne 后端是否在运行 */
async function isNocturneBackendAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${NOCTURNE_BASE}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** 通用 Nocturne HTTP 请求封装 */
async function nocturneRequest(
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  params?: Record<string, string>,
  body?: unknown
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const url = new URL(NOCTURNE_BASE + path);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString(), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** URI 拆分：core://agent/identity → { domain: 'core', path: 'agent/identity' } */
function splitUri(uri: string): { domain: string; path: string } | null {
  const m = uri.match(/^([^:]+):\/\/(.+)$/);
  if (!m) return null;
  return { domain: m[1]!, path: m[2]! };
}

// ── 1. read_memory ────────────────────────────────────────────
// 读取节点内容和子节点
// 支持: core://xxx/yyy  system://boot  system://index  system://recent
ipcMain.handle('nocturne-read', async (_, { uri }: { uri: string }) => {
  if (!uri) return { ok: false, error: 'uri 不能为空' };

  // 特殊系统入口
  if (uri === 'system://boot') {
    // 读取 .env 里配置的 CORE_MEMORY_URIS，逐条读取并合并
    const base = getNocturnePath();
    let coreUris: string[] = [];
    if (base) {
      const envPath = require('path').join(base, '.env');
      try {
        const envContent = require('fs').readFileSync(envPath, 'utf-8');
        const m = envContent.match(/CORE_MEMORY_URIS=(.+)/);
        if (m) coreUris = m[1]!.split(',').map((s: string) => s.trim()).filter(Boolean);
      } catch {}
    }
    const results: unknown[] = [];
    for (const u of coreUris) {
      const parts = splitUri(u);
      if (!parts) continue;
      const r = await nocturneRequest('GET', '/browse/node', { path: parts.path, domain: parts.domain });
      if (r.ok) results.push({ uri: u, ...(r.data as object) });
    }
    return { ok: true, data: results };
  }

  if (uri === 'system://index') {
    const r = await nocturneRequest('GET', '/browse/domains');
    return r;
  }

  if (uri === 'system://recent') {
    // 读取所有 domain 的根节点作为最近记忆的近似
    const domainsResult = await nocturneRequest('GET', '/browse/domains');
    return domainsResult;
  }

  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效的 URI: ${uri}` };
  return nocturneRequest('GET', '/browse/node', { path: parts.path, domain: parts.domain });
});

// ── 2. create_memory ─────────────────────────────────────────
// 在指定 URI 创建新记忆（PUT /browse/node）
ipcMain.handle('nocturne-create', async (_, {
  uri, content, priority, disclosure
}: { uri: string; content: string; priority?: number; disclosure?: string }) => {
  if (!uri) return { ok: false, error: 'uri 不能为空' };
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效的 URI: ${uri}` };
  const result = await nocturneRequest('PUT', '/browse/node',
    { path: parts.path, domain: parts.domain },
    { content, priority: priority ?? 2, disclosure: disclosure ?? '' }
  );
  // ✅ 写入成功后通知前端刷新
  if (result.ok && mainWindow) {
    mainWindow.webContents.executeJavaScript(
      'window.dispatchEvent(new Event("nocturne-write-complete"))'
    ).catch(() => {});
  }
  return result;
});

// ── 3. update_memory ─────────────────────────────────────────
// 更新已有记忆（同样用 PUT，Nocturne 会创建新版本快照）
ipcMain.handle('nocturne-update', async (_, {
  uri, content, priority, disclosure
}: { uri: string; content?: string; priority?: number; disclosure?: string }) => {
  if (!uri) return { ok: false, error: 'uri 不能为空' };
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效的 URI: ${uri}` };
  const body: Record<string, unknown> = {};
  if (content !== undefined) body.content = content;
  if (priority !== undefined) body.priority = priority;
  if (disclosure !== undefined) body.disclosure = disclosure;
  const result = await nocturneRequest('PUT', '/browse/node',
    { path: parts.path, domain: parts.domain },
    body
  );
  // ✅ 写入成功后通知前端刷新
  if (result.ok && mainWindow) {
    mainWindow.webContents.executeJavaScript(
      'window.dispatchEvent(new Event("nocturne-write-complete"))'
    ).catch(() => {});
  }
  return result;
});

// ── 4. delete_memory ─────────────────────────────────────────
// 删除一条访问路径（通过 review 系统实现软删除）
// Nocturne 没有直接 DELETE /browse/node，用 review/groups 的 rollback 替代
// 这里提供一个"标记废弃"的实现：把内容清空并标注
ipcMain.handle('nocturne-delete', async (_, { uri }: { uri: string }) => {
  if (!uri) return { ok: false, error: 'uri 不能为空' };
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效的 URI: ${uri}` };
  // 用内容覆盖标记为已删除（Nocturne 会生成快照，可在 Dashboard 审查）
  return nocturneRequest('PUT', '/browse/node',
    { path: parts.path, domain: parts.domain },
    { content: '[DELETED]', priority: 99, disclosure: '此节点已被删除' }
  );
});

// ── 5. add_alias ─────────────────────────────────────────────
// 为同一内容添加别名路径（先读原 URI 内容，再 PUT 到新 URI）
ipcMain.handle('nocturne-alias', async (_, {
  sourceUri, targetUri, priority, disclosure
}: { sourceUri: string; targetUri: string; priority?: number; disclosure?: string }) => {
  const srcParts = splitUri(sourceUri);
  const tgtParts = splitUri(targetUri);
  if (!srcParts) return { ok: false, error: `无效的 sourceUri: ${sourceUri}` };
  if (!tgtParts) return { ok: false, error: `无效的 targetUri: ${targetUri}` };

  // 读取源节点内容
  const readResult = await nocturneRequest('GET', '/browse/node',
    { path: srcParts.path, domain: srcParts.domain }
  );
  if (!readResult.ok) return { ok: false, error: `读取源节点失败: ${readResult.error}` };

  const srcData = readResult.data as any;
  const content = srcData?.node?.content ?? srcData?.content ?? '';

  // 在目标 URI 创建（内容相同）
  return nocturneRequest('PUT', '/browse/node',
    { path: tgtParts.path, domain: tgtParts.domain },
    {
      content,
      priority: priority ?? srcData?.node?.priority ?? 2,
      disclosure: disclosure ?? srcData?.node?.disclosure ?? ''
    }
  );
});

// ── 6. search_memory ─────────────────────────────────────────
// 按关键词搜索记忆（遍历 domains，在 /browse/node 路径中搜索）
// Nocturne 没有全局搜索接口，用 /browse/glossary 作为入口
ipcMain.handle('nocturne-search', async (_, { query, domain }: { query: string; domain?: string }) => {
  if (!query) return { ok: false, error: 'query 不能为空' };

  // 先尝试 glossary 关键词匹配
  const glossaryResult = await nocturneRequest('GET', '/browse/glossary');
  const matches: Array<{ uri: string; matched_by: string }> = [];

  if (glossaryResult.ok && Array.isArray(glossaryResult.data)) {
    const keywords = glossaryResult.data as Array<{ keyword: string; uri?: string }>;
    const q = query.toLowerCase();
    for (const kw of keywords) {
      if (kw.keyword?.toLowerCase().includes(q)) {
        matches.push({ uri: kw.uri || '', matched_by: 'glossary' });
      }
    }
  }

  // 再枚举 domains 做路径匹配
  const domainsResult = await nocturneRequest('GET', '/browse/domains');
  if (domainsResult.ok && Array.isArray(domainsResult.data)) {
    const domains = (domainsResult.data as Array<{ domain: string }>)
      .map((d) => d.domain)
      .filter((d) => !domain || d === domain);

    for (const dom of domains) {
      const rootResult = await nocturneRequest('GET', '/browse/node', { path: '', domain: dom, nav_only: 'true' });
      if (!rootResult.ok) continue;
      const rootData = rootResult.data as any;
      const children: Array<{ path: string }> = rootData?.children ?? [];
      const q = query.toLowerCase();
      for (const child of children) {
        if (child.path?.toLowerCase().includes(q)) {
          matches.push({ uri: `${dom}://${child.path}`, matched_by: 'path' });
        }
      }
    }
  }

  return { ok: true, data: matches };
});

// ── 状态检查 ─────────────────────────────────────────────────
ipcMain.handle('nocturne-health', async () => {
  const alive = await isNocturneBackendAlive();
  return { ok: alive, url: NOCTURNE_BASE };
});

// ── 批量导入（迁移工具用） ────────────────────────────────────
ipcMain.handle('nocturne-batch-import', async (_, {
  memories
}: {
  memories: Array<{ uri: string; content: string; priority?: number; disclosure?: string }>
}) => {
  const results: Array<{ uri: string; ok: boolean; error?: string }> = [];
  for (const m of memories) {
    const parts = splitUri(m.uri);
    if (!parts) {
      results.push({ uri: m.uri, ok: false, error: '无效 URI' });
      continue;
    }
    const r = await nocturneRequest('PUT', '/browse/node',
      { path: parts.path, domain: parts.domain },
      { content: m.content, priority: m.priority ?? 2, disclosure: m.disclosure ?? '' }
    );
    results.push({ uri: m.uri, ok: r.ok, error: r.error });
  }
  const succeeded = results.filter((r) => r.ok).length;
  return { ok: true, data: { total: memories.length, succeeded, failed: memories.length - succeeded, results } };
});

// ═══════════════════════════════════════════════════════════════
// Task Board 任务看板 API
// 数据存储路径: core://my_user/daily/今日日期/tasks
// ═══════════════════════════════════════════════════════════════

/** 获取今日日期字符串 YYYY-MM-DD */
function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 从 Nocturne 读取今日任务 */
ipcMain.handle('nocturne-get-tasks', async () => {
  try {
    const todayStr = getTodayDateString();
    const alive = await isNocturneBackendAlive();
    if (!alive) {
      return { ok: false, error: 'Nocturne 离线', tasks: [], intention: '', parkingLot: [] };
    }

    // 1. 读取今日意图
    const intentionResult = await nocturneRequest('GET', '/browse/node', {
      path: `my_user/daily/${todayStr}/intention`,
      domain: 'core',
    });
    const intention = intentionResult.ok
      ? (intentionResult.data as any)?.node?.content || (intentionResult.data as any)?.content || ''
      : '';

    // 2. 读取今日任务列表
    const tasksResult = await nocturneRequest('GET', '/browse/node', {
      path: `my_user/daily/${todayStr}/tasks`,
      domain: 'core',
    });

    const tasks: Array<{
      id: string;
      content: string;
      priority: 'p0' | 'p1' | 'p2';
      done: boolean;
      source: 'amy' | 'user';
      createdAt: string;
    }> = [];

    if (tasksResult.ok) {
      const children = (tasksResult.data as any)?.node?.children || (tasksResult.data as any)?.children || [];
      for (const child of children) {
        const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
        if (!childPath) continue;
        const taskResult = await nocturneRequest('GET', '/browse/node', {
          path: childPath,
          domain: 'core',
        });
        if (!taskResult.ok) continue;
        const content = (taskResult.data as any)?.node?.content || (taskResult.data as any)?.content || '';
        try {
          const parsed = JSON.parse(content);
          tasks.push({
            id: childPath.split('/').pop() || childPath,
            content: parsed.content || '',
            priority: parsed.priority || 'p2',
            done: !!parsed.done,
            source: parsed.source || 'amy',
            createdAt: parsed.createdAt || new Date().toISOString(),
          });
        } catch {
          // 非JSON格式，直接作为任务内容
          if (content && content !== '[DELETED]') {
            tasks.push({
              id: childPath.split('/').pop() || childPath,
              content: content,
              priority: 'p2',
              done: false,
              source: 'amy',
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    // 3. 读取停车场
    const parkingResult = await nocturneRequest('GET', '/browse/node', {
      path: `my_user/daily/${todayStr}/parking_lot`,
      domain: 'core',
    });

    const parkingLot: Array<{
      id: string;
      content: string;
      priority: 'p0' | 'p1' | 'p2';
      done: boolean;
      source: 'amy' | 'user';
      createdAt: string;
    }> = [];

    if (parkingResult.ok) {
      const children = (parkingResult.data as any)?.node?.children || (parkingResult.data as any)?.children || [];
      for (const child of children) {
        const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
        if (!childPath) continue;
        const itemResult = await nocturneRequest('GET', '/browse/node', {
          path: childPath,
          domain: 'core',
        });
        if (!itemResult.ok) continue;
        const content = (itemResult.data as any)?.node?.content || (itemResult.data as any)?.content || '';
        try {
          const parsed = JSON.parse(content);
          if (!parsed.done) {
            parkingLot.push({
              id: childPath.split('/').pop() || childPath,
              content: parsed.item || parsed.content || '',
              priority: 'p1',
              done: false,
              source: 'amy',
              createdAt: parsed.time || new Date().toISOString(),
            });
          }
        } catch {
          if (content && content !== '[DELETED]') {
            parkingLot.push({
              id: childPath.split('/').pop() || childPath,
              content: content,
              priority: 'p1',
              done: false,
              source: 'amy',
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return { ok: true, tasks, intention, parkingLot };
  } catch (e: any) {
    console.error('[TaskBoard] 获取任务失败:', e);
    return { ok: false, error: e?.message, tasks: [], intention: '', parkingLot: [] };
  }
});

/** 更新任务状态（完成/未完成） */
ipcMain.handle('nocturne-update-task', async (_, { taskId, done }: { taskId: string; done: boolean }) => {
  try {
    const todayStr = getTodayDateString();
    const alive = await isNocturneBackendAlive();
    if (!alive) return { ok: false, error: 'Nocturne 离线' };

    // 先读取现有任务
    const taskResult = await nocturneRequest('GET', '/browse/node', {
      path: `my_user/daily/${todayStr}/tasks/${taskId}`,
      domain: 'core',
    });

    let taskData: Record<string, unknown> = { content: '', priority: 'p2', done, source: 'amy', createdAt: new Date().toISOString() };
    if (taskResult.ok) {
      const content = (taskResult.data as any)?.node?.content || (taskResult.data as any)?.content || '';
      try {
        taskData = { ...JSON.parse(content), done };
      } catch {
        taskData = { content, priority: 'p2', done, source: 'amy', createdAt: new Date().toISOString() };
      }
    }

    // 更新任务
    const updateResult = await nocturneRequest('PUT', '/browse/node', {
      path: `my_user/daily/${todayStr}/tasks/${taskId}`,
      domain: 'core',
    }, { content: JSON.stringify(taskData), priority: 2, disclosure: '' });

    return { ok: updateResult.ok, error: updateResult.error };
  } catch (e: any) {
    console.error('[TaskBoard] 更新任务失败:', e);
    return { ok: false, error: e?.message };
  }
});

/** 添加新任务 */
ipcMain.handle('nocturne-add-task', async (_, { content, priority, source }: {
  content: string;
  priority: 'p0' | 'p1' | 'p2';
  source: 'amy' | 'user';
}) => {
  try {
    const todayStr = getTodayDateString();
    const alive = await isNocturneBackendAlive();
    if (!alive) return { ok: false, error: 'Nocturne 离线' };

    // 生成唯一ID（时间戳 + 随机字符）
    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const taskData = {
      content,
      priority,
      done: false,
      source,
      createdAt: new Date().toISOString(),
    };

    const result = await nocturneRequest('PUT', '/browse/node', {
      path: `my_user/daily/${todayStr}/tasks/${taskId}`,
      domain: 'core',
    }, { content: JSON.stringify(taskData), priority: priority === 'p0' ? 1 : priority === 'p1' ? 2 : 3, disclosure: '' });

    if (result.ok) {
      mainWindow?.webContents.send('task-board-update');
      // AMY 或用户写入后触发看板 1 秒后刷新
      mainWindow?.webContents.executeJavaScript(
        'window.dispatchEvent(new Event("nocturne-write-complete"))'
      ).catch(() => {});
    }

    return { ok: result.ok, error: result.error, taskId };
  } catch (e: any) {
    console.error('[TaskBoard] 添加任务失败:', e);
    return { ok: false, error: e?.message };
  }
});

/** 清空已完成的任务 */
ipcMain.handle('nocturne-clear-completed-tasks', async () => {
  try {
    const todayStr = getTodayDateString();
    const alive = await isNocturneBackendAlive();
    if (!alive) return { ok: false, error: 'Nocturne 离线' };

    // 获取所有任务
    const tasksResult = await nocturneRequest('GET', '/browse/node', {
      path: `my_user/daily/${todayStr}/tasks`,
      domain: 'core',
    });

    if (!tasksResult.ok) return { ok: true };

    const children = (tasksResult.data as any)?.node?.children || (tasksResult.data as any)?.children || [];
    for (const child of children) {
      const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
      if (!childPath) continue;

      // 读取任务状态
      const taskResult = await nocturneRequest('GET', '/browse/node', {
        path: childPath,
        domain: 'core',
      });
      if (!taskResult.ok) continue;

      const content = (taskResult.data as any)?.node?.content || (taskResult.data as any)?.content || '';
      try {
        const parsed = JSON.parse(content);
        if (parsed.done) {
          // 标记为删除
          await nocturneRequest('PUT', '/browse/node', {
            path: childPath,
            domain: 'core',
          }, { content: '[DELETED]', priority: 99, disclosure: '已完成的任务' });
        }
      } catch {}
    }

    return { ok: true };
  } catch (e: any) {
    console.error('[TaskBoard] 清空已完成任务失败:', e);
    return { ok: false, error: e?.message };
  }
});

/** 设置今日意图 */
ipcMain.handle('nocturne-set-intention', async (_, { intention }: { intention: string }) => {
  try {
    const todayStr = getTodayDateString();
    const alive = await isNocturneBackendAlive();
    if (!alive) return { ok: false, error: 'Nocturne 离线' };

    const result = await nocturneRequest('PUT', '/browse/node', {
      path: `my_user/daily/${todayStr}/intention`,
      domain: 'core',
    }, { content: intention, priority: 1, disclosure: '今日意图' });

    return { ok: result.ok, error: result.error };
  } catch (e: any) {
    console.error('[TaskBoard] 设置意图失败:', e);
    return { ok: false, error: e?.message };
  }
});

// ═══════════════════════════════════════════════════════════════
// END: Nocturne Memory 代理层
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// 本地任务存储（脱离 Nocturne，避免写入时掉线）
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
ipcMain.handle('tasks-read', async () => {
  const filePath = path.join(app.getPath('userData'), 'tasks.json');
  try {
    console.log('[TasksLocal] tasks-read filePath:', filePath);
  } catch {}
  if (!fs.existsSync(filePath)) {
    return { tasks: [], parking: [], intention: '', updatedAt: '' };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  try {
    console.log('[TasksLocal] tasks-read counts:', {
      tasks: Array.isArray(raw?.tasks) ? raw.tasks.length : 0,
      parking: Array.isArray(raw?.parking) ? raw.parking.length : 0,
      updatedAt: raw?.updatedAt || '',
    });
  } catch {}
  return {
    tasks: raw.tasks || [],
    parking: raw.parking || [],
    intention: raw.intention || '',
    updatedAt: raw.updatedAt || '',
  };
});

/** 写入任务数据（全量覆盖） */
ipcMain.handle('tasks-write', async (_: Electron.IpcMainInvokeEvent, data: { tasks: TaskItem[]; parking: any[]; intention?: string }) => {
  const filePath = path.join(app.getPath('userData'), 'tasks.json');
  const payload = {
    tasks: data.tasks || [],
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

/** 从 Nocturne 迁移数据到本地 */
ipcMain.handle('tasks-migrate-from-nocturne', async () => {
  try {
    const alive = await isNocturneBackendAlive();
    if (!alive) {
      return { ok: false, error: 'Nocturne 离线，无法迁移' };
    }

    const todayStr = getTodayDateString();
    const localData = loadTasksData();
    let migratedTasks = 0;
    let migratedParking = 0;

    // 迁移任务
    const tasksResult = await nocturneRequest('GET', '/browse/node', {
      path: `my_user/daily/${todayStr}/tasks`,
      domain: 'core',
    });

    if (tasksResult.ok) {
      const children = (tasksResult.data as any)?.node?.children || (tasksResult.data as any)?.children || [];
      for (const child of children) {
        const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
        if (!childPath) continue;

        const taskResult = await nocturneRequest('GET', '/browse/node', {
          path: childPath,
          domain: 'core',
        });
        if (!taskResult.ok) continue;

        const content = (taskResult.data as any)?.node?.content || (taskResult.data as any)?.content || '';
        try {
          const parsed = JSON.parse(content);
          if (parsed.archived) continue; // 跳过已归档
          
          // 检查是否已存在
          const existingId = childPath.split('/').pop();
          if (!localData.tasks.find(t => t.id === existingId)) {
            localData.tasks.push({
              id: existingId || `${Date.now()}`,
              content: parsed.label || parsed.content || parsed.item || '未命名任务',
              priority: parsed.priority || 'p2',
              done: parsed.done || false,
              source: parsed.source || 'amy',
              createdAt: parsed.created || parsed.createdAt || '',
            });
            migratedTasks++;
          }
        } catch {
          // 非 JSON 内容，跳过
        }
      }
    }

    // 迁移停车场
    const parkingResult = await nocturneRequest('GET', '/browse/node', {
      path: `my_user/daily/${todayStr}/parking_lot`,
      domain: 'core',
    });

    if (parkingResult.ok) {
      const children = (parkingResult.data as any)?.node?.children || (parkingResult.data as any)?.children || [];
      for (const child of children) {
        const childPath = child.path || child.uri?.replace(/^[^:]+:\/\//, '') || '';
        if (!childPath) continue;

        const itemResult = await nocturneRequest('GET', '/browse/node', {
          path: childPath,
          domain: 'core',
        });
        if (!itemResult.ok) continue;

        const content = (itemResult.data as any)?.node?.content || (itemResult.data as any)?.content || '';
        try {
          const parsed = JSON.parse(content);
          const existingId = childPath.split('/').pop();
          if (!localData.parking.find(p => p.id === existingId)) {
            localData.parking.push({
              id: existingId || `${Date.now()}`,
              content: parsed.item || content.slice(0, 50),
              priority: 'p2',
              done: false,
              source: 'amy',
              createdAt: parsed.time || '',
            });
            migratedParking++;
          }
        } catch {
          // 非 JSON 内容，尝试作为纯文本
          if (content && content !== '[DELETED]') {
            const existingId = childPath.split('/').pop();
            if (!localData.parking.find(p => p.id === existingId)) {
              localData.parking.push({
                id: existingId || `${Date.now()}`,
                content: content.slice(0, 50),
                priority: 'p2',
                done: false,
                source: 'amy',
                createdAt: '',
              });
              migratedParking++;
            }
          }
        }
      }
    }

    // 迁移意图
    const intentionResult = await nocturneRequest('GET', '/browse/node', {
      path: `my_user/daily/${todayStr}/intention`,
      domain: 'core',
    });
    if (intentionResult.ok) {
      const content = (intentionResult.data as any)?.node?.content || (intentionResult.data as any)?.content || '';
      if (content && !localData.intention) {
        localData.intention = content;
      }
    }

    // 保存迁移结果
    if (saveTasksData(localData)) {
      console.log(`[TasksLocal] 迁移完成: ${migratedTasks} 任务, ${migratedParking} 停车场项目`);
      mainWindow?.webContents.send('task-board-update');
      return { 
        ok: true, 
        migratedTasks, 
        migratedParking,
        message: `已从 Nocturne 迁移 ${migratedTasks} 条任务和 ${migratedParking} 条停车场项目`
      };
    }
    return { ok: false, error: '保存迁移数据失败' };
  } catch (e: any) {
    console.error('[TasksLocal] 迁移失败:', e);
    return { ok: false, error: e?.message };
  }
});
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
