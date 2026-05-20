'use strict';

const config = require('../config');
const { chatCompletion, LlmClientTimeoutError, LlmClientHttpError } = require('./llmClient');

const MAX_SINGLE_INPUT_CHARS = 8000;
const DEFAULT_TIMEOUT_MS = 20000;
const PURPOSE_PROMPTS = {
  general: '把以下文本压缩成指定字数摘要，保留关键信息、数据点、结论和限制。严禁编造。',
  tool_result: '这是一次工具调用的返回结果。请提取最相关的事实、结构、错误和可执行信息。严禁编造。',
  chapter: '这是小说章节的一部分。请客观提取剧情进展、出场角色、关键事件、线索和悬念推进。严禁编造。',
  scroll: '这是一段对话历史截取。请提炼核心话题、已达成共识、未决问题和下一步计划。严禁编造。',
};

class SummarizerTimeoutError extends Error {
  constructor(message = 'Summarizer request timed out') {
    super(message);
    this.name = 'SummarizerTimeoutError';
  }
}

class SummarizerEmptyError extends Error {
  constructor(message = 'Summarizer returned empty response') {
    super(message);
    this.name = 'SummarizerEmptyError';
  }
}

async function summarize(text, options = {}) {
  const source = String(text || '').trim();
  if (!source) {
    throw new SummarizerEmptyError('待摘要文本为空');
  }
  if (source.length > MAX_SINGLE_INPUT_CHARS) {
    throw new Error(`SUMMARIZER_INPUT_TOO_LONG: ${source.length} > ${MAX_SINGLE_INPUT_CHARS}`);
  }

  const startedAt = Date.now();
  const provider = resolveSummarizerProvider(options);
  const targetLength = positiveInt(options.targetLength, 500);
  const purpose = normalizePurpose(options.purpose);
  const language = String(options.language || 'zh');
  const preserveKeywords = Array.isArray(options.preserveKeywords)
    ? options.preserveKeywords.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];

  const messages = buildMessages({
    text: source,
    purpose,
    targetLength,
    preserveKeywords,
    language,
  });

  const timeoutMs = positiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  let resultText;
  try {
    const result = await chatCompletion({
      provider,
      messages,
      maxTokens: estimateMaxTokens(targetLength),
      temperature: 0.2,
      timeoutMs,
    });
    resultText = result.content;
  } catch (error) {
    if (error?.name === 'LlmClientTimeoutError') {
      throw new SummarizerTimeoutError(`摘要请求超时：${timeoutMs}ms`);
    }
    if (error?.name === 'LlmClientHttpError') {
      const body = String(error.message || '').replace(/^LLM_HTTP_\d+:\s*/i, '');
      throw new Error(`SUMMARIZER_HTTP_${error.status}: ${body.slice(0, 400)}`);
    }
    throw error;
  }
  if (!resultText) throw new SummarizerEmptyError();

  return {
    summary: resultText,
    originalLength: source.length,
    summaryLength: resultText.length,
    model: provider.model,
    latencyMs: Date.now() - startedAt,
  };
}

async function summarizeChunks(chunks, options = {}) {
  const startedAt = Date.now();
  const normalizedChunks = Array.isArray(chunks) ? chunks : [];
  const chunkSummaryLength = positiveInt(options.chunkSummaryLength, 300);
  const finalSummaryLength = positiveInt(options.finalSummaryLength, 800);
  const purpose = normalizePurpose(options.purpose || 'chapter');
  const chunkSummaries = [];

  for (const chunk of normalizedChunks) {
    const content = String(chunk?.content || '').trim();
    if (!content) {
      chunkSummaries.push('');
      continue;
    }
    try {
      const result = await summarize(content.slice(0, MAX_SINGLE_INPUT_CHARS), {
        ...options,
        purpose,
        targetLength: chunkSummaryLength,
      });
      chunkSummaries.push(result.summary);
    } catch (error) {
      chunkSummaries.push(fallbackSummary(content, chunkSummaryLength, error));
    }
  }

  const finalInput = chunkSummaries
    .map((summary, index) => `【分块 ${index + 1}】\n${summary}`)
    .join('\n\n')
    .slice(0, MAX_SINGLE_INPUT_CHARS);
  const finalResult = finalInput
    ? await summarize(finalInput, {
        ...options,
        purpose,
        targetLength: finalSummaryLength,
      }).catch((error) => ({
        summary: fallbackSummary(finalInput, finalSummaryLength, error),
      }))
    : { summary: '' };

  return {
    chunkSummaries,
    finalSummary: finalResult.summary,
    totalChunks: normalizedChunks.length,
    totalLatencyMs: Date.now() - startedAt,
  };
}

function buildMessages({ text, purpose, targetLength, preserveKeywords, language }) {
  const keywordLine = preserveKeywords.length > 0
    ? `必须保留这些关键词：${preserveKeywords.join('、')}`
    : '没有指定必须保留的关键词。';
  const languageLine = language === 'zh' ? '请用中文输出。' : `请使用 ${language} 输出。`;
  return [
    {
      role: 'system',
      content: [
        '你是 OCT 的摘要服务，只能压缩和提取给定文本中的信息。',
        '不要补充原文没有的事实，不要推测，不要写营销话术。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        PURPOSE_PROMPTS[purpose],
        `目标长度：约 ${targetLength} 字。`,
        keywordLine,
        languageLine,
        '请直接输出摘要正文。',
        '',
        '原文：',
        text,
      ].join('\n'),
    },
  ];
}

function resolveSummarizerProvider(options = {}) {
  const envBaseUrl = String(config.getEnvOrConfig?.('SUMMARIZER_BASE_URL') || config.memory?.summarizer?.api?.baseUrl || '').trim();
  const envApiKey = String(config.getEnvOrConfig?.('SUMMARIZER_API_KEY') || config.memory?.summarizer?.api?.apiKey || '').trim();
  const envModel = String(config.getEnvOrConfig?.('SUMMARIZER_MODEL') || config.memory?.summarizer?.api?.model || '').trim();

  if (envBaseUrl && envApiKey && envModel) {
    return {
      baseUrl: envBaseUrl.replace(/\/$/, ''),
      apiKey: envApiKey,
      model: envModel,
    };
  }

  try {
    const { resolveProviderFor } = require('./llmClient');
    const resolved = resolveProviderFor('general', 'oct-plan');
    if (resolved) {
      if (resolved.source === 'current_provider') {
        const providerConfig = config.getProviderConfig?.() || {};
        const model = chooseFastModel(providerConfig.provider || providerConfig.id, resolved.model);
        return { baseUrl: resolved.baseUrl, apiKey: resolved.apiKey, model };
      }
      return { baseUrl: resolved.baseUrl, apiKey: resolved.apiKey, model: resolved.model };
    }
  } catch (err) {
    // ignore and fallback
  }

  const providerConfig = config.getProviderConfig?.() || {};
  const baseUrl = String(options.baseUrl || providerConfig.baseUrl || '').trim().replace(/\/$/, '');
  const apiKey = String(options.apiKey || providerConfig.apiKey || '').trim();
  const configuredModel = String(options.model || providerConfig.model || config.DASHSCOPE_MODEL || '').trim();
  const model = chooseFastModel(providerConfig.provider || providerConfig.id, configuredModel);

  if (!baseUrl || !apiKey || !model) {
    throw new Error('SUMMARIZER_NOT_CONFIGURED: 请配置 SUMMARIZER_* 或当前 Gateway Provider');
  }

  return { baseUrl, apiKey, model };
}

function chooseFastModel(providerId, currentModel) {
  const provider = String(providerId || '').toLowerCase();
  if (provider.includes('bailian')) return 'qwen-turbo';
  if (provider.includes('deepseek')) return 'deepseek-v4-flash';
  if (provider.includes('openai')) return 'gpt-4o-mini';
  if (provider.includes('google')) return 'google/gemini-2.5-flash';
  if (provider.includes('minimax')) return 'MiniMax-M2.7-highspeed';
  return currentModel || 'qwen-turbo';
}

function estimateMaxTokens(targetLength) {
  return Math.max(256, Math.ceil(targetLength * 1.8));
}

function fallbackSummary(text, targetLength, error) {
  const reason = error?.message ? `（摘要失败，已截取原文：${error.message.slice(0, 80)}）` : '（摘要失败，已截取原文）';
  return `${text.slice(0, Math.max(80, targetLength))}${text.length > targetLength ? '...' : ''}\n${reason}`;
}

function normalizePurpose(value) {
  const purpose = String(value || 'general');
  return PURPOSE_PROMPTS[purpose] ? purpose : 'general';
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

module.exports = {
  summarize,
  summarizeChunks,
  SummarizerTimeoutError,
  SummarizerEmptyError,
};
