/**
 * 摘要专用 API 客户端
 * 兼容 OpenAI Chat Completions 协议
 * 完全独立于主对话模型，不共享任何状态
 */
const config = require('../config');
const { createLogger } = require('../logger');

const logger = createLogger('summarizer');
const SUMMARIZER_TIMEOUT_MS = 120000;

/**
 * 调用摘要模型
 * @param {Array<{role:string, content:string}>} messages
 * @param {Object} opts - { maxTokens, temperature }
 * @returns {Promise<string>} 模型输出文本
 */
async function callSummarizer(messages, opts = {}) {
  const { summarizer } = config.memory;
  if (!summarizer.enabled) {
    throw new Error('SUMMARIZER_DISABLED');
  }

  const { baseUrl, apiKey, model } = summarizer.api;
  if (!baseUrl || !apiKey || !model) {
    throw new Error('SUMMARIZER_NOT_CONFIGURED: 请检查 SUMMARIZER_BASE_URL/API_KEY/MODEL');
  }

  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const payload = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 3000,
    temperature: opts.temperature ?? 0.3,
    stream: false,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SUMMARIZER_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`SUMMARIZER_HTTP_${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  if (!content) {
    throw new Error('SUMMARIZER_EMPTY_RESPONSE');
  }
  return content;
}

async function callSummarizerWithRetry(messages, opts = {}) {
  const { retry } = config.memory.summarizer;
  let lastErr;
  for (let attempt = 0; attempt < retry.maxAttempts; attempt += 1) {
    try {
      return await callSummarizer(messages, opts);
    } catch (err) {
      lastErr = err;
      logger.warn('[Summarizer] 调用失败，准备重试', {
        attempt: attempt + 1,
        error: err.message,
      });
      if (attempt < retry.maxAttempts - 1) {
        const delay = retry.backoffMs[attempt] || 60000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastErr;
}

module.exports = {
  callSummarizer,
  callSummarizerWithRetry,
};
