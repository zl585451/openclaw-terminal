function readConfig(config, key, fallback = '') {
  const value = config?.getEnvOrConfig?.(key);
  return value || fallback;
}

function resolveImageBaseUrl(config, provider) {
  const explicitBaseUrl = String(readConfig(config, 'IMAGE_BASE_URL')).trim();
  if (explicitBaseUrl) return explicitBaseUrl;
  if (provider === 'openai') return 'https://api.openai.com';
  if (provider === 'siliconflow') return 'https://api.siliconflow.cn/v1';
  if (provider === 'google') return readConfig(config, 'GOOGLE_AI_BASE_URL');
  return 'https://api.minimax.chat';
}

function resolveImageModel(config, provider) {
  const explicitModel = readConfig(config, 'IMAGE_MODEL');
  if (explicitModel) return explicitModel;
  if (provider === 'siliconflow') return 'Kwai-Kolors/Kolors';
  if (provider === 'openai') return 'dall-e-3';
  if (provider === 'google') return 'gemini-3.1-flash-image-preview';
  return 'image-01';
}

function buildImageGenerationConfig(config) {
  const provider = String(readConfig(config, 'IMAGE_PROVIDER', 'minimax')).trim().toLowerCase();
  const imageProvider = provider || 'minimax';

  return {
    IMAGE_PROVIDER: imageProvider,
    IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: readConfig(config, 'IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY', 'false'),
    IMAGE_API_KEY: readConfig(config, 'IMAGE_API_KEY'),
    IMAGE_BASE_URL: resolveImageBaseUrl(config, imageProvider),
    IMAGE_MODEL: resolveImageModel(config, imageProvider),
    IMAGE_MINIMAX_API_KEY: readConfig(config, 'IMAGE_MINIMAX_API_KEY'),
    IMAGE_MINIMAX_BASE_URL: readConfig(config, 'IMAGE_MINIMAX_BASE_URL'),
    IMAGE_MINIMAX_MODEL: readConfig(config, 'IMAGE_MINIMAX_MODEL'),
    IMAGE_SILICONFLOW_API_KEY: readConfig(config, 'IMAGE_SILICONFLOW_API_KEY'),
    IMAGE_SILICONFLOW_BASE_URL: readConfig(config, 'IMAGE_SILICONFLOW_BASE_URL'),
    IMAGE_SILICONFLOW_MODEL: readConfig(config, 'IMAGE_SILICONFLOW_MODEL'),
    IMAGE_OPENAI_API_KEY: readConfig(config, 'IMAGE_OPENAI_API_KEY'),
    IMAGE_OPENAI_BASE_URL: readConfig(config, 'IMAGE_OPENAI_BASE_URL'),
    IMAGE_OPENAI_MODEL: readConfig(config, 'IMAGE_OPENAI_MODEL'),
    IMAGE_GOOGLE_API_KEY: readConfig(config, 'IMAGE_GOOGLE_API_KEY'),
    IMAGE_GOOGLE_BASE_URL: readConfig(config, 'IMAGE_GOOGLE_BASE_URL'),
    IMAGE_GOOGLE_MODEL: readConfig(config, 'IMAGE_GOOGLE_MODEL'),
    IMAGE_SIZE: readConfig(config, 'IMAGE_SIZE', '1024x1024'),
    DASHSCOPE_API_KEY: readConfig(config, 'DASHSCOPE_API_KEY'),
    DEEPSEEK_API_KEY: readConfig(config, 'DEEPSEEK_API_KEY'),
    MINIMAX_API_KEY: readConfig(config, 'MINIMAX_API_KEY'),
    CUSTOM_API_KEY: readConfig(config, 'CUSTOM_API_KEY'),
    GOOGLE_AI_API_KEY: readConfig(config, 'GOOGLE_AI_API_KEY'),
    GOOGLE_API_KEY: readConfig(config, 'GOOGLE_API_KEY'),
    GEMINI_API_KEY: readConfig(config, 'GEMINI_API_KEY'),
    GOOGLE_AI_BASE_URL: readConfig(config, 'GOOGLE_AI_BASE_URL'),
    GOOGLE_API_MODE: readConfig(config, 'GOOGLE_API_MODE', 'native'),
    GOOGLE_CLOUD_PROJECT: readConfig(config, 'GOOGLE_CLOUD_PROJECT'),
    GOOGLE_CLOUD_LOCATION: readConfig(config, 'GOOGLE_CLOUD_LOCATION'),
    GOOGLE_GENAI_API_VERSION: readConfig(config, 'GOOGLE_GENAI_API_VERSION'),
  };
}

module.exports = {
  buildImageGenerationConfig,
  resolveImageBaseUrl,
  resolveImageModel,
};
