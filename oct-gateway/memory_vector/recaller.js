/**
 * Semantic recall before the main chat request.
 */
const config = require('../config');
const { createLogger } = require('../logger');
const db = require('./db');
const { embedOne } = require('../summarizer/embedding_client');

const logger = createLogger('recaller');
const cooldownCache = new Map();

function hashInput(session, text) {
  return `${session || 'default'}::${String(text || '').slice(0, 100)}`;
}

function isInCooldown(session, text) {
  const key = hashInput(session, text);
  const last = cooldownCache.get(key);
  if (!last) return false;
  return Date.now() - last < (config.memory.vectorRecall.recall.cooldownMs || 5000);
}

function markCooldown(session, text) {
  cooldownCache.set(hashInput(session, text), Date.now());
  if (cooldownCache.size > 200) {
    const stale = [...cooldownCache.entries()].sort((a, b) => a[1] - b[1]).slice(0, 100);
    stale.forEach(([key]) => cooldownCache.delete(key));
  }
}

async function recall(userInput, session) {
  const t0 = Date.now();
  const cfg = config.memory.vectorRecall;

  if (!cfg.enabled) return { hits: [], skipped: true, reason: 'disabled', latencyMs: 0 };

  const input = String(userInput || '').trim();
  if (input.length < cfg.recall.minInputLen) {
    return { hits: [], skipped: true, reason: 'too_short', latencyMs: 0 };
  }
  if (isInCooldown(session, input)) {
    return { hits: [], skipped: true, reason: 'cooldown', latencyMs: 0 };
  }
  markCooldown(session, input);

  const work = (async () => {
    try {
      const vector = await embedOne(input);
      const hits = db.searchSimilar(vector, {
        topK: cfg.recall.topK,
        threshold: cfg.recall.threshold,
        excludeSession: session || 'default',
      });
      return { hits };
    } catch (error) {
      logger.warn('[Recaller] 召回失败', { error: error?.message || String(error) });
      return { hits: [], error: error?.message || String(error) };
    }
  })();

  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), cfg.recall.maxLatencyMs || 2000);
  });
  const result = await Promise.race([work, timeout]);
  const latencyMs = Date.now() - t0;

  if (result.timedOut) {
    logger.warn('[Recaller] 召回超时', { latencyMs });
    return { hits: [], skipped: true, reason: 'timeout', latencyMs };
  }
  if (result.error) return { hits: [], skipped: true, reason: result.error, latencyMs };

  logger.info('[Recaller] 召回完成', { hits: result.hits.length, latencyMs });
  return { hits: result.hits, skipped: false, latencyMs };
}

function buildRecallInjection(hits) {
  if (!hits || hits.length === 0) return '';
  const lines = [
    '【相关历史回忆】',
    '下面是和用户本轮输入可能相关的历史对话。只有在确实相关时，才自然提起“你之前/当时说过”；如果不相关，请完全忽略，不要强行联想。',
    '',
  ];

  hits.forEach((hit, idx) => {
    const similarity = Math.round((hit.similarity || 0) * 100);
    lines.push(`[${idx + 1}] ${hit.date}（相似度 ${similarity}%）`);
    lines.push(`少爷当时说：${String(hit.user_text || '').slice(0, 150)}`);
    lines.push(`AMY 当时答：${String(hit.assistant_text || '').slice(0, 200)}`);
    lines.push('');
  });

  return lines.join('\n');
}

module.exports = {
  recall,
  buildRecallInjection,
};
