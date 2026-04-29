'use strict';

const { summarize } = require('../services/summarizer');
const config = require('../config');

const DEFAULT_TRIGGER_CHARS = 2400;
const DEFAULT_TARGET_LENGTH = 600;
const DEFAULT_FALLBACK_KEEP_CHARS = 1500;
const MAX_SUMMARIZER_INPUT_CHARS = 8000;

function shouldSummarizeToolResult(toolName, resultText) {
  if (!isFeatureEnabled()) return { shouldSummarize: false, reason: 'feature_disabled' };
  if (typeof resultText !== 'string') {
    return { shouldSummarize: false, reason: 'invalid_input_not_string' };
  }

  const triggerChars = positiveInt(
    config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS'),
    DEFAULT_TRIGGER_CHARS,
  );
  if (resultText.length < triggerChars) return { shouldSummarize: false, reason: 'under_threshold' };

  const allowList = String(config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_TOOLS') || '').trim();
  if (allowList) {
    const allowedTools = allowList
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!allowedTools.includes(toolName)) {
      return { shouldSummarize: false, reason: 'not_in_allow_list' };
    }
  }

  return { shouldSummarize: true, reason: 'over_threshold' };
}

async function summarizeToolResult(toolName, resultText, options = {}) {
  if (typeof resultText !== 'string') {
    return { text: '', mode: 'noop', latencyMs: 0, reason: 'invalid_input_not_string' };
  }

  const { shouldSummarize, reason } = shouldSummarizeToolResult(toolName, resultText);
  if (!shouldSummarize) {
    return { text: resultText, mode: 'noop', latencyMs: 0, reason };
  }

  const targetLength = positiveInt(
    options.targetLength || config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_TARGET_CHARS'),
    DEFAULT_TARGET_LENGTH,
  );
  const fallbackKeep = positiveInt(
    config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP'),
    DEFAULT_FALLBACK_KEEP_CHARS,
  );
  const summarizeFn = typeof options.summarize === 'function' ? options.summarize : summarize;
  const startedAt = Date.now();

  try {
    const result = await summarizeFn(resultText.slice(0, MAX_SUMMARIZER_INPUT_CHARS), {
      purpose: 'tool_result',
      targetLength,
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    });
    return {
      text: `[summarizer/${result.model}] ${result.summary}`,
      mode: 'summary',
      latencyMs: Date.now() - startedAt,
      reason,
    };
  } catch (error) {
    return {
      text: `[summarizer fallback: ${error?.message?.slice(0, 80) || 'unknown'}]\n${resultText.slice(0, fallbackKeep)}${
        resultText.length > fallbackKeep ? '\n...(truncated)' : ''
      }`,
      mode: 'fallback_truncate',
      latencyMs: Date.now() - startedAt,
      reason: error?.message || 'summarizer_failed',
    };
  }
}

function isFeatureEnabled() {
  const flag = String(config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_ENABLED') || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

module.exports = {
  summarizeToolResult,
  shouldSummarizeToolResult,
  DEFAULT_TRIGGER_CHARS,
  DEFAULT_TARGET_LENGTH,
  DEFAULT_FALLBACK_KEEP_CHARS,
};
