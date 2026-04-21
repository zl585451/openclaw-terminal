/**
 * Embedding API client.
 * Compatible with OpenAI embeddings protocol.
 */
const config = require('../config');
const { createLogger } = require('../logger');

const logger = createLogger('embedding');

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/$/, '');
}

function validateEmbeddingConfig() {
  const cfg = config.memory.vectorRecall.embedding;
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    throw new Error('EMBEDDING_NOT_CONFIGURED: 请检查 EMBEDDING_BASE_URL/API_KEY/MODEL');
  }
  return cfg;
}

async function createEmbeddings(input) {
  const cfg = validateEmbeddingConfig();
  const inputs = Array.isArray(input) ? input : [input];
  const truncated = inputs.map((text) => String(text || '').slice(0, 2000));
  const url = `${normalizeBaseUrl(cfg.baseUrl)}/embeddings`;
  const requestInput = truncated.length === 1 ? truncated[0] : truncated;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      input: requestInput,
      dimensions: cfg.dimensions,
      encoding_format: 'float',
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs || 30000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`EMBEDDING_HTTP_${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const vectors = (data?.data || []).map((item) => item.embedding).filter(Array.isArray);
  if (vectors.length !== inputs.length) {
    throw new Error(`EMBEDDING_COUNT_MISMATCH: expected ${inputs.length}, got ${vectors.length}`);
  }

  const actualDim = vectors[0]?.length || 0;
  if (actualDim !== cfg.dimensions) {
    logger.warn('[Embedding] 维度不匹配', { expected: cfg.dimensions, actual: actualDim });
  }

  return vectors;
}

async function embedOne(text) {
  const vectors = await createEmbeddings([text]);
  return vectors[0];
}

module.exports = { createEmbeddings, embedOne };
