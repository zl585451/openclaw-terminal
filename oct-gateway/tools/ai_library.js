/**
 * AI.library 知识检索模块
 * 封装 AI.library HTTP API 调用，用于音频专业知识检索
 * 未启动时静默跳过，不影响对话
 */

const config = require('../config');
const { createLogger } = require('../logger');
const log = createLogger('ai_library');

const aiLibCfg = config.ai_library || {};
const AI_LIBRARY_ENABLED = aiLibCfg.enabled !== false;
const KNOWLEDGE_SEARCH_ENABLED = aiLibCfg.knowledge_search_enabled === true;
const AI_LIBRARY_URL = aiLibCfg.url || config.AI_LIBRARY_URL || 'http://127.0.0.1:8001';
const DEFAULT_TIMEOUT_MS = aiLibCfg.timeout_ms ?? 3000;
const DEFAULT_TOP_K = aiLibCfg.default_top_k ?? 3;

// 缓存配置
const CACHE_MAX_SIZE = 10;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const searchCache = new Map();

/**
 * 将原始结果转为 UI 友好格式
 * - 来源文件加 PDF 图标 📄
 * - 相似度转百分比
 * - 长文本截断 + snippet
 */
function enhanceResults(rawResults) {
  if (!Array.isArray(rawResults)) return [];
  const TRUNCATE_LEN = 100;
  return rawResults.map((r) => {
    const content = r.content || r.text || r.chunk || '';
    const source = r.source || r.doc_id || r.id || '未知';
    const score = typeof r.score === 'number' ? r.score : (1 - (r.distance ?? 0));
    const isPdf = /\.pdf$/i.test(String(source));
    return {
      content,
      contentSnippet: content.length > TRUNCATE_LEN ? content.substring(0, TRUNCATE_LEN) + '...' : content,
      truncated: content.length > TRUNCATE_LEN,
      source,
      sourceDisplay: isPdf ? `📄 ${source}` : source,
      score,
      scorePercent: Math.round(score * 100),
    };
  });
}

/**
 * 清空搜索缓存
 */
function clearCache() {
  searchCache.clear();
  log.debug('AI.library 缓存已清空');
}

/**
 * 获取缓存 key
 */
function cacheKey(query, top_k) {
  return `${String(query || '').trim().toLowerCase()}|${top_k}`;
}

/**
 * 尝试从缓存获取
 */
function getFromCache(query, top_k) {
  const key = cacheKey(query, top_k);
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.results;
}

/**
 * 写入缓存（LRU：超限时删除最旧的）
 */
function setCache(query, top_k, results) {
  if (searchCache.size >= CACHE_MAX_SIZE) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey !== undefined) searchCache.delete(firstKey);
  }
  const key = cacheKey(query, top_k);
  searchCache.set(key, { results, timestamp: Date.now() });
}

/**
 * 调用 AI.library 搜索接口
 * @param {string} query - 搜索关键词/问题
 * @param {number} [top_k=3] - 返回条数
 * @returns {Promise<{results: Array, error?: string}>} 成功返回 {results}，失败返回 {results: [], error: string}
 */
async function searchKnowledge(query, top_k = DEFAULT_TOP_K) {
  if (!KNOWLEDGE_SEARCH_ENABLED) {
    return { results: [], error: 'knowledge_search_disabled' };
  }
  if (!AI_LIBRARY_ENABLED) {
    return { results: [], error: '📚 AI.library 未启动，请先运行 api_server.py' };
  }
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { results: [], error: '📚 请输入搜索关键词' };
  }

  const q = query.trim();

  // 缓存命中
  const cached = getFromCache(q, top_k);
  if (cached) {
    log.debug('AI.library 缓存命中', { query: q });
    return { results: cached };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(`${AI_LIBRARY_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, top_k }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.debug('AI.library 响应非 200', { status: response.status, url: AI_LIBRARY_URL });
      return { results: [], error: '📚 AI.library 未启动，请先运行 api_server.py' };
    }

    const data = await response.json();
    const rawResults = data.results || data.data || data.docs || [];

    if (!Array.isArray(rawResults) || rawResults.length === 0) {
      return { results: [], error: '📚 没找到相关内容，换个词试试？' };
    }

    const results = enhanceResults(rawResults);
    setCache(q, top_k, results);
    return { results };
  } catch (e) {
    const msg = e?.message || String(e);
    log.debug('AI.library 检索失败', { error: msg, url: AI_LIBRARY_URL });

    if (msg.includes('abort') || msg.includes('timeout') || msg.includes('Timeout')) {
      return { results: [], error: '⏱️ 搜索超时，图书馆响应太慢' };
    }
    if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('network')) {
      return { results: [], error: '📚 连接图书馆失败，请检查服务状态' };
    }
    return { results: [], error: '📚 连接图书馆失败，请检查服务状态' };
  }
}

/**
 * 将检索结果格式化为可注入 prompt 的文本
 * @param {Array|{results: Array, error?: string}|null} resultsOrObj - searchKnowledge 返回值或结果数组
 * @returns {string} 格式化后的文本，无结果返回空字符串
 */
function formatKnowledgeForPrompt(resultsOrObj) {
  let results = resultsOrObj;
  if (resultsOrObj && typeof resultsOrObj === 'object' && !Array.isArray(resultsOrObj)) {
    if (resultsOrObj.error) return '';
    results = resultsOrObj.results || [];
  }
  if (!results || !Array.isArray(results) || results.length === 0) return '';

  const lines = results.map((r, i) => {
    const sourceDisplay = r.sourceDisplay || (r.source ? (/\.pdf$/i.test(r.source) ? `📄 ${r.source}` : r.source) : `条目${i + 1}`);
    const content = r.contentSnippet ?? (r.content || r.text || r.chunk || '');
    const scorePercent = r.scorePercent ?? (typeof r.score === 'number' ? Math.round(r.score * 100) : null);
    const scoreStr = scorePercent != null ? ` (${scorePercent}%)` : '';
    return `${i + 1}. [${sourceDisplay}]${scoreStr} ${content}`;
  });

  return '\n\n[相关知识库]\n' + lines.join('\n');
}

/**
 * 检测 AI.library 健康状态（可选，用于启动时或 /status）
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${AI_LIBRARY_URL}/health`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timeout);
    return res != null && res.ok;
  } catch {
    return false;
  }
}

module.exports = {
  searchKnowledge,
  formatKnowledgeForPrompt,
  checkHealth,
  clearCache,
};
