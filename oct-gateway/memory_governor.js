const { createLogger } = require('./logger');
const { stripCotText, sanitizeAssistantReply, sanitizeMemoryNodeContent } = require('./cot_sanitize');

const log = createLogger('memory_governor');

const MAX_INJECTION_ITEMS = 5;
const MAX_INJECTION_CHARS = 800;
const REVIEW_QUEUE_PREFIX = 'core://agent/review_queue';

function cleanText(input) {
  return stripCotText(String(input || ''))
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeRecord(record = {}) {
  const next = { ...record };
  if (typeof next.content === 'string') {
    next.content = cleanText(next.content);
  }
  if (typeof next.assistantReply === 'string') {
    next.assistantReply = sanitizeAssistantReply(next.assistantReply);
  }
  if (typeof next.rawNodeContent === 'string') {
    const sanitized = sanitizeMemoryNodeContent(next.rawNodeContent);
    next.rawNodeContent = sanitized.content;
  }
  return next;
}

function classifyRecord(record = {}) {
  const uri = String(record.uri || '').toLowerCase();
  const source = String(record.source || '');

  if (source === 'history_summary' || uri.includes('/history/')) {
    return 'archive';
  }
  if (uri.startsWith('project://')) {
    return 'project';
  }
  if (uri.startsWith('core://my_user/preferences') || uri.startsWith('core://my_user/profile')) {
    return 'core';
  }
  if (uri.startsWith('core://agent/')) {
    return 'core';
  }
  return 'scratch';
}

function scorePromotion(record = {}) {
  const userMsg = String(record.userMsg || '');
  const content = String(record.content || '');
  const disclosure = String(record.disclosure || '');
  const uri = String(record.uri || '').toLowerCase();
  let score = 0;

  if (/(记住|记一下|以后|偏好|我喜欢|我不喜欢|习惯|默认)/.test(userMsg)) score += 3;
  if (/(决定|规范|约定|架构|项目|发布|完成)/.test(userMsg)) score += 2;
  if (uri.startsWith('project://')) score += 2;
  if (uri.startsWith('core://my_user/preferences') || uri.startsWith('core://my_user/profile')) score += 2;
  if (uri.startsWith('core://agent/')) score += 1;
  if (content.length > 0 && content.length <= 80) score += 1;
  if (disclosure) score += 1;

  return score;
}

function looksLikeTestRecord(record = {}) {
  const uri = String(record.uri || '').toLowerCase();
  const content = String(record.content || '').toLowerCase();
  const disclosure = String(record.disclosure || '').toLowerCase();
  const source = String(record.source || '').toLowerCase();

  if (uri.startsWith('core://test/') || uri.startsWith('core://tmp/') || uri.startsWith('scratch://test/')) {
    return true;
  }

  const signals = [
    '测试记忆',
    '仅测试',
    'governor测试',
    'governor 测试',
    'test memory',
    'memory_write 测试',
  ];
  const combined = `${content} ${disclosure} ${source}`;
  return signals.some((s) => combined.includes(s));
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'memory';
}

function routeRecord(record = {}) {
  const sanitized = sanitizeRecord(record);
  const layer = classifyRecord(sanitized);
  const uri = String(sanitized.uri || '');
  const content = String(sanitized.content || '');
  const source = String(sanitized.source || '');

  if (!uri || !content) {
    const result = { decision: 'reject', reason: 'missing_uri_or_content', layer };
    log.info('routeRecord', {
      source,
      decision: result.decision,
      reason: result.reason,
      layer: result.layer,
      uri,
    });
    return result;
  }

  if (uri.startsWith('core://agent/corrections')) {
    const result = { decision: 'promote', reason: 'protected_corrections', layer: 'core', uri, content };
    log.info('routeRecord', {
      source,
      decision: result.decision,
      reason: result.reason,
      layer: result.layer,
      uri,
    });
    return result;
  }

  if (looksLikeTestRecord(sanitized)) {
    const result = { decision: 'reject', reason: 'test_record_blocked', layer };
    log.info('routeRecord', {
      source,
      decision: result.decision,
      reason: result.reason,
      layer: result.layer,
      uri,
    });
    return result;
  }

  const score = scorePromotion(sanitized);
  const shouldPromote =
    layer === 'project' ||
    layer === 'archive' ||
    source === 'feedback' ||
    source === 'clarification_preference' ||
    score >= 4;

  if (shouldPromote) {
    const result = {
      decision: 'promote',
      reason: `score_${score}`,
      layer,
      uri,
      content,
      priority: sanitized.priority,
      disclosure: sanitized.disclosure,
    };
    log.info('routeRecord', {
      source,
      decision: result.decision,
      reason: result.reason,
      layer: result.layer,
      uri,
    });
    return result;
  }

  const reviewUri = `${REVIEW_QUEUE_PREFIX}/${layer}/${Date.now()}_${slugify(uri)}`;
  const reviewContent = JSON.stringify({
    source: sanitized.source || 'unknown',
    original_uri: uri,
    suggested_layer: layer,
    user: String(sanitized.userMsg || '').slice(0, 200),
    content: content.slice(0, 200),
    disclosure: String(sanitized.disclosure || '').slice(0, 120),
    score,
  }, null, 2);

  const result = {
    decision: 'hold',
    reason: `score_${score}`,
    layer,
    uri: reviewUri,
    content: reviewContent,
    priority: 2,
    disclosure: `待审核记忆候选：${uri}`,
  };
  log.info('routeRecord', {
    source,
    decision: result.decision,
    reason: result.reason,
    layer: result.layer,
    uri,
    reviewUri,
  });
  return result;
}

function scoreInjectionItem(item = {}) {
  const uri = String(item.uri || '').toLowerCase();
  const content = cleanText(item.content || '');
  let score = Number(item.priority || 0) * 10 + Number(item.match_score || 0) * 10;

  if (uri.startsWith('core://my_user/preferences') || uri.startsWith('core://my_user/profile')) score += 25;
  if (uri.startsWith('core://my_user/')) score += 12;
  if (uri.startsWith('project://')) score += 20;
  if (uri.startsWith('core://agent/')) score += 12;
  if (uri.startsWith('core://amy/')) score += 10;
  if (uri.startsWith('core://test/') || uri.startsWith('core://tmp/') || uri.startsWith('scratch://')) score -= 40;
  if (uri.includes('/history/')) score -= 25;
  if (uri.includes('/review_queue/')) score -= 60;
  if (content.length > 220) score -= 8;
  if (!content) score -= 15;

  return score;
}

function selectForInjection(items = [], options = {}) {
  const limit = Math.min(Number(options.limit) || MAX_INJECTION_ITEMS, 10);
  const maxChars = Math.min(Number(options.maxChars) || MAX_INJECTION_CHARS, 2000);
  const seen = new Set();
  const cleaned = [];

  for (const rawItem of items) {
    if (!rawItem || !rawItem.uri) continue;
    const item = {
      ...rawItem,
      content: cleanText(rawItem.content || ''),
    };
    const key = item.uri.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!item.content) continue;
    if (key.includes('/history/')) continue;
    if (key.includes('/review_queue/')) continue;
    if (key.startsWith('core://test/') || key.startsWith('core://tmp/') || key.startsWith('scratch://')) continue;
    cleaned.push({ ...item, governor_score: scoreInjectionItem(item) });
  }

  cleaned.sort((a, b) => b.governor_score - a.governor_score);

  const picked = [];
  let usedChars = 0;
  for (const item of cleaned) {
    const nextLen = item.content.length;
    if (picked.length >= limit) break;
    if (usedChars + nextLen > maxChars && picked.length > 0) continue;
    picked.push(item);
    usedChars += nextLen;
  }

  log.debug('selectForInjection', {
    scored: cleaned.slice(0, 8).map((item) => ({
      uri: item.uri,
      score: item.governor_score,
      priority: item.priority,
      match_score: item.match_score,
    })),
    selectedUris: picked.map((item) => item.uri),
    inCount: items.length,
    outCount: picked.length,
    usedChars,
  });

  return picked;
}

module.exports = {
  sanitizeRecord,
  classifyRecord,
  routeRecord,
  selectForInjection,
};
