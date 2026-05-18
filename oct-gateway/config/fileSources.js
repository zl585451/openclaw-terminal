'use strict';

function getRuntimeConfigSources({ env, path, os, configDir }) {
  return [
    env.OCT_CONFIG_FILE,
    path.join(os.homedir(), 'AppData', 'Roaming', 'openclaw-terminal', 'config.json'),
    path.join(os.homedir(), 'Library', 'Application Support', 'openclaw-terminal', 'config.json'),
    path.join(os.homedir(), '.config', 'openclaw-terminal', 'config.json'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'OpenClaw Terminal', 'config.json'),
    path.join(configDir, 'config.json'),
  ].filter(Boolean);
}

function loadConfigFile({ env, fs, path, os, configDir, logger = console }) {
  const configSources = getRuntimeConfigSources({ env, path, os, configDir });
  for (const configFile of configSources) {
    if (fs.existsSync(configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        logger.log(`[Config] Loaded config from: ${configFile}`);
        return config;
      } catch (err) {
        logger.warn(`[Config] Failed to parse ${configFile}:`, err.message);
      }
    }
  }

  logger.log('[Config] No config file found, using defaults');
  return {};
}

function loadGoogleScopedConfig({ env, fs, path, configDir, logger = console }) {
  const googleScopedKeys = new Set([
    'GOOGLE_AI_API_KEY',
    'GOOGLE_AI_BASE_URL',
    'GOOGLE_HTTPS_PROXY',
    'GOOGLE_TOOLS_MODE',
    'GOOGLE_API_MODE',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_LOCATION',
    'GOOGLE_GENAI_API_VERSION',
  ]);

  const customPath = String(env.OCT_GOOGLE_CONFIG_FILE || '').trim();
  const defaultPath = path.join(configDir, 'google.profile.json');
  const candidates = [customPath, defaultPath].filter(Boolean);
  for (const cfgPath of candidates) {
    if (!fs.existsSync(cfgPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (!parsed || typeof parsed !== 'object') continue;
      const picked = {};
      for (const key of googleScopedKeys) {
        if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue;
        const value = parsed[key];
        if (typeof value === 'string') {
          if (!value.trim()) continue;
          picked[key] = value;
          continue;
        }
        if (value !== null && value !== undefined) picked[key] = value;
      }
      if (Object.keys(picked).length > 0) {
        logger.log(`[Config] Loaded google scoped config from: ${cfgPath}`);
        return picked;
      }
    } catch (err) {
      logger.warn(`[Config] Failed to parse google scoped config ${cfgPath}:`, err.message);
    }
  }
  return {};
}

function resolveConfigPath({ env, fs, path, os, configDir }) {
  const configSources = getRuntimeConfigSources({ env, path, os, configDir });
  for (const configFile of configSources) {
    if (fs.existsSync(configFile)) return configFile;
  }
  return null;
}

function createOpenClawConfigReader({ fs, path, os }) {
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
    const providers = cfg?.models?.providers || {};
    const bailian = providers.bailian || providers.dashscope || providers.qwen || {};
    const deepseek = providers.deepseek || {};
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

  return {
    loadOpenClawJson,
    loadOpenClawLegacyConfig,
  };
}

module.exports = {
  createOpenClawConfigReader,
  getRuntimeConfigSources,
  loadConfigFile,
  loadGoogleScopedConfig,
  resolveConfigPath,
};
