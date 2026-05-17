/**
 * 记忆搜索：默认走 Memory v2 本地 notes/raw-turn 搜索。
 */

const config = require('./config');
const memory = require('./memory');
const { stripCotText } = require('./cot_sanitize');
const { createLogger } = require('./logger');
const log = createLogger('memory_search');

// ═══════════════════════════════════════════════════════════════
// 记忆检索优化：倒排索引 + 缓存大小限制
// ═══════════════════════════════════════════════════════════════
function invalidateGlossaryCache() {
  return;
}

/**
 * 获取 glossary（优先缓存，过期或空则请求）
 */
async function getGlossaryCache() {
  return [];
}

/**
 * 启动时预热缓存（在 index.js 中调用）
 */
async function warmGlossaryCache() {
  if (!config.memory || config.memory.enable_memory_search !== true) return;
  log.info('memory search ready', { backend: config.memory?.backend || 'file' });
}

/**
 * 按关键词搜索记忆节点
 * @param {string} query - 搜索词
 * @param {object} [options] - { domain: 'core', limit: 10, include_content: true }
 * @returns {Promise<{ ok: boolean, data?: Array<{ uri, content?, priority?, match_score }>, error?: string }>}
 */
async function searchMemory(query, options = {}) {
  const domain = options.domain || 'core';
  const limit = Math.min(Number(options.limit) || (config.memory && config.memory.search_default_limit) || 10, 50);
  const includeContent = options.include_content !== false;

  if (!query || typeof query !== 'string') {
    return { ok: false, error: 'query 不能为空' };
  }

  if (!config.memory || config.memory.enable_memory_search !== true) {
    return { ok: true, data: [] };
  }

  const q = query.trim().toLowerCase();
  if (!q) return { ok: true, data: [] };

  const fallback = await memory.searchMemory(query, domain);
  if (!fallback.ok || !fallback.data || fallback.data.length === 0) {
    return { ok: true, data: [] };
  }
  const limited = fallback.data.slice(0, limit);
  const out = limited.map((m) => ({
    uri: m.uri || `${m.domain}://${m.path}`,
    content: '',
    priority: 2,
    match_score: 0.5,
  }));
  if (includeContent) {
    for (let i = 0; i < out.length; i++) {
      const r = await memory.readMemory(out[i].uri, { treat404AsDebug: true });
      if (r.ok && r.data) {
        const node = r.data?.node || r.data;
        out[i].content = stripCotText(node?.content ?? '').slice(0, 500);
        out[i].priority = node?.priority ?? 2;
      }
    }
  }
  return { ok: true, data: out };
}

module.exports = {
  searchMemory,
  getGlossaryCache,
  warmGlossaryCache,
  invalidateGlossaryCache,
};
