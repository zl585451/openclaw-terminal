const path = require('path');
const fs = require('fs');
const os = require('os');
const { PROVIDERS } = require('./providers');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

function loadConfigFile() {
  const configFile = process.env.OCT_CONFIG_FILE || path.join(__dirname, 'config.json');
  if (configFile && fs.existsSync(configFile)) {
    try {
      return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch {}
  }
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
};

// 查询模型能力，未注册的模型返回安全默认值
function getModelCaps(modelId) {
  // 精确匹配
  if (MODEL_REGISTRY[modelId]) return MODEL_REGISTRY[modelId];
  // 前缀模糊匹配（处理带日期后缀的模型名如 qwen3-max-2026-01-23）
  for (const [key, caps] of Object.entries(MODEL_REGISTRY)) {
    if (modelId.startsWith(key)) return { ...caps, label: modelId };
  }
  // 未知模型 → 保守默认（不发 tools，避免报错）
  return {
    provider: 'unknown',
    label: modelId,
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: false,
    maxTokens: 4096,
  };
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

const fileConfig = loadConfigFile();
const legacyConfig = loadOpenClawLegacyConfig();

function validKey(v) {
  return v && typeof v === 'string' && !v.includes('_here') && !v.includes('your_') && v.length > 10;
}

function pickKey(...sources) {
  for (const v of sources) {
    if (validKey(v)) return v;
  }
  return '';
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
  if (u && u.length > 10) return 'custom';
  return 'bailian-coding';
}

let _currentProvider = process.env.OCT_PROVIDER || fileConfig.OCT_PROVIDER
  || inferProviderFromBaseUrl(
    process.env.DASHSCOPE_BASE_URL || fileConfig.DASHSCOPE_BASE_URL || legacyConfig.DASHSCOPE_BASE_URL
  );

let _currentModel = process.env.OCT_MODEL || fileConfig.OCT_MODEL || legacyConfig.DASHSCOPE_MODEL || 'qwen-plus';

function getEnvOrConfig(key) {
  return process.env[key] || fileConfig[key] || legacyConfig[key] || '';
}

function getProviderConfig() {
  const preset = PROVIDERS[_currentProvider] || PROVIDERS['bailian-coding'];
  const isBailian = preset.id === 'bailian' || preset.id === 'bailian-coding';
  const isDeepseek = preset.id === 'deepseek';

  let apiKey = '';
  if (preset.fixedApiKey) {
    apiKey = preset.fixedApiKey;
  } else if (preset.keyEnvVars && preset.keyEnvVars.length > 0) {
    const sources = preset.keyEnvVars.flatMap(k => [
      process.env[k],
      fileConfig[k],
      isBailian ? legacyConfig.DASHSCOPE_API_KEY : null,
      isDeepseek ? legacyConfig.DEEPSEEK_API_KEY : null,
    ].filter(Boolean));
    apiKey = pickKey(...sources);
  }

  let baseUrl = preset.baseUrl || '';
  if (isBailian) {
    baseUrl = getEnvOrConfig('DASHSCOPE_BASE_URL') || preset.baseUrl;
  } else if (isDeepseek) {
    baseUrl = getEnvOrConfig('DEEPSEEK_BASE_URL') || preset.baseUrl;
  } else if (preset.id === 'custom') {
    baseUrl = getEnvOrConfig('DASHSCOPE_BASE_URL') || '';
  }

  let models = preset.models || [];
  if (models.length === 0 && preset.defaultModel) {
    models = [{ id: preset.defaultModel, label: preset.defaultModel, tools: true, thinking: false }];
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

const memoryConfig = fileConfig.memory && typeof fileConfig.memory === 'object'
  ? { ...defaultMemoryConfig, ...fileConfig.memory }
  : defaultMemoryConfig;

const config = {
  PORT: parseInt(process.env.OCT_GATEWAY_PORT || '18789', 10),

  DASHSCOPE_API_KEY: pickKey(process.env.DASHSCOPE_API_KEY, fileConfig.DASHSCOPE_API_KEY, legacyConfig.DASHSCOPE_API_KEY),
  DASHSCOPE_BASE_URL: process.env.DASHSCOPE_BASE_URL || legacyConfig.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1',
  DEEPSEEK_API_KEY: pickKey(process.env.DEEPSEEK_API_KEY, fileConfig.DEEPSEEK_API_KEY, legacyConfig.DEEPSEEK_API_KEY),
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || legacyConfig.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',

  NOCTURNE_BASE_URL: process.env.NOCTURNE_BASE_URL || fileConfig.NOCTURNE_BASE_URL || 'http://127.0.0.1:8000',

  AI_LIBRARY_URL: process.env.AI_LIBRARY_URL || fileConfig.AI_LIBRARY_URL || 'http://127.0.0.1:8001',

  PROMPTS_DIR: process.env.OCT_PROMPTS_DIR || fileConfig.OCT_PROMPTS_DIR ||
    path.join(__dirname, '..', 'docs', '01_system_prompts'),

  availableModels: loadAvailableModels(),

  memory: memoryConfig,
  nocturne: (() => {
    const def = {
      heartbeat_interval_seconds: 300,
      read_retry: { count: 3, interval_ms: 500 },
      write_retry: { count: 3, interval_ms: 500 },
    };
    const fromFile = fileConfig.nocturne && typeof fileConfig.nocturne === 'object' ? fileConfig.nocturne : {};
    return { ...def, ...fromFile };
  })(),
  stream_merge: (() => {
    const def = { min_chars: 200, max_chars: 2000, idle_ms: 500 };
    const fromFile = fileConfig.stream_merge && typeof fileConfig.stream_merge === 'object' ? fileConfig.stream_merge : {};
    return { ...def, ...fromFile };
  })(),
  image_analysis: (() => {
    const defaultLocal = {
      enabled: true,
      model_cache_path: './models/blip',
      timeout_seconds: 30,
    };
    const def = {
      enabled: true,
      provider: 'aliyun_vl',
      timeout_seconds: 30,
      vision_model: 'qwen-vl-max',
      local: defaultLocal,
    };
    const fromFile = fileConfig.image_analysis && typeof fileConfig.image_analysis === 'object'
      ? fileConfig.image_analysis : {};
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
    const fromFile = fileConfig.ai_library && typeof fileConfig.ai_library === 'object' ? fileConfig.ai_library : {};
    return { ...def, ...fromFile };
  })(),
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
  log.info('API Key', { prefix: config.DASHSCOPE_API_KEY ? config.DASHSCOPE_API_KEY.slice(0, 8) + '***' : 'EMPTY' });
  log.info('Base URL', { url: config.DASHSCOPE_BASE_URL });
  log.info('Model', { model: config.DASHSCOPE_MODEL });
  log.debug('Available models', { models: config.availableModels.map(m => m.id) });
} catch {}

config.MODEL_REGISTRY = MODEL_REGISTRY;
config.getModelCaps = getModelCaps;

module.exports = config;
