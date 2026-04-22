export const RECOMMENDED_MODELS: Record<string, string[]> = {
  'bailian-coding': ['qwen3.5-plus', 'qwen3-max-2026-01-23', 'qwen3-coder-next'],
  bailian: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  minimax: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5'],
  siliconflow: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3', 'Pro/Qwen/Qwen2.5-7B-Instruct'],
  google: ['google/gemini-2.5-flash', 'google/gemini-2.5-pro', 'google/gemini-2.0-flash-001'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  moonshot: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-turbo-preview'],
  groq: ['llama-3.3-70b-versatile', 'gemma2-9b-it'],
  ollama: ['qwen2.5:7b'],
  custom: [],
};

export function getRecommendedModels(providerId: string): string[] {
  return RECOMMENDED_MODELS[providerId] || [];
}
