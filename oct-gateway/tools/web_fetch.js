const shared = require('./shared');

module.exports = {
  name: 'web_fetch',
  definition: {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: '获取指定 URL 的网页内容，适合已知链接的详细阅读',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要获取的完整 URL' },
        },
        required: ['url'],
      },
    },
  },
  execute: async (args) => {
    const { proxyFetch, fetchCache, cleanupFetchCache, FETCH_CACHE_TTL, FETCH_CACHE_MAX, MAX_CACHED_CONTENT_SIZE, log } = shared;
    cleanupFetchCache();
    const url = args.url;
    log.debug('web_fetch start', { url });
    const cached = fetchCache.get(url);
    if (cached && Date.now() - cached.timestamp < FETCH_CACHE_TTL) {
      log.debug('web_fetch cache hit', { url, status: cached.status });
      return { success: true, content: cached.content, status: cached.status, cached: true };
    }
    const res = await proxyFetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').slice(0, MAX_CACHED_CONTENT_SIZE);
    fetchCache.set(url, { content: stripped, status: res.status, timestamp: Date.now() });
    if (fetchCache.size > FETCH_CACHE_MAX) {
      const firstKey = fetchCache.keys().next().value;
      if (firstKey !== undefined) fetchCache.delete(firstKey);
    }
    log.info('web_fetch done', { url, status: res.status, bytes: stripped.length });
    return { success: true, content: stripped, status: res.status, cached: false };
  },
};
