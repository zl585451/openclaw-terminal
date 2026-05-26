import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { IpcDeps } from './types';
import type { ApiKeyPayload } from '../config/apiKeys';

const GATEWAY_PORT = 18789;
const GATEWAY_HTTP_PORT = GATEWAY_PORT + 1;
const CONFIG_FILE = path.join(os.homedir(), '.openclaw', 'config.json');

const DEFAULT_CONFIG = {
  OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
  OPENCLAW_TOKEN: '',
  OCT_AI_NAME: 'OpenClaw',
  OCT_USER_NAME: '用户',
  OCT_PERSONA_STYLE: 'warm',
  TTS_MINIMAX_VOICE_ID: 'male-qn-qingse',
  OCT_AI_LIBRARY_AUTO_START: true,
  OCT_AI_LIBRARY_PATH: '',
  OCT_AI_LIBRARY_PORT: 8001,
};

type OctGatewayConfigAgentPerms = {
  normalizeAgentPermissions: (input: unknown) => Record<string, boolean>;
  DEFAULT_AGENT_PERMISSIONS: Record<string, boolean>;
};

let _octGatewayConfigAgentPerms: OctGatewayConfigAgentPerms | undefined;

async function getOctGatewayConfigAgentPerms(): Promise<OctGatewayConfigAgentPerms> {
  if (!_octGatewayConfigAgentPerms) {
    const getGatewayDirForHelpers = (globalThis as any).getGatewayDirForHelpers;
    const gatewayDir = getGatewayDirForHelpers
      ? getGatewayDirForHelpers()
      : path.dirname((globalThis as any).getOctGatewayEntry?.() || path.join(__dirname, '..', 'oct-gateway', 'index.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _octGatewayConfigAgentPerms = require(path.join(gatewayDir, 'config.js')) as OctGatewayConfigAgentPerms;
  }
  return _octGatewayConfigAgentPerms;
}

function ensureConfigFile(): void {
  if (fs.existsSync(CONFIG_FILE)) return;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Config] Failed to create config.json:', e);
  }
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

export function registerAiConfigHandlers(_deps: IpcDeps) {
  ipcMain.handle('get-agent-permissions', async () => {
    try {
      const { normalizeAgentPermissions, DEFAULT_AGENT_PERMISSIONS } = await getOctGatewayConfigAgentPerms();
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

  ipcMain.handle('save-agent-permissions', async (_: unknown, permissions: {
    shellCommands?: boolean;
    fileWrite?: boolean;
    networkRequests?: boolean;
    softwareInstall?: boolean;
    systemConfig?: boolean;
  }) => {
    try {
      const { normalizeAgentPermissions, DEFAULT_AGENT_PERMISSIONS } = await getOctGatewayConfigAgentPerms();
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

  ipcMain.handle('get-api-keys', async () => {
    try {
      const { buildApiKeysData, parseEnvContent } = await import('../config/apiKeys');
      const envFilePath = path.join(__dirname, '..', '.env');
      const envObj: Record<string, string> = fs.existsSync(envFilePath)
        ? parseEnvContent(fs.readFileSync(envFilePath, 'utf-8'))
        : {};
      const cfg: Record<string, unknown> = fs.existsSync(CONFIG_FILE)
        ? (() => { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; } })()
        : {};
      return {
        success: true,
        data: buildApiKeysData(cfg, envObj, {
          OPENCLAW_WS_URL: DEFAULT_CONFIG.OPENCLAW_WS_URL,
          TTS_MINIMAX_VOICE_ID: DEFAULT_CONFIG.TTS_MINIMAX_VOICE_ID,
        }),
      };
    } catch (e: any) {
      console.error('[API Keys] Failed to read:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('save-api-keys', async (_, keys: ApiKeyPayload) => {
    try {
      const {
        applyApiKeyUpdates,
        didApiConfigChange,
        didConnectionConfigChange,
      } = await import('../config/apiKeys');

      ensureConfigFile();
      let existingConfig: Record<string, string> = {};
      if (fs.existsSync(CONFIG_FILE)) {
        try {
          existingConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        } catch {}
      }
      const { cfg, previousCfg } = applyApiKeyUpdates(existingConfig, keys, {
        OPENCLAW_WS_URL: DEFAULT_CONFIG.OPENCLAW_WS_URL,
        TTS_MINIMAX_VOICE_ID: DEFAULT_CONFIG.TTS_MINIMAX_VOICE_ID,
      });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');

      const mainWindow = (globalThis as any).mainWindow;
      const loadOpenClawConfig = (globalThis as any).loadOpenClawConfig;
      const octGatewayProcess = (globalThis as any).octGatewayProcess;
      const expectOctGatewayProcessExit = (v: boolean) => { (globalThis as any).expectOctGatewayProcessExit = v; };
      const openclawWs = (globalThis as any).openclawWs;
      const suppressAutoReconnect = (v: boolean) => { (globalThis as any).suppressAutoReconnect = v; };
      const clearReconnectTimer = (globalThis as any).clearReconnectTimer;
      const waitForPortRelease = (globalThis as any).waitForPortRelease;
      const startOctGateway = (globalThis as any).startOctGateway;
      const connectOpenClaw = (globalThis as any).connectOpenClaw;
      const getOctGatewayEntry = (globalThis as any).getOctGatewayEntry;
      const reconnectRetryCount = (v: number) => { (globalThis as any).reconnectRetryCount = v; };
      const isPortInUse = (globalThis as any).isPortInUse;

      syncExternalOmniRouteVault(cfg);

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

      loadOpenClawConfig?.();
      mainWindow?.webContents.send('openclaw-log-lines', ['[连接] 保存配置完成，检查 Gateway...']);
      const aiConfigChanged = didApiConfigChange(previousCfg, cfg);
      const connectionChanged = didConnectionConfigChange(previousCfg, cfg);
      if (connectionChanged) {
        suppressAutoReconnect?.(true);
        clearReconnectTimer?.();
        if (openclawWs) {
          openclawWs.close();
          _deps.setOpenclawWs(null);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      if (aiConfigChanged && octGatewayProcess && !octGatewayProcess.killed) {
        expectOctGatewayProcessExit(true);
        octGatewayProcess.kill();
        (globalThis as any).octGatewayProcess = null;
        mainWindow?.webContents.send('openclaw-log-lines', ['[系统] AI 配置已更新，正在重启 Gateway...']);
        await waitForPortRelease?.(GATEWAY_PORT, 5000);
        await new Promise((r) => setTimeout(r, 500));
      }
      const inUse = await isPortInUse?.(GATEWAY_PORT);
      if (!inUse) {
        mainWindow?.webContents.send('openclaw-log-lines', ['[系统] 端口 18789 空闲，正在自动启动 OCT Gateway...']);
        const octEntry = getOctGatewayEntry?.();
        if (octEntry) {
          const octResult = await startOctGateway?.();
          if (octResult?.success) {
            mainWindow?.webContents.send('openclaw-log-lines', ['[OCT Gateway] 已自动启动', '[连接] 1.5s 后发起连接']);
            mainWindow?.webContents.send('gateway-status', { running: true, managed: true });
            await new Promise((r) => setTimeout(r, 1500));
          } else {
            mainWindow?.webContents.send('openclaw-log-lines', [`[系统] Gateway 启动失败: ${octResult?.error}`]);
          }
        } else {
          mainWindow?.webContents.send('openclaw-log-lines', ['[系统] 未找到 oct-gateway，请手动启动 Gateway']);
        }
      } else {
        mainWindow?.webContents.send('openclaw-log-lines', ['[系统] 端口 18789 已占用，直接连接']);
      }
      if (connectionChanged) {
        suppressAutoReconnect?.(false);
        reconnectRetryCount?.(0);
        connectOpenClaw?.();
      }

      return { success: true };
    } catch (e: any) {
      (globalThis as any).suppressAutoReconnect = false;
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

  ipcMain.handle('get-provider-list', async () => {
    try {
      const { loadProviderList } = await import('../config/providers');
      const getOctGatewayEntry = (globalThis as any).getOctGatewayEntry;
      const gatewayDir = path.dirname(getOctGatewayEntry?.() || path.join(__dirname, '..', 'oct-gateway', 'index.js'));
      const providersPath = path.join(gatewayDir, 'providers.js');
      const { providers, error } = loadProviderList({
        providersPath,
        existsSync: fs.existsSync,
        requireModule: require,
      });
      return { success: true, error: error || '', data: providers };
    } catch (e: any) {
      console.error('[get-provider-list]', e.message);
      const { loadProviderList } = await import('../config/providers');
      const { providers } = loadProviderList({
        providersPath: '',
        existsSync: () => false,
        requireModule: require,
      });
      return { success: true, error: e.message, data: providers };
    }
  });

  ipcMain.handle('test-ai-connection', async (_, formConfig?: Record<string, string>) => {
    try {
      const { loadProviderList, resolveAiConnectionSettings } = await import('../config/providers');
      let cfg: Record<string, string> = readAppConfig();
      if (formConfig && typeof formConfig === 'object') {
        cfg = { ...cfg, ...formConfig };
      }
      const getOctGatewayEntry = (globalThis as any).getOctGatewayEntry;
      const gatewayDir = path.dirname(getOctGatewayEntry?.() || path.join(__dirname, '..', 'oct-gateway', 'index.js'));
      const providersPath = path.join(gatewayDir, 'providers.js');
      const { providers } = loadProviderList({
        providersPath,
        existsSync: fs.existsSync,
        requireModule: require,
      });
      const { providerId, baseUrl, apiKey, model } = resolveAiConnectionSettings(cfg, providers);
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
}

function syncExternalOmniRouteVault(cfg: Record<string, any>): void {
  try {
    const getGatewayDirForHelpers = (globalThis as any).getGatewayDirForHelpers;
    const gatewayDir = getGatewayDirForHelpers
      ? getGatewayDirForHelpers()
      : path.dirname((globalThis as any).getOctGatewayEntry?.() || path.join(__dirname, '..', 'oct-gateway', 'index.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const omniRouteConfig = require(path.join(gatewayDir, 'runtime', 'omniRoute.config.js'));
    omniRouteConfig?.clearCache?.();
    omniRouteConfig?.updateCredential?.('external_omniroute', {
      baseUrl: String(cfg.OMNIROUTE_BASE_URL || '').trim(),
      apiKey: String(cfg.OMNIROUTE_API_KEY || '').trim(),
    });
  } catch (err: any) {
    console.warn('[OmniRoute Vault] Failed to sync external credential:', err?.message || String(err));
  }
}

type GoogleBaseUrlHelperModule = {
  sanitizeGoogleOpenAiBaseUrl: (url: string) => string;
};

let _googleBaseUrlHelper: GoogleBaseUrlHelperModule | undefined;

function getGoogleBaseUrlHelper(): GoogleBaseUrlHelperModule {
  if (!_googleBaseUrlHelper) {
    const getGatewayDirForHelpers = (globalThis as any).getGatewayDirForHelpers;
    const gatewayDir = getGatewayDirForHelpers
      ? getGatewayDirForHelpers()
      : path.dirname((globalThis as any).getOctGatewayEntry?.() || path.join(__dirname, '..', 'oct-gateway', 'index.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _googleBaseUrlHelper = require(path.join(gatewayDir, 'shared', 'googleBaseUrl.js')) as GoogleBaseUrlHelperModule;
  }
  return _googleBaseUrlHelper;
}
