const path = require('path');
const fs = require('fs');
const os = require('os');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

function loadConfigFile() {
  const configFile = process.env.OCT_CONFIG_FILE;
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
    return [
      { id: 'qwen3.5-plus', provider: 'bailian' },
      { id: 'qwen3-max-2026-01-23', provider: 'bailian' },
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

let _currentModel = process.env.OCT_MODEL || fileConfig.OCT_MODEL || legacyConfig.DASHSCOPE_MODEL || 'qwen-plus';

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

  NOCTURNE_BASE_URL: 'http://127.0.0.1:8000',

  PROMPTS_DIR: process.env.OCT_PROMPTS_DIR || fileConfig.OCT_PROMPTS_DIR ||
    path.join(__dirname, '..', 'docs', '01_system_prompts'),

  availableModels: loadAvailableModels(),

  memory: memoryConfig,
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
};

Object.defineProperty(config, 'DASHSCOPE_MODEL', {
  get: () => _currentModel,
  set: (v) => { _currentModel = v; },
  enumerable: true,
});

try {
  const { createLogger } = require('./logger');
  const log = createLogger('config');
  log.info('API Key', { prefix: config.DASHSCOPE_API_KEY ? config.DASHSCOPE_API_KEY.slice(0, 8) + '***' : 'EMPTY' });
  log.info('Base URL', { url: config.DASHSCOPE_BASE_URL });
  log.info('Model', { model: config.DASHSCOPE_MODEL });
  log.debug('Available models', { models: config.availableModels.map(m => m.id) });
} catch {}

module.exports = config;
