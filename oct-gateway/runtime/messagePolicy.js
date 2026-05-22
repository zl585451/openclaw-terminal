const MAX_HISTORY_ROUNDS = 12;
const DEFAULT_CONTEXT_LIMIT = 128000;
const FALLBACK_CONTEXT_LIMIT = 200000;

const MODEL_CONTEXT_LIMITS = {
  'qwen-plus': 128000,
  'qwen3.5-plus': 128000,
  'qwen3-max-2026-01-23': 262144,
  'qwen3-coder-next': 262144,
  'qwen3-coder-plus': 1000000,
  'qwen-vl-max': 32768,
  'qwen2-vl-7b': 32768,
  'kimi-k2.6': 262144,
  'kimi-k2.5': 262144,
  'minimax-m2.5': 196608,
  'glm-5': 202752,
  'glm-4.7': 202752,
  'deepseek-v4-flash': 128000,
  'deepseek-v4-pro': 128000,
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
};

const noop = () => {};
const defaultLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

function resolveLogger(logger) {
  return logger && typeof logger === 'object'
    ? {
        debug: typeof logger.debug === 'function' ? logger.debug.bind(logger) : noop,
        info: typeof logger.info === 'function' ? logger.info.bind(logger) : noop,
        warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : noop,
        error: typeof logger.error === 'function' ? logger.error.bind(logger) : noop,
      }
    : defaultLogger;
}

function estimateContentChars(content) {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;

  let total = 0;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;

    if (part.type === 'text') {
      total += String(part.text || '').length;
      continue;
    }

    if (part.type === 'image_url') {
      total += 1500;
      continue;
    }
  }
  return total;
}

function estimateMessageChars(message) {
  if (!message || typeof message !== 'object') return 0;
  return estimateContentChars(message.content);
}

function validateAndFixMessages(messages, { logger } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const log = resolveLogger(logger);
  const result = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (!msg || typeof msg !== 'object') {
      i += 1;
      continue;
    }

    if (msg.role === 'tool') {
      log.debug('validateAndFixMessages drop orphan tool message', {
        tool_call_id: msg.tool_call_id || null,
      });
      i += 1;
      continue;
    }

    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const expectedIds = Array.from(new Set(
        msg.tool_calls
          .map((tc) => tc && tc.id)
          .filter(Boolean)
      ));
      const expectedIdSet = new Set(expectedIds);

      const trailing = [];
      let j = i + 1;

      while (j < messages.length) {
        const next = messages[j];
        if (!next || typeof next !== 'object' || next.role !== 'tool') break;
        trailing.push(next);
        j += 1;
      }

      const matched = [];
      const seenIds = new Set();
      const droppedTrailingToolIds = [];

      for (const toolMsg of trailing) {
        const toolCallId = toolMsg.tool_call_id;
        if (expectedIdSet.has(toolCallId) && !seenIds.has(toolCallId)) {
          matched.push(toolMsg);
          seenIds.add(toolCallId);
        } else {
          droppedTrailingToolIds.push(toolCallId || null);
        }
      }

      const missingIds = expectedIds.filter((id) => !seenIds.has(id));
      if (missingIds.length === 0) {
        result.push(msg);
        result.push(...matched);
        if (droppedTrailingToolIds.length > 0) {
          log.debug('validateAndFixMessages drop unexpected trailing tool messages', {
            droppedToolCallIds: droppedTrailingToolIds,
            expectedIds,
          });
        }
      } else {
        log.debug('validateAndFixMessages drop incomplete tool_call group', {
          expectedIds,
          missingIds,
          trailingToolCallIds: trailing.map((toolMsg) => toolMsg.tool_call_id || null),
        });
      }

      i = j;
      continue;
    }

    result.push(msg);
    i += 1;
  }

  return result;
}

function getModelContextLimit(modelId) {
  if (!modelId || typeof modelId !== 'string') return DEFAULT_CONTEXT_LIMIT;
  const id = modelId.toLowerCase().replace(/\s/g, '');
  if (id.startsWith('gemini-')) return 1000000;
  return MODEL_CONTEXT_LIMITS[id] || MODEL_CONTEXT_LIMITS[modelId.split('/').pop()] || DEFAULT_CONTEXT_LIMIT;
}

function getMaxContextCharsForModel(modelId) {
  let limit = 0;
  try {
    limit = Number(getModelContextLimit(modelId));
  } catch {}
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = FALLBACK_CONTEXT_LIMIT;
  }
  return Math.floor(limit * 0.4);
}

function truncateHistory(messages, modelId, { maxHistoryRounds = MAX_HISTORY_ROUNDS } = {}) {
  if (!messages || messages.length === 0) return messages;
  const maxContextChars = getMaxContextCharsForModel(modelId);

  const systemMsgs = messages.filter((message) => message.role === 'system');
  const chatMsgs = messages.filter((message) => message.role !== 'system');
  const recentChat = chatMsgs.slice(-maxHistoryRounds * 2);

  let combined = [...systemMsgs, ...recentChat];
  let totalChars = combined.reduce((sum, message) => sum + estimateMessageChars(message), 0);

  while (totalChars > maxContextChars && recentChat.length > 2) {
    const removed = recentChat.shift();
    totalChars -= estimateMessageChars(removed);
    combined = [...systemMsgs, ...recentChat];
  }

  return combined;
}

function getContextUsageRatio(messages, modelId, { logger } = {}) {
  const log = resolveLogger(logger);
  const limit = getModelContextLimit(modelId);
  const totalChars = messages.reduce((sum, message) => sum + estimateMessageChars(message), 0);
  const estimatedTokens = totalChars / 2;
  const ratio = estimatedTokens / limit;

  if (ratio > 0.8) {
    log.warn(`上下文使用率 ${(ratio * 100).toFixed(0)}%，建议截断`, { modelId });
  }
  return ratio;
}

module.exports = {
  MAX_HISTORY_ROUNDS,
  estimateContentChars,
  estimateMessageChars,
  validateAndFixMessages,
  truncateHistory,
  getContextUsageRatio,
  getModelContextLimit,
  getMaxContextCharsForModel,
};
