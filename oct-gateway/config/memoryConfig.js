'use strict';

function mergeObjects(base, override) {
  const source = override && typeof override === 'object' ? override : {};
  return { ...base, ...source };
}

function buildMemoryConfig({ fileConfig, env, pathModule, osModule }) {
  const memoryFileConfig = fileConfig?.memory && typeof fileConfig.memory === 'object'
    ? fileConfig.memory
    : {};

  const defaultMemoryConfig = {
    backend: env.OCT_MEMORY_BACKEND || 'file',
    root: env.OCT_MEMORY_ROOT || pathModule.join(osModule.homedir(), '.openclaw', 'memory'),
    auto_save_history: true,
    auto_save_feedback: false,
    enable_memory_search: true,
    search_cache_ttl: 300,
    search_default_limit: 10,
    max_history_days: 7,
    max_feedback_days: 7,
    load_feedback_on_boot: false,
    compress_length: { user: 100, amy: 200 },
  };

  const defaultSummarizerConfig = {
    enabled: env.SUMMARIZER_ENABLED !== 'false',
    api: {
      baseUrl: env.SUMMARIZER_BASE_URL || '',
      apiKey: env.SUMMARIZER_API_KEY || '',
      model: env.SUMMARIZER_MODEL || '',
    },
    schedule: {
      daily: { hour: 4, minute: 0 },
      weekly: { hour: 4, minute: 30 },
      monthly: { hour: 5, minute: 0 },
    },
    bootInject: {
      dailyCount: 3,
      weeklyCount: 1,
      monthlyCount: 1,
    },
    maxTokens: {
      daily: 3000,
      weekly: 4000,
      monthly: 5000,
    },
    retry: {
      maxAttempts: 3,
      backoffMs: [10000, 60000, 300000],
    },
  };

  const defaultVectorRecallConfig = {
    enabled: env.VECTOR_RECALL_ENABLED === 'true',
    embedding: {
      baseUrl: env.EMBEDDING_BASE_URL || '',
      apiKey: env.EMBEDDING_API_KEY || '',
      model: env.EMBEDDING_MODEL || '',
      dimensions: parseInt(env.EMBEDDING_DIMENSIONS || '1024', 10),
      version: parseInt(env.EMBEDDING_VERSION || '1', 10),
      timeoutMs: 30000,
    },
    dbPath: env.VECTOR_DB_PATH || pathModule.join(osModule.homedir(), '.openclaw', 'vector_recall', 'vectors.db'),
    recall: {
      threshold: parseFloat(env.VECTOR_RECALL_THRESHOLD || '0.75'),
      autoThreshold: parseFloat(env.VECTOR_RECALL_AUTO_THRESHOLD || '0.78'),
      strongThreshold: parseFloat(env.VECTOR_RECALL_STRONG_THRESHOLD || '0.84'),
      recallIntentThreshold: parseFloat(env.VECTOR_RECALL_INTENT_THRESHOLD || '0.72'),
      manualThreshold: parseFloat(env.VECTOR_RECALL_MANUAL_THRESHOLD || '0.62'),
      candidateThreshold: parseFloat(env.VECTOR_RECALL_CANDIDATE_THRESHOLD || '0.58'),
      topK: parseInt(env.VECTOR_RECALL_TOP_K || '3', 10),
      candidateTopK: parseInt(env.VECTOR_RECALL_CANDIDATE_TOP_K || '12', 10),
      maxLatencyMs: parseInt(env.VECTOR_RECALL_MAX_LATENCY || '2000', 10),
      minInputLen: 4,
      minSignalTokens: 2,
      minLexicalOverlap: 0.18,
      cooldownMs: 5000,
      excludeSameSession: true,
      sameSessionWindowMs: 10 * 60 * 1000,
      maxInjectCharsPerHit: 420,
    },
    write: {
      async: true,
      mode: env.VECTOR_RECALL_WRITE_MODE || 'selective',
      minUserChars: parseInt(env.VECTOR_RECALL_WRITE_MIN_USER_CHARS || '12', 10),
      assistantPreviewChars: parseInt(env.VECTOR_RECALL_WRITE_ASSISTANT_PREVIEW_CHARS || '360', 10),
      maxRetries: 3,
      retryBackoffMs: [5000, 30000, 120000],
    },
    backfill: {
      batchSize: 50,
      intervalMs: 200,
    },
  };

  const memoryConfig = mergeObjects(defaultMemoryConfig, memoryFileConfig);
  const summarizerOverride = memoryFileConfig.summarizer && typeof memoryFileConfig.summarizer === 'object'
    ? memoryFileConfig.summarizer
    : {};
  const vectorRecallOverride = memoryFileConfig.vectorRecall && typeof memoryFileConfig.vectorRecall === 'object'
    ? memoryFileConfig.vectorRecall
    : {};

  memoryConfig.summarizer = {
    ...mergeObjects(defaultSummarizerConfig, summarizerOverride),
    api: mergeObjects(defaultSummarizerConfig.api, summarizerOverride.api),
    schedule: mergeObjects(defaultSummarizerConfig.schedule, summarizerOverride.schedule),
    bootInject: mergeObjects(defaultSummarizerConfig.bootInject, summarizerOverride.bootInject),
    maxTokens: mergeObjects(defaultSummarizerConfig.maxTokens, summarizerOverride.maxTokens),
    retry: mergeObjects(defaultSummarizerConfig.retry, summarizerOverride.retry),
  };

  memoryConfig.vectorRecall = {
    ...mergeObjects(defaultVectorRecallConfig, vectorRecallOverride),
    embedding: mergeObjects(defaultVectorRecallConfig.embedding, vectorRecallOverride.embedding),
    recall: mergeObjects(defaultVectorRecallConfig.recall, vectorRecallOverride.recall),
    write: mergeObjects(defaultVectorRecallConfig.write, vectorRecallOverride.write),
    backfill: mergeObjects(defaultVectorRecallConfig.backfill, vectorRecallOverride.backfill),
  };

  return memoryConfig;
}

module.exports = {
  buildMemoryConfig,
};
