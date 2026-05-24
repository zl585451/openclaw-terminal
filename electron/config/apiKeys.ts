export type ApiKeyPayload = {
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
  IMAGE_GOOGLE_API_KEY?: string;
  IMAGE_GOOGLE_BASE_URL?: string;
  IMAGE_GOOGLE_MODEL?: string;
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
  OMNIROUTE_BASE_URL?: string;
  OMNIROUTE_API_KEY?: string;
  OMNIROUTE_MODEL?: string;
  OCT_USE_EXTERNAL_OMNIROUTE?: boolean | string;
  CUSTOM_BASE_URL?: string;
  GOOGLE_AI_API_KEY?: string;
  GOOGLE_AI_BASE_URL?: string;
  HTTPS_PROXY?: string;
  HTTP_PROXY?: string;
  BRAVE_SEARCH_API_KEY?: string;
  TAVILY_API_KEY?: string;
  SILICONFLOW_API_KEY?: string;
};

export type ApiKeyConfigDefaults = {
  OPENCLAW_WS_URL: string;
  TTS_MINIMAX_VOICE_ID: string;
};

export function parseEnvContent(envContent: string): Record<string, string> {
  const envObj: Record<string, string> = {};
  for (const line of String(envContent || '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) envObj[key.trim()] = valueParts.join('=').trim();
    }
  }
  return envObj;
}

export const API_KEY_RESTART_KEYS = [
  'OCT_PROVIDER', 'OCT_MODEL', 'SCRIPT_ADAPTER_REAL_AGENTS', 'OPENCLAW_TOKEN', 'CUSTOM_MODEL',
  'DASHSCOPE_BASE_URL', 'DEEPSEEK_BASE_URL', 'MINIMAX_BASE_URL', 'CUSTOM_BASE_URL',
  'DASHSCOPE_API_KEY', 'DEEPSEEK_API_KEY', 'MINIMAX_API_KEY', 'NEWAPI_API_KEY', 'NEWAPI_BASE_URL',
  'CUSTOM_API_KEY', 'GOOGLE_AI_API_KEY', 'GOOGLE_AI_BASE_URL', 'HTTPS_PROXY', 'HTTP_PROXY',
  'BRAVE_SEARCH_API_KEY', 'TAVILY_API_KEY', 'VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL',
  'SILICONFLOW_API_KEY', 'OMNIROUTE_BASE_URL', 'OMNIROUTE_API_KEY', 'OMNIROUTE_MODEL',
  'OMNIROUTE_CHAT_MODEL', 'OMNIROUTE_PLAN_MODEL', 'OMNIROUTE_TOOL_MODEL',
  'OCT_USE_EXTERNAL_OMNIROUTE',
  'IMAGE_PROVIDER', 'IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY', 'IMAGE_API_KEY', 'IMAGE_BASE_URL', 'IMAGE_MODEL',
  'IMAGE_MINIMAX_API_KEY', 'IMAGE_MINIMAX_BASE_URL', 'IMAGE_MINIMAX_MODEL',
  'IMAGE_SILICONFLOW_API_KEY', 'IMAGE_SILICONFLOW_BASE_URL', 'IMAGE_SILICONFLOW_MODEL',
  'IMAGE_OPENAI_API_KEY', 'IMAGE_OPENAI_BASE_URL', 'IMAGE_OPENAI_MODEL',
  'IMAGE_GOOGLE_API_KEY', 'IMAGE_GOOGLE_BASE_URL', 'IMAGE_GOOGLE_MODEL',
  'IMAGE_SIZE',
] as const;

export function parseBooleanConfigValue(raw: unknown): boolean {
  if (raw === true) return true;
  if (raw === false || raw === null || raw === undefined) return false;
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

function assignIfPresent(
  cfg: Record<string, string>,
  keys: ApiKeyPayload,
  key: keyof ApiKeyPayload,
  fallback = '',
): void {
  if (keys[key] !== undefined) {
    cfg[key] = String(keys[key] || fallback);
  }
}

export function applyApiKeyUpdates(
  existingConfig: Record<string, any>,
  keys: ApiKeyPayload,
  defaults: ApiKeyConfigDefaults,
): {
  cfg: Record<string, string>;
  previousCfg: Record<string, string>;
} {
  const cfg: Record<string, string> = { ...existingConfig };
  const previousCfg: Record<string, string> = { ...cfg };

  assignIfPresent(cfg, keys, 'OPENCLAW_WS_URL');
  assignIfPresent(cfg, keys, 'OPENCLAW_TOKEN');
  assignIfPresent(cfg, keys, 'OCT_SETTINGS_MODE');
  assignIfPresent(cfg, keys, 'DASHSCOPE_API_KEY');
  assignIfPresent(cfg, keys, 'DEEPSEEK_API_KEY');
  assignIfPresent(cfg, keys, 'MINIMAX_API_KEY');
  assignIfPresent(cfg, keys, 'MOONSHOT_API_KEY');
  assignIfPresent(cfg, keys, 'NEWAPI_API_KEY');
  assignIfPresent(cfg, keys, 'IMAGE_PROVIDER', 'minimax');
  if (keys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY !== undefined) {
    cfg.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY =
      String(keys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY).toLowerCase() === 'true' ? 'true' : 'false';
  }
  assignIfPresent(cfg, keys, 'IMAGE_API_KEY');
  assignIfPresent(cfg, keys, 'IMAGE_BASE_URL');
  assignIfPresent(cfg, keys, 'IMAGE_MODEL');
  assignIfPresent(cfg, keys, 'IMAGE_MINIMAX_API_KEY');
  assignIfPresent(cfg, keys, 'IMAGE_MINIMAX_BASE_URL');
  assignIfPresent(cfg, keys, 'IMAGE_MINIMAX_MODEL');
  assignIfPresent(cfg, keys, 'IMAGE_SILICONFLOW_API_KEY');
  assignIfPresent(cfg, keys, 'IMAGE_SILICONFLOW_BASE_URL');
  assignIfPresent(cfg, keys, 'IMAGE_SILICONFLOW_MODEL');
  assignIfPresent(cfg, keys, 'IMAGE_OPENAI_API_KEY');
  assignIfPresent(cfg, keys, 'IMAGE_OPENAI_BASE_URL');
  assignIfPresent(cfg, keys, 'IMAGE_OPENAI_MODEL');
  assignIfPresent(cfg, keys, 'IMAGE_GOOGLE_API_KEY');
  assignIfPresent(cfg, keys, 'IMAGE_GOOGLE_BASE_URL');
  assignIfPresent(cfg, keys, 'IMAGE_GOOGLE_MODEL');
  assignIfPresent(cfg, keys, 'IMAGE_SIZE', '1024x1024');
  assignIfPresent(cfg, keys, 'TTS_MINIMAX_VOICE_ID', defaults.TTS_MINIMAX_VOICE_ID);
  assignIfPresent(cfg, keys, 'CUSTOM_API_KEY');
  assignIfPresent(cfg, keys, 'OCT_PROVIDER');
  assignIfPresent(cfg, keys, 'OCT_MODEL');
  assignIfPresent(cfg, keys, 'SCRIPT_ADAPTER_REAL_AGENTS');
  assignIfPresent(cfg, keys, 'CUSTOM_MODEL');
  assignIfPresent(cfg, keys, 'DASHSCOPE_BASE_URL');
  assignIfPresent(cfg, keys, 'DEEPSEEK_BASE_URL');
  assignIfPresent(cfg, keys, 'MINIMAX_BASE_URL');
  assignIfPresent(cfg, keys, 'MOONSHOT_BASE_URL');
  assignIfPresent(cfg, keys, 'NEWAPI_BASE_URL');
  assignIfPresent(cfg, keys, 'CUSTOM_BASE_URL');
  assignIfPresent(cfg, keys, 'GOOGLE_AI_API_KEY');
  assignIfPresent(cfg, keys, 'GOOGLE_AI_BASE_URL');
  assignIfPresent(cfg, keys, 'HTTPS_PROXY');
  assignIfPresent(cfg, keys, 'HTTP_PROXY');
  assignIfPresent(cfg, keys, 'BRAVE_SEARCH_API_KEY');
  assignIfPresent(cfg, keys, 'TAVILY_API_KEY');
  assignIfPresent(cfg, keys, 'SILICONFLOW_API_KEY');
  assignIfPresent(cfg, keys, 'VISION_API_KEY');
  assignIfPresent(cfg, keys, 'VISION_BASE_URL');
  assignIfPresent(cfg, keys, 'VISION_MODEL');
  assignIfPresent(cfg, keys, 'OMNIROUTE_BASE_URL');
  assignIfPresent(cfg, keys, 'OMNIROUTE_API_KEY');
  assignIfPresent(cfg, keys, 'OMNIROUTE_MODEL');
  if (keys.OMNIROUTE_MODEL !== undefined) {
    cfg.OMNIROUTE_CHAT_MODEL = '';
    cfg.OMNIROUTE_PLAN_MODEL = '';
    cfg.OMNIROUTE_TOOL_MODEL = '';
  }
  if (keys.OCT_USE_EXTERNAL_OMNIROUTE !== undefined) {
    cfg.OCT_USE_EXTERNAL_OMNIROUTE = parseBooleanConfigValue(keys.OCT_USE_EXTERNAL_OMNIROUTE) ? 'true' : 'false';
  }

  Object.assign(cfg, {
    OPENCLAW_WS_URL: cfg.OPENCLAW_WS_URL ?? defaults.OPENCLAW_WS_URL,
    OPENCLAW_TOKEN: cfg.OPENCLAW_TOKEN ?? '',
  });

  return { cfg, previousCfg };
}

export function hasConfigChanged(
  previousCfg: Record<string, any>,
  cfg: Record<string, any>,
  key: string,
): boolean {
  return String(previousCfg[key] ?? '') !== String(cfg[key] ?? '');
}

export function didApiConfigChange(
  previousCfg: Record<string, any>,
  cfg: Record<string, any>,
): boolean {
  return API_KEY_RESTART_KEYS.some((key) => hasConfigChanged(previousCfg, cfg, key));
}

export function didConnectionConfigChange(
  previousCfg: Record<string, any>,
  cfg: Record<string, any>,
): boolean {
  return (
    hasConfigChanged(previousCfg, cfg, 'OPENCLAW_WS_URL')
    || hasConfigChanged(previousCfg, cfg, 'OPENCLAW_TOKEN')
    || didApiConfigChange(previousCfg, cfg)
  );
}

export function buildApiKeysData(
  cfg: Record<string, unknown>,
  envObj: Record<string, string>,
  defaults: ApiKeyConfigDefaults,
): Record<string, any> {
  const keys: Record<string, any> = {};
  const pick = (key: string, cfgVal: unknown, fallback = '') => {
    const configValue = (cfgVal ?? '').toString().trim();
    return configValue || (envObj[key] ?? '').toString().trim() || fallback;
  };

  keys.OPENCLAW_WS_URL = pick('OPENCLAW_WS_URL', cfg.OPENCLAW_WS_URL, defaults.OPENCLAW_WS_URL);
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
  keys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY = pick(
    'IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY',
    cfg.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY,
    'false',
  );
  keys.IMAGE_MINIMAX_API_KEY = pick('IMAGE_MINIMAX_API_KEY', cfg.IMAGE_MINIMAX_API_KEY);
  keys.IMAGE_MINIMAX_BASE_URL = pick('IMAGE_MINIMAX_BASE_URL', cfg.IMAGE_MINIMAX_BASE_URL);
  keys.IMAGE_MINIMAX_MODEL = pick('IMAGE_MINIMAX_MODEL', cfg.IMAGE_MINIMAX_MODEL);
  keys.IMAGE_SILICONFLOW_API_KEY = pick('IMAGE_SILICONFLOW_API_KEY', cfg.IMAGE_SILICONFLOW_API_KEY);
  keys.IMAGE_SILICONFLOW_BASE_URL = pick('IMAGE_SILICONFLOW_BASE_URL', cfg.IMAGE_SILICONFLOW_BASE_URL);
  keys.IMAGE_SILICONFLOW_MODEL = pick('IMAGE_SILICONFLOW_MODEL', cfg.IMAGE_SILICONFLOW_MODEL);
  keys.IMAGE_OPENAI_API_KEY = pick('IMAGE_OPENAI_API_KEY', cfg.IMAGE_OPENAI_API_KEY);
  keys.IMAGE_OPENAI_BASE_URL = pick('IMAGE_OPENAI_BASE_URL', cfg.IMAGE_OPENAI_BASE_URL);
  keys.IMAGE_OPENAI_MODEL = pick('IMAGE_OPENAI_MODEL', cfg.IMAGE_OPENAI_MODEL);
  keys.IMAGE_GOOGLE_API_KEY = pick('IMAGE_GOOGLE_API_KEY', cfg.IMAGE_GOOGLE_API_KEY);
  keys.IMAGE_GOOGLE_BASE_URL = pick('IMAGE_GOOGLE_BASE_URL', cfg.IMAGE_GOOGLE_BASE_URL);
  keys.IMAGE_GOOGLE_MODEL = pick('IMAGE_GOOGLE_MODEL', cfg.IMAGE_GOOGLE_MODEL);
  const imageProvider = (keys.IMAGE_PROVIDER || 'minimax').toLowerCase();
  const providerPrefix = imageProvider === 'siliconflow'
    ? 'SILICONFLOW'
    : imageProvider === 'openai'
      ? 'OPENAI'
      : imageProvider === 'google'
        ? 'GOOGLE'
        : 'MINIMAX';
  keys.IMAGE_API_KEY = keys[`IMAGE_${providerPrefix}_API_KEY`] || pick('IMAGE_API_KEY', cfg.IMAGE_API_KEY);
  keys.IMAGE_BASE_URL = keys[`IMAGE_${providerPrefix}_BASE_URL`] || pick('IMAGE_BASE_URL', cfg.IMAGE_BASE_URL);
  keys.IMAGE_MODEL = keys[`IMAGE_${providerPrefix}_MODEL`] || pick('IMAGE_MODEL', cfg.IMAGE_MODEL);
  keys.IMAGE_SIZE = pick('IMAGE_SIZE', cfg.IMAGE_SIZE, '1024x1024');
  keys.TTS_MINIMAX_VOICE_ID = pick('TTS_MINIMAX_VOICE_ID', cfg.TTS_MINIMAX_VOICE_ID, defaults.TTS_MINIMAX_VOICE_ID);
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
  keys.OMNIROUTE_BASE_URL = pick('OMNIROUTE_BASE_URL', cfg.OMNIROUTE_BASE_URL);
  keys.OMNIROUTE_API_KEY = pick('OMNIROUTE_API_KEY', cfg.OMNIROUTE_API_KEY);
  keys.OMNIROUTE_MODEL =
    pick('OMNIROUTE_MODEL', cfg.OMNIROUTE_MODEL)
    || pick('OMNIROUTE_CHAT_MODEL', cfg.OMNIROUTE_CHAT_MODEL);
  keys.OCT_USE_EXTERNAL_OMNIROUTE = parseBooleanConfigValue(
    cfg.OCT_USE_EXTERNAL_OMNIROUTE ?? envObj.OCT_USE_EXTERNAL_OMNIROUTE,
  );

  return {
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
    IMAGE_GOOGLE_API_KEY: keys.IMAGE_GOOGLE_API_KEY || '',
    IMAGE_GOOGLE_BASE_URL: keys.IMAGE_GOOGLE_BASE_URL || '',
    IMAGE_GOOGLE_MODEL: keys.IMAGE_GOOGLE_MODEL || '',
    IMAGE_SIZE: keys.IMAGE_SIZE || '1024x1024',
    TTS_MINIMAX_VOICE_ID: keys.TTS_MINIMAX_VOICE_ID || defaults.TTS_MINIMAX_VOICE_ID,
    CUSTOM_API_KEY: keys.CUSTOM_API_KEY || '',
    OPENCLAW_WS_URL: keys.OPENCLAW_WS_URL || defaults.OPENCLAW_WS_URL,
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
    OMNIROUTE_BASE_URL: keys.OMNIROUTE_BASE_URL || '',
    OMNIROUTE_API_KEY: keys.OMNIROUTE_API_KEY || '',
    OMNIROUTE_MODEL: keys.OMNIROUTE_MODEL || '',
    OCT_USE_EXTERNAL_OMNIROUTE: !!keys.OCT_USE_EXTERNAL_OMNIROUTE,
  };
}
