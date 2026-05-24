export type VectorProvider = 'bailian' | 'volcengine' | 'custom';

export type MemoryVectorRecallPayload = {
  enabled?: boolean;
  provider?: VectorProvider;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  dimensions?: number;
  threshold?: number;
  topK?: number;
};

export const VECTOR_PROVIDER_PRESETS: Record<Exclude<VectorProvider, 'custom'>, {
  baseUrl: string;
  model?: string;
  dimensions: number;
}> = {
  bailian: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'text-embedding-v4',
    dimensions: 1024,
  },
  volcengine: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    dimensions: 1024,
  },
};

export function inferVectorProvider(baseUrl: string, model: string): VectorProvider {
  const u = String(baseUrl || '').toLowerCase();
  const m = String(model || '').toLowerCase();
  if (u.includes('dashscope') || m.includes('text-embedding-v3') || m.includes('text-embedding-v4')) return 'bailian';
  if (u.includes('volces') || u.includes('ark.cn-beijing') || u.includes('doubao')) return 'volcengine';
  return 'custom';
}

function objectOrEmpty(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

export function buildMemoryVectorRecallConfigData(cfg: Record<string, any>): {
  enabled: boolean;
  provider: VectorProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  threshold: number;
  topK: number;
} {
  const memoryCfg = objectOrEmpty(cfg.memory);
  const vectorRecall = objectOrEmpty(memoryCfg.vectorRecall);
  const embedding = objectOrEmpty(vectorRecall.embedding);
  const recall = objectOrEmpty(vectorRecall.recall);
  const baseUrl = String(embedding.baseUrl || '');
  const model = String(embedding.model || '');
  return {
    enabled: vectorRecall.enabled === true,
    provider: String(vectorRecall.provider || inferVectorProvider(baseUrl, model)) as VectorProvider,
    baseUrl,
    apiKey: String(embedding.apiKey || ''),
    model,
    dimensions: Number(embedding.dimensions || 1024),
    threshold: Number(recall.threshold || 0.75),
    topK: Number(recall.topK || 3),
  };
}

export function applyMemoryVectorRecallConfig(
  cfg: Record<string, any>,
  payload: MemoryVectorRecallPayload,
): Record<string, any> {
  const nextCfg = { ...cfg };
  const memoryCfg = objectOrEmpty(nextCfg.memory);
  const vectorRecall = { ...objectOrEmpty(memoryCfg.vectorRecall) };
  const embedding = { ...objectOrEmpty(vectorRecall.embedding) };
  const recall = { ...objectOrEmpty(vectorRecall.recall) };

  if (payload.enabled !== undefined) vectorRecall.enabled = payload.enabled === true;
  if (payload.provider !== undefined) vectorRecall.provider = payload.provider;
  if (payload.baseUrl !== undefined) embedding.baseUrl = String(payload.baseUrl || '').trim();
  if (payload.apiKey !== undefined) embedding.apiKey = String(payload.apiKey || '').trim();
  if (payload.model !== undefined) embedding.model = String(payload.model || '').trim();
  if (payload.dimensions !== undefined) {
    const n = Number(payload.dimensions);
    embedding.dimensions = Number.isFinite(n) && n > 0 ? Math.round(n) : 1024;
  }

  if (payload.provider === 'bailian') {
    embedding.baseUrl = payload.baseUrl || VECTOR_PROVIDER_PRESETS.bailian.baseUrl;
    embedding.model = payload.model || VECTOR_PROVIDER_PRESETS.bailian.model;
    embedding.dimensions = Number(payload.dimensions || VECTOR_PROVIDER_PRESETS.bailian.dimensions);
  } else if (payload.provider === 'volcengine') {
    embedding.baseUrl = payload.baseUrl || VECTOR_PROVIDER_PRESETS.volcengine.baseUrl;
    embedding.dimensions = Number(payload.dimensions || VECTOR_PROVIDER_PRESETS.volcengine.dimensions);
  }

  embedding.version = Number(embedding.version || 1);
  embedding.timeoutMs = Number(embedding.timeoutMs || 30000);

  if (payload.threshold !== undefined) {
    const n = Number(payload.threshold);
    recall.threshold = Number.isFinite(n) ? Math.min(0.99, Math.max(0.1, n)) : 0.75;
  }
  if (payload.topK !== undefined) {
    const n = Number(payload.topK);
    recall.topK = Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : 3;
  }

  vectorRecall.embedding = embedding;
  vectorRecall.recall = recall;
  nextCfg.memory = {
    ...memoryCfg,
    vectorRecall,
  };
  return nextCfg;
}
