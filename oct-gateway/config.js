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
  'kimi-k2.6': {
    provider: 'bailian',
    label: 'Kimi K2.6（月之暗面）',
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
  'deepseek-v4-flash': {
    provider: 'deepseek',
    label: 'DeepSeek V4 Flash（通用，推荐）',
    supportsTools: true,
    supportsStreamOptions: false,  // DeepSeek 官方不支持
    supportsThinking: false,
    maxTokens: 8192,
  },
  'deepseek-v4-pro': {
    provider: 'deepseek',
    label: 'DeepSeek V4 Pro（深度推理）',
    supportsTools: false,
    supportsStreamOptions: false,
    supportsThinking: true,
    maxTokens: 8192,
  },
  'deepseek-chat': {
    provider: 'deepseek',
    label: 'DeepSeek Chat（旧版，2026/07/24 弃用）',
    supportsTools: true,
    supportsStreamOptions: false,
    supportsThinking: false,
    maxTokens: 4096,
  },
  'deepseek-reasoner': {
    provider: 'deepseek',
    label: 'DeepSeek Reasoner（旧版，2026/07/24 弃用）',
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
  'gemini-3.1-flash-lite-preview': {
    provider: 'google',
    label: 'Gemini 3.1 Flash-Lite Preview',
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

function normalizeToolReliability(raw, { toolsSupport, provider } = {}) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'strict' || value === 'loose' || value === 'none') {
    return value;
  }
  if (toolsSupport !== 'supported') {
    return 'none';
  }
  const strictProviders = new Set(['bailian', 'deepseek', 'minimax']);
  return strictProviders.has(String(provider || '').toLowerCase()) ? 'strict' : 'loose';
}

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
    toolReliability: normalizeToolReliability(caps?.toolReliability, {
      toolsSupport,
      provider: caps?.provider,
    }),
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
  const cfg = openClawConfigReader.loadOpenClawJson();
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
      { id: 'kimi-k2.6', provider: 'bailian' },
      { id: 'kimi-k2.5', provider: 'bailian' },
      { id: 'MiniMax-M2.5', provider: 'bailian' },
      { id: 'glm-5', provider: 'bailian' },
      { id: 'glm-4.7', provider: 'bailian' },
      { id: 'deepseek-v4-flash', provider: 'deepseek' },
      { id: 'deepseek-v4-pro',   provider: 'deepseek' },
      { id: 'deepseek-chat',     provider: 'deepseek' },
    ];
  }
  return models;
}

const openClawConfigReader = createOpenClawConfigReader({ fs, path, os });
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
