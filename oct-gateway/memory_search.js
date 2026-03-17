/**
 * 记忆搜索：基于 Nocturne GET /browse/glossary 索引，支持关键词模糊匹配与缓存。
 */

const config = require('./config');
const memory = require('./memory');

let glossaryCache = null;
let glossaryCacheExpires = 0;

function getCacheTtlMs() {
  const ttl = (config.memory && config.memory.search_cache_ttl) || 300;
  return ttl * 1000;
}

function isCacheValid() {
  return glossaryCache && Date.now() < glossaryCacheExpires;
}

function invalidateGlossaryCache() {
  glossaryCache = null;
  glossaryCacheExpires = 0;
}

/**
 * 拉取 glossary 并写入缓存
 */
async function fetchGlossary() {
  try {
    const base = config.NOCTURNE_BASE_URL || 'http://127.0.0.1:8000';
    const res = await fetch(`${base}/browse/glossary`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const list = data?.glossary || data || [];
    glossaryCache = Array.isArray(list) ? list : [];
    glossaryCacheExpires = Date.now() + getCacheTtlMs();
    return glossaryCache;
  } catch (e) {
    return null;
  }
}

/**
 * 获取 glossary（优先缓存，过期或空则请求）
 */
async function getGlossaryCache() {
  if (isCacheValid()) return glossaryCache;
  return await fetchGlossary();
}

/**
 * 启动时预热缓存（在 index.js 中调用）
 */
async function warmGlossaryCache() {
  if (!config.memory || config.memory.enable_memory_search !== true) return;
  const alive = await memory.isAlive();
  if (!alive) return;
  await fetchGlossary();
  if (glossaryCache) console.log('[Memory] 搜索索引已预热，词条数:', glossaryCache.length);
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

  const glossary = await getGlossaryCache();
  const seen = new Set();
  const candidates = [];

  if (glossary && glossary.length > 0) {

  for (const entry of glossary) {
    const keyword = (entry.keyword || '').toLowerCase();
    const nodes = entry.nodes || [];
    let score = 0;
    if (keyword === q) score = 1.0;
    else if (keyword.includes(q)) score = 0.8;
    else if (q.includes(keyword)) score = 0.6;
    else continue;

    for (const node of nodes) {
      const uri = node.uri || '';
      if (!uri || seen.has(uri)) continue;
      const m = uri.match(/^([^:]+):\/\/(.+)$/);
      if (domain && m && m[1] !== domain) continue;
      seen.add(uri);
      candidates.push({
        uri,
        content_snippet: node.content_snippet || '',
        match_score: score,
      });
    }
  }

  candidates.sort((a, b) => b.match_score - a.match_score);
  const top = candidates.slice(0, limit);

  if (includeContent && top.length > 0) {
    const results = [];
    for (const c of top) {
      const r = await memory.readMemory(c.uri);
      let content = c.content_snippet;
      let priority = 2;
      if (r.ok && r.data) {
        const node = r.data?.node || r.data;
        content = node?.content ?? node?.content_snippet ?? content;
        priority = node?.priority ?? 2;
      }
      results.push({
        uri: c.uri,
        content: content ? content.slice(0, 500) : '',
        priority,
        match_score: c.match_score,
      });
    }
    return { ok: true, data: results };
  }

  if (top.length > 0) {
    return {
      ok: true,
      data: includeContent
        ? await Promise.all(
            top.map(async (c) => {
              const r = await memory.readMemory(c.uri);
              let content = c.content_snippet;
              let priority = 2;
              if (r.ok && r.data) {
                const node = r.data?.node || r.data;
                content = node?.content ?? node?.content_snippet ?? content;
                priority = node?.priority ?? 2;
              }
              return { uri: c.uri, content: content ? content.slice(0, 500) : '', priority, match_score: c.match_score };
            })
          )
        : top.map((c) => ({ uri: c.uri, content: c.content_snippet, match_score: c.match_score, priority: 2 })),
    };
  }
  }

  // 无 glossary 匹配时回退到 path 搜索
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
      const r = await memory.readMemory(out[i].uri);
      if (r.ok && r.data) {
        const node = r.data?.node || r.data;
        out[i].content = (node?.content ?? '').slice(0, 500);
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
