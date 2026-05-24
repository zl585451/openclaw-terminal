export type MemorySummarizerPayload = {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

function objectOrEmpty(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

export function buildMemorySummarizerConfigData(cfg: Record<string, any>): {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
} {
  const memoryCfg = objectOrEmpty(cfg.memory);
  const summarizer = objectOrEmpty(memoryCfg.summarizer);
  const apiCfg = objectOrEmpty(summarizer.api);
  return {
    enabled: summarizer.enabled !== false,
    baseUrl: String(apiCfg.baseUrl || ''),
    apiKey: String(apiCfg.apiKey || ''),
    model: String(apiCfg.model || ''),
  };
}

export function applyMemorySummarizerConfig(
  cfg: Record<string, any>,
  payload: MemorySummarizerPayload,
): Record<string, any> {
  const nextCfg = { ...cfg };
  const memoryCfg = objectOrEmpty(nextCfg.memory);
  const summarizer = { ...objectOrEmpty(memoryCfg.summarizer) };
  const apiCfg = { ...objectOrEmpty(summarizer.api) };

  if (payload.enabled !== undefined) summarizer.enabled = payload.enabled !== false;
  if (payload.baseUrl !== undefined) apiCfg.baseUrl = String(payload.baseUrl || '').trim();
  if (payload.apiKey !== undefined) apiCfg.apiKey = String(payload.apiKey || '').trim();
  if (payload.model !== undefined) apiCfg.model = String(payload.model || '').trim();

  summarizer.api = apiCfg;
  nextCfg.memory = {
    ...memoryCfg,
    summarizer,
  };
  return nextCfg;
}
