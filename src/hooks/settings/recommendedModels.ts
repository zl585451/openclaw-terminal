export const RECOMMENDED_MODELS: Record<string, string[]> = {
  'bailian-coding': ['qwen3.5-plus', 'qwen3-max-2026-01-23', 'qwen3-coder-next'],
  bailian: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  minimax: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5'],
  siliconflow: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3', 'Pro/Qwen/Qwen2.5-7B-Instruct'],
  google: [
    'google/gemini-3.5-flash',
    'google/gemini-3.1-flash-lite-preview',
    'google/gemini-2.5-flash',
    'google/gemini-3.1-pro-preview',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash-lite',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  moonshot: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-turbo-preview'],
  newapi: [
    '__custom__',
    'qwen-plus',
    'qwen3.5-plus',
    'qwen3.6-flash-2026-04-16',
    'qwen3.6-plus-2026-04-02',
    'qwen3-coder-plus-2025-09-23',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'doubao-seed-2-0-lite-260215',
    'doubao-seed-2-0-pro-260215',
    'doubao-1-5-lite-32k-250115',
    'doubao-1-5-pro-32k-250115',
  ],
  groq: ['llama-3.3-70b-versatile', 'gemma2-9b-it'],
  ollama: ['qwen2.5:7b'],
  custom: [],
};

/** 新手模式展示的 provider 顺序与 ID（与 `RECOMMENDED_MODELS` 中对应条目一致） */
export const BEGINNER_PROVIDER_IDS = ['bailian-coding', 'deepseek', 'minimax'] as const;

export type BeginnerProviderId = (typeof BEGINNER_PROVIDER_IDS)[number];

export function isBeginnerProviderId(id: string): id is BeginnerProviderId {
  return (BEGINNER_PROVIDER_IDS as readonly string[]).includes(id);
}

/** 新手卡片副标题（与服务商卡片一一对应） */
export const BEGINNER_PROVIDER_CARD_SUBTITLE: Record<BeginnerProviderId, string> = {
  'bailian-coding': '推荐新手',
  deepseek: '便宜够用',
  minimax: '自研 M2.7',
};

export function getRecommendedModels(providerId: string): string[] {
  return RECOMMENDED_MODELS[providerId] || [];
}

/** 当前 provider 的第一条推荐模型 ID，无配置时为空串 */
export function getFirstRecommendedModel(providerId: string): string {
  const list = getRecommendedModels(providerId);
  return list[0] || '';
}
