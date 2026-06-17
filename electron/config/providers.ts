export type ProviderModelEntry = {
  id: string;
  label: string;
  tools?: boolean;
  thinking?: boolean;
  vision?: boolean;
  custom?: boolean;
};

export type ProviderEntry = {
  id: string;
  name: string;
  baseUrl: string;
  keyPlaceholder: string;
  keyLink: string;
  defaultModel: string;
  models: ProviderModelEntry[];
  allowCustomModel?: boolean;
};

export type ProviderMap = Record<string, ProviderEntry>;

export function getFallbackProviders(): ProviderMap {
  return {
    bailian: {
      id: 'bailian',
      name: '阿里云百炼',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      keyLink: 'https://bailian.console.aliyun.com/',
      defaultModel: 'qwen-plus',
      models: [
        { id: 'qwen3.5-plus', label: 'Qwen 3.5 Plus（最新，支持工具+思考）', tools: true, thinking: true },
        { id: 'qwen-plus', label: 'Qwen Plus（稳定通用）', tools: true, thinking: false },
        { id: 'qwen-max', label: 'Qwen Max（最强推理）', tools: true, thinking: false },
        { id: 'qwen-turbo', label: 'Qwen Turbo（快速便宜）', tools: true, thinking: false },
        { id: 'qwen-vl-max', label: 'Qwen VL Max（图片理解）', tools: false, thinking: false, vision: true },
      ],
    },
    deepseek: {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      keyLink: 'https://platform.deepseek.com/',
      defaultModel: 'deepseek-v4-flash',
      models: [
        { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash（通用，推荐）', tools: true, thinking: false },
        { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro（深度推理）', tools: false, thinking: true },
        { id: 'deepseek-chat', label: 'DeepSeek Chat（旧版）', tools: true, thinking: false },
        { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner（旧版）', tools: false, thinking: true },
      ],
    },
    minimax: {
      id: 'minimax',
      name: 'MiniMax',
      baseUrl: 'https://api.minimaxi.com/v1',
      keyPlaceholder: 'sk-cp-xxxxxxxxxxxxxxxx',
      keyLink: 'https://platform.minimaxi.com/docs/token-plan/intro',
      defaultModel: 'MiniMax-M2.7',
      models: [
        { id: 'MiniMax-M2.7', label: 'MiniMax M2.7（最新，自我迭代）', tools: true, thinking: false },
        { id: 'MiniMax-M2.5', label: 'MiniMax M2.5（顶尖性能）', tools: true, thinking: false },
        { id: 'MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 极速版（100tps）', tools: true, thinking: false },
      ],
    },
    siliconflow: {
      id: 'siliconflow',
      name: '硅基流动 SiliconFlow',
      baseUrl: 'https://api.siliconflow.cn/v1',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      keyLink: 'https://cloud.siliconflow.cn/',
      defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
      models: [
        { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B（免费）', tools: true, thinking: false },
        { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3', tools: false, thinking: false },
        { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1（推理）', tools: false, thinking: true },
      ],
    },
    moonshot: {
      id: 'moonshot',
      name: 'Kimi 开放平台',
      baseUrl: 'https://api.moonshot.cn/v1',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      keyLink: 'https://platform.kimi.com/',
      defaultModel: 'kimi-k2.6',
      models: [
        { id: 'kimi-k2.6', label: 'Kimi K2.6（官方最新）', tools: true, thinking: false },
        { id: 'kimi-k2.5', label: 'Kimi K2.5（稳定）', tools: true, thinking: false },
        { id: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo（高速）', tools: true, thinking: false },
        { id: 'moonshot-v1-128k', label: 'Moonshot V1 128K（兼容）', tools: true, thinking: false },
      ],
    },
    google: {
      id: 'google',
      name: 'Google Gemini（Vertex AI 原生）',
      baseUrl: 'https://aiplatform.googleapis.com/v1beta1/projects/YOUR_PROJECT_ID/locations/us-central1/endpoints/openapi',
      keyPlaceholder: 'AQ.xxxxx 或绑定 Vertex 的 API Key',
      keyLink: 'https://console.cloud.google.com/vertex-ai/studio/settings/api-keys',
      defaultModel: 'google/gemini-3.5-flash',
      models: [
        { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash（GA，推荐）', tools: true, thinking: true },
        { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro（预览，最强推理）', tools: true, thinking: true },
        { id: 'google/gemini-3.1-pro-preview-customtools', label: 'Gemini 3.1 Pro Custom Tools（预览）', tools: true, thinking: true },
        { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash（预览，复杂多模态）', tools: true, thinking: true },
        { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite（GA，低延迟）', tools: true, thinking: true },
        { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro（GA，稳定推理）', tools: true, thinking: true },
        { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash（GA，稳定通用）', tools: true, thinking: true },
        { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite（GA，低成本）', tools: true, thinking: true },
      ],
    },
    groq: {
      id: 'groq',
      name: 'Groq（免费极速）',
      baseUrl: 'https://api.groq.com/openai/v1',
      keyPlaceholder: 'gsk_xxxxxxxxxxxxxxxx',
      keyLink: 'https://console.groq.com/',
      defaultModel: 'llama-3.3-70b-versatile',
      models: [
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B（生产推荐）', tools: true, thinking: false },
        { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B（低延迟）', tools: true, thinking: false },
        { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B（推理）', tools: true, thinking: true },
        { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B（高速）', tools: true, thinking: true },
        { id: 'qwen/qwen3-32b', label: 'Qwen3 32B（预览）', tools: true, thinking: false },
      ],
    },
    custom: {
      id: 'custom',
      name: '自定义 OpenAI 兼容服务',
      baseUrl: '',
      keyPlaceholder: 'your-api-key',
      keyLink: '',
      defaultModel: '__custom__',
      models: [
        { id: '__custom__', label: '✏️ 自定义模型（手动输入）', tools: true, thinking: false, custom: true },
      ],
      allowCustomModel: true,
    },
  };
}

export function loadProviderList({
  providersPath,
  existsSync,
  requireModule,
}: {
  providersPath: string;
  existsSync: (path: string) => boolean;
  requireModule: (path: string) => { PROVIDERS?: ProviderMap };
}): { providers: ProviderMap; error?: string } {
  try {
    if (!existsSync(providersPath)) {
      return { providers: getFallbackProviders() };
    }
    const loaded = requireModule(providersPath);
    return { providers: loaded.PROVIDERS || getFallbackProviders() };
  } catch (e: any) {
    return { providers: getFallbackProviders(), error: e?.message || String(e) };
  }
}

export function resolveProviderId(cfg: Record<string, string>): string {
  if (cfg.OCT_PROVIDER && String(cfg.OCT_PROVIDER).trim()) {
    return String(cfg.OCT_PROVIDER).trim();
  }
  if (cfg.GROQ_API_KEY || cfg.GROQ_BASE_URL) {
    return 'groq';
  }
  return (
    (cfg.CUSTOM_BASE_URL || cfg.CUSTOM_API_KEY || cfg.CUSTOM_MODEL)
      ? 'custom'
      : 'bailian'
  );
}

export function resolveProviderBaseUrl(
  providerId: string,
  cfg: Record<string, string>,
  provider?: ProviderEntry,
): string {
  return providerId === 'deepseek' ? (cfg.DEEPSEEK_BASE_URL || provider?.baseUrl || '')
    : providerId === 'minimax' ? (cfg.MINIMAX_BASE_URL || provider?.baseUrl || '')
    : providerId === 'moonshot' ? (cfg.MOONSHOT_BASE_URL || provider?.baseUrl || '')
    : providerId === 'groq' ? (cfg.GROQ_BASE_URL || ((cfg.DASHSCOPE_BASE_URL || '').includes('groq') ? cfg.DASHSCOPE_BASE_URL : '') || provider?.baseUrl || '')
    : providerId === 'custom' ? (cfg.CUSTOM_BASE_URL || provider?.baseUrl || '')
    : providerId === 'google' ? (cfg.GOOGLE_AI_BASE_URL || provider?.baseUrl || '')
    : (cfg.DASHSCOPE_BASE_URL || provider?.baseUrl || '');
}

export function resolveProviderApiKey(providerId: string, cfg: Record<string, string>): string {
  return providerId === 'deepseek' ? (cfg.DEEPSEEK_API_KEY || '')
    : providerId === 'minimax' ? (cfg.MINIMAX_API_KEY || '')
    : providerId === 'moonshot' ? (cfg.MOONSHOT_API_KEY || '')
    : providerId === 'custom' ? (cfg.CUSTOM_API_KEY || '')
    : providerId === 'google' ? (cfg.GOOGLE_AI_API_KEY || '')
    : providerId === 'groq' ? (cfg.GROQ_API_KEY || cfg.DASHSCOPE_API_KEY || '')
    : (cfg.DASHSCOPE_API_KEY || '');
}

export function resolveAiConnectionSettings(
  cfg: Record<string, string>,
  providers: ProviderMap,
): {
  providerId: string;
  provider: ProviderEntry;
  baseUrl: string;
  apiKey: string;
  model: string;
} {
  const providerId = resolveProviderId(cfg);
  const provider = providers[providerId] || providers['bailian'];
  const model = (providerId === 'custom' || providerId === 'google') && cfg.OCT_MODEL === '__custom__' && cfg.CUSTOM_MODEL
    ? cfg.CUSTOM_MODEL
    : (cfg.OCT_MODEL || provider?.defaultModel || 'qwen3.5-plus');

  return {
    providerId,
    provider,
    baseUrl: resolveProviderBaseUrl(providerId, cfg, provider),
    apiKey: resolveProviderApiKey(providerId, cfg),
    model,
  };
}
