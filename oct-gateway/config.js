const path = require('path');
const fs = require('fs');
const os = require('os');
const { PROVIDERS } = require('./providers');
const { DEFAULT_AGENT_PERMISSIONS, normalizeAgentPermissions } = require('./config/agentPermissions');
const {
  createOpenClawConfigReader,
  loadConfigFile,
  loadGoogleScopedConfig,
  resolveConfigPath,
} = require('./config/fileSources');
const { buildMemoryConfig } = require('./config/memoryConfig');
const { createModelRegistryHelpers } = require('./config/modelRegistry');
const { createProbeCacheStore } = require('./config/probeCache');
const {
  createConfigValueReaders,
  createProviderConfigResolver,
  inferProviderFromBaseUrl,
  pickKey,
} = require('./config/providerRuntime');
const { sanitizeGoogleOpenAiBaseUrl } = require('./shared/googleBaseUrl.js');

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

const openClawConfigReader = createOpenClawConfigReader({ fs, path, os });
const {
  MODEL_REGISTRY,
  detectModelFamily,
  getModelCaps,
  loadAvailableModels,
  normalizeModelId,
} = createModelRegistryHelpers({
  loadOpenClawJson: () => openClawConfigReader.loadOpenClawJson(),
});
const _baseFileConfig = loadConfigFile({ env: process.env, fs, path, os, configDir: __dirname });
const _googleScopedConfig = loadGoogleScopedConfig({ env: process.env, fs, path, configDir: __dirname });
const _fileConfig = { ..._baseFileConfig, ..._googleScopedConfig };

// 出站代理：设置面板（用户 config.json）优先于 .env/系统环境，避免旧环境变量覆盖用户最新设置
(function applyProxyFromRuntimeConfig() {
  const pairs = [
    ['HTTPS_PROXY', _fileConfig.HTTPS_PROXY],
    ['HTTP_PROXY', _fileConfig.HTTP_PROXY],
  ];
  for (const [key, cfgVal] of pairs) {
    const fromCfg = cfgVal != null ? String(cfgVal).trim() : '';
    const fromEnv = String(process.env[key] || '').trim();
    if (fromCfg) {
      process.env[key] = fromCfg;
      process.env[key.toLowerCase()] = fromCfg;
      continue;
    }
    if (fromEnv) {
      process.env[key] = fromEnv;
      process.env[key.toLowerCase()] = fromEnv;
    }
  }
})();

// 记录第一个命中的配置文件路径，用于 mcp/manager 写入
const _configPath = resolveConfigPath({ env: process.env, fs, path, os, configDir: __dirname });
const legacyConfig = openClawConfigReader.loadOpenClawLegacyConfig();

// Prioritize user settings from Electron config over environment variables
let _currentProvider = _fileConfig.OCT_PROVIDER || process.env.OCT_PROVIDER
  || inferProviderFromBaseUrl(
    _fileConfig.DASHSCOPE_BASE_URL || process.env.DASHSCOPE_BASE_URL || legacyConfig.DASHSCOPE_BASE_URL
  );

// Prioritize user settings from settings panel over .env file
let _currentModel = _fileConfig.OCT_MODEL || process.env.OCT_MODEL || legacyConfig.DASHSCOPE_MODEL || 'qwen-plus';

const readers = createConfigValueReaders({
  fileConfig: _fileConfig,
  env: process.env,
  legacyConfig,
});
const {
  getEnvOrConfig,
  readBoolConfig,
  readPositiveIntConfig,
  readOptionalBoolConfig,
} = readers;
const getProviderConfig = createProviderConfigResolver({
  providers: PROVIDERS,
  fileConfig: _fileConfig,
  env: process.env,
  legacyConfig,
  getCurrentProvider: () => _currentProvider,
  getCurrentModel: () => _currentModel,
  getModelCaps,
  loadAvailableModels,
  sanitizeGoogleOpenAiBaseUrl,
  createLogger: require('./logger').createLogger,
  readers,
});

const memoryConfig = buildMemoryConfig({
  fileConfig: _fileConfig,
  env: process.env,
  pathModule: path,
  osModule: os,
});
const probeCacheStore = createProbeCacheStore({
  fs,
  path,
  os,
  configPath: _configPath,
  normalizeModelId,
});

const config = {
  PORT: parseInt(process.env.OCT_GATEWAY_PORT || '18789', 10),
  ENABLE_BACKGROUND_TASK_DISPATCH: readBoolConfig('ENABLE_BACKGROUND_TASK_DISPATCH', false),
  toolResultSummarizer: {
    enabled: readBoolConfig('TOOL_RESULT_SUMMARIZER_ENABLED', false),
    triggerChars: readPositiveIntConfig('TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS', 2400),
    targetChars: readPositiveIntConfig('TOOL_RESULT_SUMMARIZER_TARGET_CHARS', 600),
    fallbackKeepChars: readPositiveIntConfig('TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP', 1500),
    tools: String(getEnvOrConfig('TOOL_RESULT_SUMMARIZER_TOOLS') || '').trim(),
  },

  DASHSCOPE_API_KEY: pickKey(_fileConfig.DASHSCOPE_API_KEY, process.env.DASHSCOPE_API_KEY, legacyConfig.DASHSCOPE_API_KEY),
  DASHSCOPE_BASE_URL: getEnvOrConfig('DASHSCOPE_BASE_URL') || legacyConfig.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1',
  DEEPSEEK_API_KEY: pickKey(_fileConfig.DEEPSEEK_API_KEY, process.env.DEEPSEEK_API_KEY, legacyConfig.DEEPSEEK_API_KEY),
  DEEPSEEK_BASE_URL: getEnvOrConfig('DEEPSEEK_BASE_URL') || legacyConfig.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  NEWAPI_API_KEY: pickKey(_fileConfig.NEWAPI_API_KEY, process.env.NEWAPI_API_KEY),
  NEWAPI_BASE_URL: getEnvOrConfig('NEWAPI_BASE_URL') || 'http://127.0.0.1:3000/v1',

  // 搜索引擎 API Key（优先从 config.json 读取，与主进程保存一致）
  BRAVE_SEARCH_API_KEY: _fileConfig.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || '',
  TAVILY_API_KEY: _fileConfig.TAVILY_API_KEY || process.env.TAVILY_API_KEY || '',
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
        knowledge_search_enabled: false,
      };
    const fromFile = _fileConfig.ai_library && typeof _fileConfig.ai_library === 'object' ? _fileConfig.ai_library : {};
    return { ...def, ...fromFile };
  })(),

  /** 内容创作 script_adapter：真实 LLM 开关与专用端点（空则走 SUMMARIZER_* / 当前 provider） */
  scriptAdapter: (() => {
    const def = {
      realAgents: String(getEnvOrConfig('SCRIPT_ADAPTER_REAL_AGENTS') || '').trim(),
      baseUrl: String(getEnvOrConfig('SCRIPT_ADAPTER_BASE_URL') || '').trim(),
      apiKey: String(getEnvOrConfig('SCRIPT_ADAPTER_API_KEY') || '').trim(),
      model: String(getEnvOrConfig('SCRIPT_ADAPTER_MODEL') || '').trim(),
      textPipeline: String(getEnvOrConfig('SCRIPT_ADAPTER_TEXT_PIPELINE') || '').trim(),
    };
    const fromFile = _fileConfig.scriptAdapter && typeof _fileConfig.scriptAdapter === 'object' ? _fileConfig.scriptAdapter : {};
    return { ...def, ...fromFile };
  })(),

  // MCP Server 配置（由前端设置面板写入 config.json）
  MCP_SERVERS: _fileConfig.mcpServers || {},
  AGENT_PERMISSIONS: normalizeAgentPermissions(_fileConfig.AGENT_PERMISSIONS || DEFAULT_AGENT_PERMISSIONS),

  // 视觉 API（独立于主 provider，用于非视觉模型的图片理解）
  VISION_API_KEY: getEnvOrConfig('VISION_API_KEY') || '',
  VISION_BASE_URL: getEnvOrConfig('VISION_BASE_URL') || '',
  VISION_MODEL: getEnvOrConfig('VISION_MODEL') || '',

  // Google 专用运行时开关（不影响其他 provider）
  GOOGLE_HTTPS_PROXY: getEnvOrConfig('GOOGLE_HTTPS_PROXY') || '',
  GOOGLE_TOOLS_MODE: (() => {
    const raw = String(getEnvOrConfig('GOOGLE_TOOLS_MODE') || '').trim().toLowerCase();
    if (raw === 'on' || raw === 'off' || raw === 'auto') return raw;
    return 'auto';
  })(),
  GOOGLE_API_MODE: (() => {
    const raw = String(getEnvOrConfig('GOOGLE_API_MODE') || '').trim().toLowerCase();
    return raw || 'native';
  })(),
  GOOGLE_CLOUD_PROJECT: getEnvOrConfig('GOOGLE_CLOUD_PROJECT') || '',
  GOOGLE_CLOUD_LOCATION: getEnvOrConfig('GOOGLE_CLOUD_LOCATION') || '',
  GOOGLE_GENAI_API_VERSION: getEnvOrConfig('GOOGLE_GENAI_API_VERSION') || '',
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
  log.info('Summarizer enabled', { enabled: config.memory.summarizer.enabled });
  log.info('Summarizer model', { model: config.memory.summarizer.api.model || 'EMPTY' });
  log.info('VectorRecall enabled', { enabled: config.memory.vectorRecall.enabled });
  log.info('Embedding model', { model: config.memory.vectorRecall.embedding.model || 'EMPTY' });
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
config.getProbeCacheEntry = probeCacheStore.getProbeCacheEntry;
config.setProbeCacheEntry = probeCacheStore.setProbeCacheEntry;
config.normalizeAgentPermissions = normalizeAgentPermissions;
config.DEFAULT_AGENT_PERMISSIONS = DEFAULT_AGENT_PERMISSIONS;
config.setAgentPermissions = (nextPermissions) => {
  const normalized = normalizeAgentPermissions(nextPermissions);
  config.AGENT_PERMISSIONS = normalized;
  if (config.__fileConfig && typeof config.__fileConfig === 'object') {
    config.__fileConfig.AGENT_PERMISSIONS = normalized;
  }
  return normalized;
};

// 向外暴露原始配置对象和路径（供 mcp/manager.js 使用）
config.__fileConfig = _fileConfig;
config._configPath = _configPath;

module.exports = config;
