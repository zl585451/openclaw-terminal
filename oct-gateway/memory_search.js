/**
 * 记忆搜索：基于 Nocturne GET /browse/glossary 索引，支持关键词模糊匹配与缓存。
 */

const config = require('./config');
const memory = require('./memory');
const { createLogger } = require('./logger');
const log = createLogger('memory_search');

// ═══════════════════════════════════════════════════════════════
// 记忆检索优化：倒排索引 + 缓存大小限制
// ═══════════════════════════════════════════════════════════════
const MAX_GLOSSARY_ENTRIES = 500; // glossary 缓存上限

let glossaryCache = null;
let glossaryCacheExpires = 0;
let invertedIndex = new Map(); // keyword片段 → [entry indices]

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
  invertedIndex.clear();
}

// 构建倒排索引，避免每次全量遍历
function buildInvertedIndex(glossary) {
  invertedIndex.clear();
  if (!glossary || !Array.isArray(glossary)) return;
  
  glossary.forEach((entry, idx) => {
    const keyword = (entry.keyword || '').toLowerCase();
    if (!keyword) return;
    
    // 按空格分词，每个词建索引
    const tokens = keyword.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (!invertedIndex.has(token)) invertedIndex.set(token, []);
      invertedIndex.get(token).push(idx);
    }
    // 整个关键词也建索引
    if (!invertedIndex.has(keyword)) invertedIndex.set(keyword, []);
    invertedIndex.get(keyword).push(idx);
  });
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
    let list = data?.glossary || data || [];
    
    // 优化：限制缓存大小，按优先级排序保留 top N
    if (Array.isArray(list) && list.length > MAX_GLOSSARY_ENTRIES) {
      list = list
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .slice(0, MAX_GLOSSARY_ENTRIES);
    }
    
    glossaryCache = Array.isArray(list) ? list : [];
    glossaryCacheExpires = Date.now() + getCacheTtlMs();
    
    // 构建倒排索引
    buildInvertedIndex(glossaryCache);
    
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
  if (glossaryCache) log.info('glossary warmed', { entries: glossaryCache.length });
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
    // 优化：使用倒排索引快速定位候选
    const tokens = q.split(/\s+/).filter(Boolean);
    const candidateIndices = new Set();

    // 先从倒排索引获取候选
    for (const token of tokens) {
      // 精确匹配
      if (invertedIndex.has(token)) {
        invertedIndex.get(token).forEach(i => candidateIndices.add(i));
      }
      // 前缀匹配（只在候选少时）
      if (candidateIndices.size < 20) {
        for (const [key, indices] of invertedIndex) {
          if (key.startsWith(token) || token.startsWith(key)) {
            indices.forEach(i => candidateIndices.add(i));
          }
        }
      }
    }

    // 如果倒排索引没有命中，回退到全量遍历
    const indicesToCheck = candidateIndices.size > 0
      ? [...candidateIndices]
      : glossary.map((_, i) => i);

    for (const idx of indicesToCheck) {
      const entry = glossary[idx];
      if (!entry) continue;
      
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
