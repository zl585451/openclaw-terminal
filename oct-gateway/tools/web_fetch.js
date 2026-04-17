const shared = require('./shared');

/**
 * 仅允许 http/https；拒绝 file://、javascript:、空串等。
 * @returns {{ ok: true, url: string } | { ok: false, error: string, hint: string }}
 */
function validateHttpUrl(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) {
    return { ok: false, error: 'url 为空', hint: '请传入完整的 http:// 或 https:// 链接' };
  }
  let parsed;
  try {
    parsed = new URL(s);
  } catch {
    return { ok: false, error: 'url 格式无效', hint: '请使用可解析的绝对 URL，例如 https://example.com/path' };
  }
  const proto = parsed.protocol.toLowerCase();
  if (proto === 'javascript:') {
    return { ok: false, error: '不允许 javascript: 协议', hint: '仅支持 http:// 与 https://' };
  }
  if (proto === 'file:') {
    return { ok: false, error: '不允许 file: 协议', hint: '仅支持 http:// 与 https:// 的网络地址' };
  }
  if (proto !== 'http:' && proto !== 'https:') {
    return {
      ok: false,
      error: `不支持的 URL 协议: ${proto}`,
      hint: '仅允许 http 与 https，不要使用 file、javascript、data 等协议',
    };
  }
  return { ok: true, url: parsed.href };
}

module.exports = {
  name: 'web_fetch',
  category: 'web',
  riskLevel: 'guarded',
  displayName: '网页抓取',
  timeoutMs: 45000,
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
    const rawUrl = args.url;
    log.debug('web_fetch start', { url: rawUrl });
    if (typeof rawUrl !== 'string') {
      return {
        success: false,
        data: null,
        error: 'url 必须为字符串',
        hint: '请传入完整的 http:// 或 https:// 链接',
      };
    }
    const checked = validateHttpUrl(rawUrl);
    if (!checked.ok) {
      return {
        success: false,
        data: null,
        error: checked.error,
        hint: checked.hint,
        url: rawUrl,
      };
    }
    const url = checked.url;
    try {
      const cached = fetchCache.get(url);
      if (cached && Date.now() - cached.timestamp < FETCH_CACHE_TTL) {
        log.debug('web_fetch cache hit', { url, status: cached.status });
        const data = { content: cached.content, status: cached.status, cached: true, url };
        return {
          success: true,
          data,
          error: null,
          hint: null,
          content: cached.content,
          status: cached.status,
          cached: true,
          url,
        };
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
      const data = { content: stripped, status: res.status, cached: false, url };
      return {
        success: true,
        data,
        error: null,
        hint: null,
        content: stripped,
        status: res.status,
        cached: false,
        url,
      };
    } catch (e) {
      log.warn('web_fetch failed', { url, error: e?.message });
      return {
        success: false,
        data: null,
        error: e?.message || String(e),
        hint: '检查网络、URL 是否可访问，或稍后重试',
        url,
      };
    }
  },
};
