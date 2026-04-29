/**
 * Semantic recall before the main chat request.
 */
const config = require('../config');
const { createLogger } = require('../logger');
const db = require('./db');
const { embedOne } = require('../summarizer/embedding_client');

const logger = createLogger('recaller');
const cooldownCache = new Map();

const STOP_TOKENS = new Set([
  '什么', '怎么', '这个', '那个', '现在', '可以', '我们', '你们', '他们', '一下',
  '内容', '东西', '问题', '感觉', '看看', '是不是', '为什么', '如何', '有没有',
  '之前', '上次', '刚才', '以前', '记得', '回忆', '查询', '搜索', '相关',
]);

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

function hasRecallIntent(text) {
  return /(还记得|记不记得|之前说过|之前那个|上次|刚才那个|前面聊过|以前提过|之前提过|我们前面|你记得吗|当时|那天|大概.*聊过|说过什么)/.test(String(text || ''));
}

function tokenizeSignal(text) {
  const source = String(text || '').toLowerCase();
  const tokens = [];

  const enWords = source.match(/[a-z][a-z0-9_\-.]{2,}/g) || [];
  tokens.push(...enWords);

  const zhRuns = source.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  for (const run of zhRuns) {
    if (run.length <= 6) {
      tokens.push(run);
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      tokens.push(run.slice(i, i + 2));
    }
  }

  return [...new Set(tokens
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_TOKENS.has(token)))];
}

function scoreLexicalOverlap(input, hit) {
  const tokens = tokenizeSignal(input);
  if (!tokens.length) return { overlap: 0, matched: [], tokenCount: 0 };

  const haystack = [
    hit?.user_text,
    hit?.assistant_text,
    hit?.text_preview,
  ].map((item) => String(item || '').toLowerCase()).join('\n');

  const matched = tokens.filter((token) => haystack.includes(token));
  return {
    overlap: matched.length / tokens.length,
    matched,
    tokenCount: tokens.length,
  };
}

function confidenceFor({ similarity, overlap, recallIntent, strongThreshold, autoThreshold, recallIntentThreshold }) {
  if (similarity >= strongThreshold) return 'high';
  if (similarity >= autoThreshold && overlap >= 0.25) return 'high';
  if (recallIntent && similarity >= recallIntentThreshold) return 'medium';
  if (similarity >= autoThreshold && overlap > 0) return 'medium';
  return 'low';
}

function filterAutoHits(input, hits, cfg) {
  const recallIntent = hasRecallIntent(input);
  const signalTokens = tokenizeSignal(input);
  const minSignalTokens = cfg.recall.minSignalTokens ?? 2;
  if (!recallIntent && signalTokens.length < minSignalTokens) {
    return { hits: [], skipped: true, reason: 'low_signal_input', recallIntent, signalTokens };
  }

  const strongThreshold = cfg.recall.strongThreshold ?? 0.84;
  const autoThreshold = cfg.recall.autoThreshold ?? cfg.recall.threshold ?? 0.78;
  const recallIntentThreshold = cfg.recall.recallIntentThreshold ?? 0.72;
  const minLexicalOverlap = cfg.recall.minLexicalOverlap ?? 0.18;

  const accepted = [];
  for (const hit of hits) {
    const similarity = Number(hit.similarity || 0);
    const lexical = scoreLexicalOverlap(input, hit);
    const isAccepted = similarity >= strongThreshold
      || (similarity >= autoThreshold && lexical.overlap >= minLexicalOverlap)
      || (recallIntent && similarity >= recallIntentThreshold && (lexical.overlap > 0 || signalTokens.length <= 2));

    if (!isAccepted) continue;
    accepted.push({
      ...hit,
      lexical_overlap: Number(lexical.overlap.toFixed(4)),
      lexical_matches: lexical.matched.slice(0, 8),
      confidence: confidenceFor({
        similarity,
        overlap: lexical.overlap,
        recallIntent,
        strongThreshold,
        autoThreshold,
        recallIntentThreshold,
      }),
    });
  }

  return {
    hits: accepted,
    skipped: accepted.length === 0,
    reason: accepted.length === 0 ? 'below_auto_gate' : '',
    recallIntent,
    signalTokens,
  };
}

async function recall(userInput, session, options = {}) {
  const t0 = Date.now();
  const cfg = config.memory.vectorRecall;
  const mode = options.mode || 'auto';

  if (!cfg.enabled) return { hits: [], skipped: true, reason: 'disabled', latencyMs: 0 };

  const input = String(userInput || '').trim();
  if (input.length < cfg.recall.minInputLen) {
    return { hits: [], skipped: true, reason: 'too_short', latencyMs: 0 };
  }
  if (mode === 'auto' && isInCooldown(session, input)) {
    return { hits: [], skipped: true, reason: 'cooldown', latencyMs: 0 };
  }
  if (mode === 'auto') markCooldown(session, input);

  const work = (async () => {
    try {
      const vector = await embedOne(input);
      const hits = db.searchSimilar(vector, {
        topK: mode === 'auto'
          ? (cfg.recall.candidateTopK || Math.max((cfg.recall.topK || 3) * 4, cfg.recall.topK || 3))
          : (options.topK || cfg.recall.topK),
        threshold: mode === 'auto'
          ? (cfg.recall.candidateThreshold ?? Math.min(cfg.recall.threshold || 0.75, 0.58))
          : (options.threshold ?? cfg.recall.manualThreshold ?? cfg.recall.threshold),
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

  if (mode !== 'auto') {
    const hits = result.hits.slice(0, options.topK || cfg.recall.topK);
    logger.info('[Recaller] 手动召回完成', { hits: hits.length, latencyMs });
    return { hits, skipped: false, latencyMs, mode };
  }

  const gated = filterAutoHits(input, result.hits, cfg);
  const hits = gated.hits.slice(0, cfg.recall.topK || 3);
  logger.info('[Recaller] 自动召回完成', {
    candidates: result.hits.length,
    hits: hits.length,
    reason: gated.reason || 'accepted',
    recallIntent: gated.recallIntent,
    latencyMs,
  });
  return {
    hits,
    skipped: hits.length === 0,
    reason: hits.length === 0 ? gated.reason || 'no_hits' : '',
    latencyMs,
    mode,
    recallIntent: gated.recallIntent,
    signalTokens: gated.signalTokens,
  };
}

function buildRecallInjection(hits) {
  if (!hits || hits.length === 0) return '';
  const maxChars = config.memory?.vectorRecall?.recall?.maxInjectCharsPerHit || 420;
  const lines = [
    '【相关历史回忆】',
    '以下是系统按高置信策略筛出的整轮历史对话，只用于本轮理解。',
    '只有当它和用户正在说的事直接相关时，才自然提起；如果只是相似词或关系不明确，必须忽略，不要编造关联。',
    '',
  ];

  hits.forEach((hit, idx) => {
    const similarity = Math.round((hit.similarity || 0) * 100);
    const confidence = hit.confidence ? `，置信 ${hit.confidence}` : '';
    const matched = Array.isArray(hit.lexical_matches) && hit.lexical_matches.length
      ? `，命中词：${hit.lexical_matches.join(' / ')}`
      : '';
    lines.push(`[${idx + 1}] ${hit.date}（相似度 ${similarity}%${confidence}${matched}）`);
    lines.push(`用户当时说：${String(hit.user_text || '').slice(0, Math.floor(maxChars * 0.45))}`);
    lines.push(`AMY 当时答：${String(hit.assistant_text || '').slice(0, Math.floor(maxChars * 0.55))}`);
    lines.push('');
  });

  return lines.join('\n');
}

module.exports = {
  recall,
  buildRecallInjection,
  tokenizeSignal,
  scoreLexicalOverlap,
  hasRecallIntent,
  filterAutoHits,
};
