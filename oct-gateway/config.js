const path = require('path');
const fs = require('fs');
const os = require('os');
const { PROVIDERS } = require('./providers');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

// 网络配置：DashScope 是国内服务，强制不走代理
// 启动时清理可能影响直连的代理环境变量
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  console.log('[Config] 检测到系统代理，已配置 DashScope 直连');
  const existing = process.env.NO_PROXY || '';
  const dashscopeDomains = 'dashscope.aliyuncs.com,dashscope-intl.aliyuncs.com,coding.dashscope.aliyuncs.com';
  process.env.NO_PROXY = existing
    ? `${existing},${dashscopeDomains}`
    : dashscopeDomains;
  console.log('[Config] NO_PROXY 已更新:', process.env.NO_PROXY);
}

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
    supportsThinking: false,
    maxTokens: 8192,
  },
  'MiniMax-M2.7-highspeed': {
    provider: 'minimax',
    label: 'MiniMax M2.7 极速版（100tps）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 8192,
  },
  'MiniMax-M2.5-standalone': {
    provider: 'minimax',
    label: 'MiniMax M2.5（顶尖性能）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 8192,
  },
  'MiniMax-M2.5-highspeed': {
    provider: 'minimax',
    label: 'MiniMax M2.5 极速版（100tps）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 8192,
  },
  'MiniMax-M2.1': {
    provider: 'minimax',
    label: 'MiniMax M2.1（多语言编程）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'MiniMax-M2.1-highspeed': {
    provider: 'minimax',
    label: 'MiniMax M2.1 极速版（100tps）',
    supportsTools: true,
    supportsStreamOptions: true,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'MiniMax-M2': {
    provider: 'minimax',
    label: 'MiniMax M2（高效编码）',
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

const _fileConfig = loadConfigFile();
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

// Prioritize user settings from Electron config over environment variables
let _currentProvider = _fileConfig.OCT_PROVIDER || process.env.OCT_PROVIDER
  || inferProviderFromBaseUrl(
    _fileConfig.DASHSCOPE_BASE_URL || process.env.DASHSCOPE_BASE_URL || legacyConfig.DASHSCOPE_BASE_URL
  );

// Prioritize user settings from settings panel over .env file
let _currentModel = _fileConfig.OCT_MODEL || process.env.OCT_MODEL || legacyConfig.DASHSCOPE_MODEL || 'qwen-plus';

function getEnvOrConfig(key) {
  return process.env[key] || _fileConfig[key] || legacyConfig[key] || '';
}

function getProviderConfig() {
  const preset = PROVIDERS[_currentProvider] || PROVIDERS['bailian-coding'];
  const isBailian = preset.id === 'bailian' || preset.id === 'bailian-coding';
  const isDeepseek = preset.id === 'deepseek';
  const isMinimax = preset.id === 'minimax';

  let apiKey = '';
  if (preset.fixedApiKey) {
    apiKey = preset.fixedApiKey;
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
    const def = { min_chars: 1, max_chars: 3, idle_ms: 30 };
    const fromFile = _fileConfig.stream_merge && typeof _fileConfig.stream_merge === 'object' ? _fileConfig.stream_merge : {};
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

// 向外暴露原始配置对象和路径（供 mcp/manager.js 使用）
config.__fileConfig = _fileConfig;
config._configPath = _configPath;

module.exports = config;
