const path = require('path');
const fs = require('fs');
const os = require('os');
const { PROVIDERS } = require('./providers');

const CAPABILITY_PROBE_CACHE_FILE = 'capability-probe-cache.json';
const PROBE_TTL_SUPPORTED_MS = 7 * 24 * 60 * 60 * 1000;
const PROBE_TTL_UNSUPPORTED_MS = 7 * 24 * 60 * 60 * 1000;
const PROBE_TTL_UNKNOWN_MS = 24 * 60 * 60 * 1000;

const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath });
}

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: false });
}

function ensureLocalBypassForOct() {
  const existingNoProxy = process.env.NO_PROXY || process.env.no_proxy || '';
  const mergedNoProxy = Array.from(new Set(
    existingNoProxy
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .concat(['localhost', '127.0.0.1', '::1'])
  ));

  if (mergedNoProxy.length > 0) {
    const value = mergedNoProxy.join(',');
    process.env.NO_PROXY = value;
    process.env.no_proxy = value;
  }
}

ensureLocalBypassForOct();

function loadConfigFile() {
  // Try to load from multiple sources in priority order
  const configSources = [
    process.env.OCT_CONFIG_FILE,
    // Try Electron userData config first (where settings panel saves)
    // Common Electron userData paths
    path.join(os.homedir(), 'AppData', 'Roaming', 'openclaw-terminal', 'config.json'), // Windows
    path.join(os.homedir(), 'Library', 'Application Support', 'openclaw-terminal', 'config.json'), // macOS
    path.join(os.homedir(), '.config', 'openclaw-terminal', 'config.json'), // Linux
    // Also try with the exact app name
    path.join(os.homedir(), 'AppData', 'Roaming', 'OpenClaw Terminal', 'config.json'), // Windows with spaces
    // Fallback to local config
    path.join(__dirname, 'config.json')
  ].filter(Boolean);

  for (const configFile of configSources) {
    if (fs.existsSync(configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        console.log(`[Config] Loaded config from: ${configFile}`);
        return config;
      } catch (err) {
        console.warn(`[Config] Failed to parse ${configFile}:`, err.message);
      }
    }
  }
  
  console.log('[Config] No config file found, using defaults');
  return {};
}

const openclawJsonPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
let openclawJson = null;

function loadOpenClawJson() {
  if (openclawJson) return openclawJson;
  if (fs.existsSync(openclawJsonPath)) {
    try {
      openclawJson = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf-8'));
    } catch {}
  }
  return openclawJson || {};
}

function loadOpenClawLegacyConfig() {
  const cfg = loadOpenClawJson();
  const p = cfg?.models?.providers || {};
  const bailian = p.bailian || p.dashscope || p.qwen || {};
  const deepseek = p.deepseek || {};
  const primaryModel = cfg?.agents?.defaults?.model?.primary || '';
  const modelId = primaryModel.includes('/') ? primaryModel.split('/').pop() : primaryModel;
  return {
    DASHSCOPE_API_KEY: bailian.apiKey || '',
    DASHSCOPE_BASE_URL: bailian.baseUrl || '',
    DASHSCOPE_MODEL: modelId || (bailian.models?.[0]?.id) || '',
    DEEPSEEK_API_KEY: deepseek.apiKey || '',
    DEEPSEEK_BASE_URL: deepseek.baseUrl || '',
  };
}

// ══════════════════════════════════════════════════
// 模型能力注册表 — 每个模型声明自己支持什么
// ══════════════════════════════════════════════════
const MODEL_REGISTRY = {
  // ─── 百炼 Coding Plan 模型 ───
  'qwen3.5-plus': {
    provider: 'bailian',
    label: 'Qwen 3.5 Plus（推荐，支持工具）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: true,
    maxTokens: 4096,
  },
  'qwen3-max': {
    provider: 'bailian',
    label: 'Qwen 3 Max（最强推理）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'qwen3-max-2026-01-23': {
    provider: 'bailian',
    label: 'Qwen 3 Max（最强推理）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'qwen-plus': {
    provider: 'bailian',
    label: 'Qwen Plus（稳定通用）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'qwen-max': {
    provider: 'bailian',
    label: 'Qwen Max（最强推理）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'qwen-turbo': {
    provider: 'bailian',
    label: 'Qwen Turbo（快速便宜）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'qwen3-coder-next': {
    provider: 'bailian',
    label: 'Qwen 3 Coder Next（代码专用）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'qwen3-coder-plus': {
    provider: 'bailian',
    label: 'Qwen 3 Coder Plus（代码专用）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'kimi-k2.5': {
    provider: 'bailian',
    label: 'Kimi K2.5（月之暗面）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'MiniMax-M2.5': {
    provider: 'bailian',
    label: 'MiniMax M2.5',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  // ─── MiniMax 独立模型 ───
  'MiniMax-M2.7': {
    provider: 'minimax',
    label: 'MiniMax M2.7（最新，自我迭代）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: true,
    thinkingFormat: 'think_tags',
    maxTokens: 8192,
  },
  'MiniMax-M2.7-highspeed': {
    provider: 'minimax',
    label: 'MiniMax M2.7 极速版（100tps）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: true,
    thinkingFormat: 'think_tags',
    maxTokens: 8192,
  },
  'MiniMax-M2.5-standalone': {
    provider: 'minimax',
    label: 'MiniMax M2.5（顶尖性能）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: true,
    thinkingFormat: 'think_tags',
    maxTokens: 8192,
  },
  'MiniMax-M2.5-highspeed': {
    provider: 'minimax',
    label: 'MiniMax M2.5 极速版（100tps）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: true,
    thinkingFormat: 'think_tags',
    maxTokens: 8192,
  },
  'MiniMax-M2.1': {
    provider: 'minimax',
    label: 'MiniMax M2.1（多语言编程）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: true,
    thinkingFormat: 'think_tags',
    maxTokens: 4096,
  },
  'MiniMax-M2.1-highspeed': {
    provider: 'minimax',
    label: 'MiniMax M2.1 极速版（100tps）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: true,
    thinkingFormat: 'think_tags',
    maxTokens: 4096,
  },
  'MiniMax-M2': {
    provider: 'minimax',
    label: 'MiniMax M2（高效编码）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: true,
    thinkingFormat: 'think_tags',
    maxTokens: 4096,
  },
  'glm-5': {
    provider: 'bailian',
    label: 'GLM 5（智谱）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'glm-4.7': {
    provider: 'bailian',
    label: 'GLM 4.7（智谱）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'deepseek-v3': {
    provider: 'bailian',
    label: 'DeepSeek V3（百炼版，不支持工具）',
    supportsTools: false,       // ← 关键！
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'deepseek-r1': {
    provider: 'bailian',
    label: 'DeepSeek R1（百炼版，深度推理）',
    supportsTools: false,       // ← 关键！
    supportsStreamOptions: true,
    supportsThinking: true,
    maxTokens: 4096,
  },
  // ─── DeepSeek 官方 API ───
  'deepseek-chat': {
    provider: 'deepseek',
    label: 'DeepSeek Chat（官方 API）',
    supportsTools: true,
    supportsStreamOptions: false,  // DeepSeek 官方不支持
    supportsThinking: false,
    maxTokens: 4096,
  },
  'deepseek-reasoner': {
    provider: 'deepseek',
    label: 'DeepSeek Reasoner（官方深度推理）',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: true,
    maxTokens: 4096,
  },
  // ─── Google Gemini（OpenAI 兼容端点 generativelanguage…/v1beta/openai）───
  'gemini-2.5-flash': {
    provider: 'google',
    label: 'Gemini 2.5 Flash',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: true,
    maxTokens: 8192,
  },
  'gemini-2.5-flash-lite': {
    provider: 'google',
    label: 'Gemini 2.5 Flash-Lite',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: true,
    maxTokens: 8192,
  },
  'gemini-2.5-pro': {
    provider: 'google',
    label: 'Gemini 2.5 Pro',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: true,
    maxTokens: 8192,
  },
  'gemini-3-flash-preview': {
    provider: 'google',
    label: 'Gemini 3 Flash Preview',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: true,
    maxTokens: 8192,
  },
  'gemini-3.1-pro-preview': {
    provider: 'google',
    label: 'Gemini 3.1 Pro Preview',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: true,
    maxTokens: 8192,
  },
  'gemini-2.0-flash': {
    provider: 'google',
    label: 'Gemini 2.0 Flash',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: false,
    maxTokens: 8192,
  },
  'gemini-2.0-flash-lite': {
    provider: 'google',
    label: 'Gemini 2.0 Flash-Lite',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: false,
    maxTokens: 8192,
  },
  'gemini-1.5-flash': {
    provider: 'google',
    label: 'Gemini 1.5 Flash',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: false,
    maxTokens: 8192,
  },
  'gemini-1.5-flash-8b': {
    provider: 'google',
    label: 'Gemini 1.5 Flash-8B',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: false,
    maxTokens: 8192,
  },
  'gemini-1.5-pro': {
    provider: 'google',
    label: 'Gemini 1.5 Pro',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: false,
    maxTokens: 8192,
  },
};

function normalizeModelCaps(caps, source, modelId) {
  const toolsSupport = caps?.toolsSupport
    || (caps?.supportsTools === true ? 'supported'
      : caps?.supportsTools === false ? 'unsupported'
        : 'unknown');
  return {
    ...caps,
    label: caps?.label || modelId,
    normalizedModelId: normalizeModelId(modelId),
    family: caps?.family || detectModelFamily(modelId),
    toolsSupport,
    supportsTools: toolsSupport === 'supported',
    capabilitySource: source,
  };
}

function isRegistryPrefixMatch(modelId, key) {
  if (modelId === key) return true;
  return modelId.startsWith(`${key}-`) || modelId.startsWith(`${key}/`);
}

// 查询模型能力，未注册的模型返回安全默认值（三态：supported / unknown / unsupported）
function getModelCaps(modelId) {
  const candidates = buildModelIdCandidates(modelId);
  for (const c of candidates) {
    if (MODEL_REGISTRY[c]) return normalizeModelCaps(MODEL_REGISTRY[c], 'registry_exact', modelId);
  }
  // 精确匹配
  if (MODEL_REGISTRY[modelId]) return normalizeModelCaps(MODEL_REGISTRY[modelId], 'registry_exact', modelId);
  // 前缀匹配（处理带日期后缀的模型名如 qwen3-max-2026-01-23）
  for (const [key, caps] of Object.entries(MODEL_REGISTRY)) {
    for (const c of candidates) {
      if (isRegistryPrefixMatch(c, key)) {
        return normalizeModelCaps({ ...caps, label: modelId }, 'registry_prefix', modelId);
      }
    }
  }
  // 未知模型 → unknown（运行时默认不发 tools，但会暴露为 unknown 便于探测/降级）
  return normalizeModelCaps({
    provider: 'unknown',
    label: modelId,
    toolsSupport: 'unknown',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: false,
    thinkingFormat: null,
    maxTokens: 4096,
  }, 'fallback_unknown', modelId);
}

function loadAvailableModels() {
  const cfg = loadOpenClawJson();
  const p = cfg?.models?.providers || {};
  const bailian = p.bailian || {};
  const deepseek = p.deepseek || {};
  const models = [];
  for (const m of (bailian.models || [])) {
    if (m?.id) models.push({ id: m.id, provider: 'bailian' });
  }
  for (const m of (deepseek.models || [])) {
    if (m?.id) models.push({ id: m.id, provider: 'deepseek' });
  }
  if (models.length === 0) {
    // 默认包含阿里云 Coding Plan 全部模型 + DeepSeek（Base URL 为 coding.dashscope 时需用 Coding Plan 专属 Key）
    return [
      { id: 'qwen3.5-plus', provider: 'bailian' },
      { id: 'qwen3-max-2026-01-23', provider: 'bailian' },
      { id: 'qwen3-coder-next', provider: 'bailian' },
      { id: 'qwen3-coder-plus', provider: 'bailian' },
      { id: 'kimi-k2.5', provider: 'bailian' },
      { id: 'MiniMax-M2.5', provider: 'bailian' },
      { id: 'glm-5', provider: 'bailian' },
      { id: 'glm-4.7', provider: 'bailian' },
      { id: 'deepseek-chat', provider: 'deepseek' },
    ];
  }
  return models;
}

const _fileConfig = loadConfigFile();

// 出站代理：写入用户 config.json（OCT_CONFIG_FILE）即可，打包版与开发版一致；不设置则行为与从前相同
(function applyProxyFromRuntimeConfig() {
  const pairs = [
    ['HTTPS_PROXY', _fileConfig.HTTPS_PROXY],
    ['HTTP_PROXY', _fileConfig.HTTP_PROXY],
  ];
  for (const [key, cfgVal] of pairs) {
    const fromCfg = cfgVal != null ? String(cfgVal).trim() : '';
    const fromEnv = String(process.env[key] || '').trim();
    if (!fromEnv && fromCfg) process.env[key] = fromCfg;
  }
})();

// 记录第一个命中的配置文件路径，用于 mcp/manager 写入
const _configSources = [
  process.env.OCT_CONFIG_FILE,
  path.join(os.homedir(), 'AppData', 'Roaming', 'openclaw-terminal', 'config.json'),
  path.join(os.homedir(), 'Library', 'Application Support', 'openclaw-terminal', 'config.json'),
  path.join(os.homedir(), '.config', 'openclaw-terminal', 'config.json'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'OpenClaw Terminal', 'config.json'),
  path.join(__dirname, 'config.json'),
].filter(Boolean);
let _configPath = null;
for (const f of _configSources) {
  if (fs.existsSync(f)) { _configPath = f; break; }
}
const legacyConfig = loadOpenClawLegacyConfig();

function getProbeCachePath() {
  const baseDir = _configPath ? path.dirname(_configPath) : path.join(os.homedir(), '.openclaw');
  return path.join(baseDir, CAPABILITY_PROBE_CACHE_FILE);
}

function normalizeModelId(modelId) {
  const raw = String(modelId || '').trim();
  if (!raw) return '';
  const slashParts = raw.split('/').map((item) => item.trim()).filter(Boolean);
  const tail = slashParts.length > 0 ? slashParts[slashParts.length - 1] : raw;
  return tail
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '-')
    .replace(/^pro\//, '')
    .replace(/-online$/g, '')
    .replace(/:free$/g, '');
}

function detectModelFamily(modelId) {
  const s = normalizeModelId(modelId);
  if (!s) return 'unknown';
  if (s.includes('qwen')) return 'qwen';
  if (s.includes('glm')) return 'glm';
  if (s.includes('deepseek')) return 'deepseek';
  if (s.includes('gemini')) return 'gemini';
  if (s.includes('minimax')) return 'minimax';
  if (s.includes('kimi') || s.includes('moonshot')) return 'kimi';
  if (s.includes('gpt') || s.includes('o1') || s.includes('o3')) return 'openai';
  return 'unknown';
}

function buildModelIdCandidates(modelId) {
  const raw = String(modelId || '').trim();
  if (!raw) return [];
  const out = new Set();
  out.add(raw);
  out.add(raw.toLowerCase());
  out.add(normalizeModelId(raw));
  const slashParts = raw.split('/').map((item) => item.trim()).filter(Boolean);
  if (slashParts.length > 0) {
    const tail = slashParts[slashParts.length - 1];
    out.add(tail);
    out.add(tail.toLowerCase());
    out.add(normalizeModelId(tail));
  }
  return Array.from(out).filter(Boolean);
}

let _probeCache = null;
let _probeCacheLoaded = false;

function loadProbeCache() {
  if (_probeCacheLoaded) return _probeCache || {};
  _probeCacheLoaded = true;
  const p = getProbeCachePath();
  try {
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      _probeCache = parsed && typeof parsed === 'object' ? parsed : {};
      return _probeCache;
    }
  } catch {}
  _probeCache = {};
  return _probeCache;
}

function saveProbeCache() {
  const p = getProbeCachePath();
  const dir = path.dirname(p);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(_probeCache || {}, null, 2), 'utf-8');
  } catch {}
}

function buildProbeCacheKey(providerId, baseUrl, modelId) {
  const p = String(providerId || '').trim().toLowerCase();
  const b = String(baseUrl || '').trim().toLowerCase().replace(/\/$/, '');
  const m = normalizeModelId(modelId);
  return `${p}::${b}::${m}`;
}

function getProbeCacheEntry({ providerId, baseUrl, modelId }) {
  const key = buildProbeCacheKey(providerId, baseUrl, modelId);
  const cache = loadProbeCache();
  const item = cache[key];
  if (!item) return null;
  if (item.expiresAt && Date.now() > item.expiresAt) {
    delete cache[key];
    saveProbeCache();
    return null;
  }
  return item;
}

function setProbeCacheEntry({ providerId, baseUrl, modelId, toolsSupport, capabilitySource = 'runtime_probe' }) {
  const key = buildProbeCacheKey(providerId, baseUrl, modelId);
  const cache = loadProbeCache();
  const ttl = toolsSupport === 'supported'
    ? PROBE_TTL_SUPPORTED_MS
    : toolsSupport === 'unsupported'
      ? PROBE_TTL_UNSUPPORTED_MS
      : PROBE_TTL_UNKNOWN_MS;
  cache[key] = {
    providerId,
    baseUrl: String(baseUrl || '').trim(),
    modelId: String(modelId || '').trim(),
    normalizedModelId: normalizeModelId(modelId),
    toolsSupport: toolsSupport || 'unknown',
    capabilitySource,
    updatedAt: Date.now(),
    expiresAt: Date.now() + ttl,
  };
  _probeCache = cache;
  saveProbeCache();
  return cache[key];
}

function validKey(v) {
  return v && typeof v === 'string' && !v.includes('_here') && !v.includes('your_') && v.length > 10;
}

function pickKey(...sources) {
  for (const v of sources) {
    if (validKey(v)) return v;
  }
  return '';
}

/**
 * Gemini OpenAI 兼容层：网关请求使用 `x-goog-api-key`（见 ai.js）；Base URL 若带 ?key= 会与头里 API Key 重复，触发 400。
 */
function sanitizeGoogleOpenAiBaseUrl(url) {
  const s = String(url || '').trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    // 对所有 Google 端点（AI Studio 和 Vertex AI）统一去掉 ?key= 防止双凭证 400
    const isGoogleEndpoint =
      host.includes('generativelanguage.googleapis.com') ||
      host.includes('aiplatform.googleapis.com');
    if (!isGoogleEndpoint) {
      return s.replace(/\/$/, '');
    }
    u.search = '';
    u.hash = '';
    let out = u.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch {
    return s.split('?')[0].split('#')[0].trim().replace(/\/$/, '');
  }
}

// 从 baseUrl 推断 provider id
function inferProviderFromBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') return 'bailian-coding';
  const u = baseUrl.toLowerCase();
  if (u.includes('coding.dashscope')) return 'bailian-coding';
  if (u.includes('dashscope')) return 'bailian';
  if (u.includes('deepseek')) return 'deepseek';
  if (u.includes('siliconflow')) return 'siliconflow';
  if (u.includes('moonshot')) return 'moonshot';
  if (u.includes('groq')) return 'groq';
  if (u.includes('api.openai.com')) return 'openai';
  if (u.includes('localhost:11434') || u.includes('127.0.0.1:11434')) return 'ollama';
  if (u.includes('generativelanguage.googleapis.com')) return 'google';
  if (u && u.length > 10) return 'custom';
  return 'bailian-coding';
}

// Prioritize user settings from Electron config over environment variables
let _currentProvider = _fileConfig.OCT_PROVIDER || process.env.OCT_PROVIDER
  || inferProviderFromBaseUrl(
    _fileConfig.DASHSCOPE_BASE_URL || process.env.DASHSCOPE_BASE_URL || legacyConfig.DASHSCOPE_BASE_URL
  );

// Prioritize user settings from settings panel over .env file
let _currentModel = _fileConfig.OCT_MODEL || process.env.OCT_MODEL || legacyConfig.DASHSCOPE_MODEL || 'qwen-plus';

// 优先级：用户设置(_fileConfig) > 系统环境变量(process.env) > 旧配置
function getEnvOrConfig(key) {
  if (Object.prototype.hasOwnProperty.call(_fileConfig, key)) return _fileConfig[key];
  if (Object.prototype.hasOwnProperty.call(process.env, key)) return process.env[key];
  if (Object.prototype.hasOwnProperty.call(legacyConfig, key)) return legacyConfig[key];
  return '';
}

function readBoolConfig(key, fallback = false) {
  const raw = getEnvOrConfig(key);
  if (raw === '' || raw === null || raw === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

function getProviderConfig() {
  const preset = PROVIDERS[_currentProvider] || PROVIDERS['bailian-coding'];
  const isBailian = preset.id === 'bailian' || preset.id === 'bailian-coding';
  const isDeepseek = preset.id === 'deepseek';
  const isMinimax = preset.id === 'minimax';
  const isGoogle = preset.id === 'google';
  const isCustom = preset.id === 'custom';

  let apiKey = '';
  if (preset.fixedApiKey) {
    apiKey = preset.fixedApiKey;
  } else if (preset.id === 'siliconflow') {
    // 硅基与百炼共用 DASHSCOPE_API_KEY 字段时，易把 sk-sp-（Coding Plan）误带到硅基导致 401。
    // 优先 SILICONFLOW_API_KEY；否则仅当 DASHSCOPE 不像百炼 Coding 前缀时才采用。
    const sfKey = pickKey(
      process.env.SILICONFLOW_API_KEY,
      _fileConfig.SILICONFLOW_API_KEY,
    );
    const dashKey = pickKey(
      _fileConfig.DASHSCOPE_API_KEY,
      process.env.DASHSCOPE_API_KEY,
      legacyConfig.DASHSCOPE_API_KEY,
    );
    const dashLooksCodingPlan = dashKey && String(dashKey).trim().toLowerCase().startsWith('sk-sp-');
    if (sfKey) {
      apiKey = sfKey;
    } else if (dashKey && !dashLooksCodingPlan) {
      apiKey = dashKey;
    } else {
      apiKey = '';
      if (dashLooksCodingPlan) {
        try {
          const { createLogger } = require('./logger');
          createLogger('config').warn(
            'OCT_PROVIDER=siliconflow：DASHSCOPE_API_KEY 为百炼 Coding(sk-sp-)，不能用于硅基。请填写硅基 API Key（设置保存会写入 SILICONFLOW_API_KEY），或编辑 config.json。',
          );
        } catch (_) {
          console.warn('[config] siliconflow: sk-sp- in DASHSCOPE is not valid for api.siliconflow.cn');
        }
      }
    }
  } else if (preset.keyEnvVars && preset.keyEnvVars.length > 0) {
    const sources = preset.keyEnvVars.flatMap(k => [
      process.env[k],
      _fileConfig[k],
      isBailian ? legacyConfig.DASHSCOPE_API_KEY : null,
      isDeepseek ? legacyConfig.DEEPSEEK_API_KEY : null,
      isMinimax ? legacyConfig.MINIMAX_API_KEY : null,
    ].filter(Boolean));
    apiKey = pickKey(...sources);
  }

  let baseUrl = preset.baseUrl || '';
  if (isBailian) {
    baseUrl = getEnvOrConfig('DASHSCOPE_BASE_URL') || preset.baseUrl;
  } else if (isDeepseek) {
    baseUrl = getEnvOrConfig('DEEPSEEK_BASE_URL') || preset.baseUrl;
  } else if (isMinimax) {
    baseUrl = getEnvOrConfig('MINIMAX_BASE_URL') || preset.baseUrl;
  } else if (isGoogle) {
    baseUrl = sanitizeGoogleOpenAiBaseUrl(getEnvOrConfig('GOOGLE_AI_BASE_URL') || preset.baseUrl);
  } else if (isCustom) {
    // 自定义服务：从配置中读取 Base URL 和 API Key
    baseUrl = _fileConfig.CUSTOM_BASE_URL || process.env.CUSTOM_BASE_URL || '';
    apiKey = _fileConfig.CUSTOM_API_KEY || process.env.CUSTOM_API_KEY || '';
  }

  // 处理自定义模型
  let effectiveModel = _currentModel;
  if (isCustom && _fileConfig.CUSTOM_MODEL) {
    effectiveModel = _fileConfig.CUSTOM_MODEL;
  }
  if (isGoogle && _currentModel === '__custom__' && _fileConfig.CUSTOM_MODEL) {
    effectiveModel = String(_fileConfig.CUSTOM_MODEL).trim();
  }
  const customModelSupportsTools = readBoolConfig('CUSTOM_MODEL_SUPPORTS_TOOLS', false);

  let models = preset.models || [];
  if (isCustom && effectiveModel && effectiveModel !== '__custom__') {
    // 如果用户设置了自定义模型，添加到模型列表
    models = [
      {
        id: effectiveModel,
        label: `${effectiveModel} (自定义${customModelSupportsTools ? '，工具开启' : '，工具关闭'})`,
        tools: customModelSupportsTools,
        thinking: false,
      },
      ...models.filter(m => m.id !== effectiveModel)
    ];
  }
  if (isGoogle && effectiveModel && effectiveModel !== '__custom__' && !models.some((m) => m.id === effectiveModel)) {
    models = [
      { id: effectiveModel, label: `${effectiveModel} (自定义)`, tools: false, thinking: false },
      ...models,
    ];
  }
  if (models.length === 0 && preset.defaultModel) {
    const defaultCaps = getModelCaps(preset.defaultModel);
    models = [{
      id: preset.defaultModel,
      label: preset.defaultModel,
      tools: !!defaultCaps.supportsTools,
      thinking: !!defaultCaps.supportsThinking,
    }];
  }
  if (models.length === 0) {
    models = loadAvailableModels().map(m => {
      const caps = getModelCaps(m.id);
      return { id: m.id, label: caps.label, tools: caps.supportsTools, thinking: caps.supportsThinking };
    });
  }

  return {
    ...preset,
    apiKey,
    baseUrl,
    models,
    customModel: isCustom ? effectiveModel : undefined,
    customModelSupportsTools: isCustom ? customModelSupportsTools : undefined,
  };
}

const defaultMemoryConfig = {
  auto_save_history: true,
  auto_save_feedback: true,
  enable_memory_search: true,
  search_cache_ttl: 300,
  search_default_limit: 10,
  max_history_days: 7,
  max_feedback_days: 7,
  load_feedback_on_boot: true,
  compress_length: { user: 100, amy: 200 },
};

const memoryConfig = _fileConfig.memory && typeof _fileConfig.memory === 'object'
  ? { ...defaultMemoryConfig, ..._fileConfig.memory }
  : defaultMemoryConfig;

const config = {
  PORT: parseInt(process.env.OCT_GATEWAY_PORT || '18789', 10),

  DASHSCOPE_API_KEY: pickKey(process.env.DASHSCOPE_API_KEY, _fileConfig.DASHSCOPE_API_KEY, legacyConfig.DASHSCOPE_API_KEY),
  DASHSCOPE_BASE_URL: process.env.DASHSCOPE_BASE_URL || legacyConfig.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1',
  DEEPSEEK_API_KEY: pickKey(process.env.DEEPSEEK_API_KEY, _fileConfig.DEEPSEEK_API_KEY, legacyConfig.DEEPSEEK_API_KEY),
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || legacyConfig.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',

  // 搜索引擎 API Key（优先从 config.json 读取，与主进程保存一致）
  BRAVE_SEARCH_API_KEY: _fileConfig.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || '',
  TAVILY_API_KEY: _fileConfig.TAVILY_API_KEY || process.env.TAVILY_API_KEY || '',

  NOCTURNE_BASE_URL: process.env.NOCTURNE_BASE_URL || _fileConfig.NOCTURNE_BASE_URL || 'http://127.0.0.1:8000',

  AI_LIBRARY_URL: process.env.AI_LIBRARY_URL || _fileConfig.AI_LIBRARY_URL || 'http://127.0.0.1:8001',

  PROMPTS_DIR: process.env.OCT_PROMPTS_DIR || _fileConfig.OCT_PROMPTS_DIR ||
    path.join(__dirname, '..', 'docs', '01_system_prompts'),
  persona: {
    aiName: (process.env.OCT_AI_NAME || _fileConfig.OCT_AI_NAME || 'OpenClaw').trim(),
    userName: (process.env.OCT_USER_NAME || _fileConfig.OCT_USER_NAME || '用户').trim(),
    style: (process.env.OCT_PERSONA_STYLE || _fileConfig.OCT_PERSONA_STYLE || 'warm').trim(),
  },

  availableModels: loadAvailableModels(),

  memory: memoryConfig,
  nocturne: (() => {
    const def = {
      heartbeat_interval_seconds: 300,
      read_retry: { count: 3, interval_ms: 500 },
      write_retry: { count: 3, interval_ms: 500 },
    };
    const fromFile = _fileConfig.nocturne && typeof _fileConfig.nocturne === 'object' ? _fileConfig.nocturne : {};
    return { ...def, ...fromFile };
  })(),
  stream_merge: (() => {
    const def = { min_chars: 1, max_chars: 2, idle_ms: 16 };
    const fromFile = _fileConfig.stream_merge && typeof _fileConfig.stream_merge === 'object' ? _fileConfig.stream_merge : {};
    return { ...def, ...fromFile };
  })(),
  image_analysis: (() => {
    const defaultLocal = {
      enabled: true,
      model_cache_path: './models/blip',
      mirror_host: '',
      timeout_seconds: 30,
    };
    const def = {
      enabled: true,
      provider: 'aliyun_vl',
      timeout_seconds: 30,
      vision_model: 'qwen-vl-max',
      local: defaultLocal,
    };
    const fromFile = _fileConfig.image_analysis && typeof _fileConfig.image_analysis === 'object'
      ? _fileConfig.image_analysis : {};
    const merged = { ...def, ...fromFile };
    if (fromFile.local && typeof fromFile.local === 'object') {
      merged.local = { ...defaultLocal, ...fromFile.local };
    }
    return merged;
  })(),
  ai_library: (() => {
    const def = {
      enabled: true,
      url: 'http://127.0.0.1:8001',
      timeout_ms: 3000,
      default_top_k: 3,
    };
    const fromFile = _fileConfig.ai_library && typeof _fileConfig.ai_library === 'object' ? _fileConfig.ai_library : {};
    return { ...def, ...fromFile };
  })(),

  // MCP Server 配置（由前端设置面板写入 config.json）
  MCP_SERVERS: _fileConfig.mcpServers || {},

  // 视觉 API（独立于主 provider，用于非视觉模型的图片理解）
  VISION_API_KEY: getEnvOrConfig('VISION_API_KEY') || '',
  VISION_BASE_URL: getEnvOrConfig('VISION_BASE_URL') || '',
  VISION_MODEL: getEnvOrConfig('VISION_MODEL') || '',
};

Object.defineProperty(config, 'DASHSCOPE_MODEL', {
  get: () => _currentModel,
  set: (v) => { _currentModel = v; },
  enumerable: true,
});

Object.defineProperty(config, 'currentProvider', {
  get: () => _currentProvider,
  set: (v) => { _currentProvider = v || _currentProvider; },
  enumerable: true,
});

config.getProviderConfig = getProviderConfig;
config.PROVIDERS = PROVIDERS;

try {
  const { createLogger } = require('./logger');
  const log = createLogger('config');
  const pc = getProviderConfig();
  log.info('Active provider', { id: pc.id, name: pc.name });
  log.info('API Key (resolved for chat)', { prefix: pc.apiKey ? pc.apiKey.slice(0, 8) + '***' : 'EMPTY' });
  log.info('Base URL (resolved for chat)', { url: pc.baseUrl });
  log.info('Model', { model: config.DASHSCOPE_MODEL });
  log.debug('DASHSCOPE_API_KEY file prefix', {
    prefix: config.DASHSCOPE_API_KEY ? config.DASHSCOPE_API_KEY.slice(0, 8) + '***' : 'EMPTY',
  });
  log.debug('Available models', { models: config.availableModels.map(m => m.id) });
} catch {}

config.MODEL_REGISTRY = MODEL_REGISTRY;
config.getModelCaps = getModelCaps;
config.getEnvOrConfig = getEnvOrConfig;
config.normalizeModelId = normalizeModelId;
config.detectModelFamily = detectModelFamily;
config.getProbeCacheEntry = getProbeCacheEntry;
config.setProbeCacheEntry = setProbeCacheEntry;

// 向外暴露原始配置对象和路径（供 mcp/manager.js 使用）
config.__fileConfig = _fileConfig;
config._configPath = _configPath;

module.exports = config;
