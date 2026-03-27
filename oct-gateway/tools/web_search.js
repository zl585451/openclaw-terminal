const shared = require('./shared');

module.exports = {
  name: 'web_search',
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网内容，返回相关结果摘要。优先使用此工具获取最新信息。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          engine: { type: 'string', description: '搜索引擎：auto/brave/duckduckgo/tavily，默认 auto（自动降级）', enum: ['auto', 'brave', 'duckduckgo', 'tavily'] },
          count: { type: 'number', description: '返回结果数量，默认 5' },
          freshness: { type: 'string', description: '时间范围（仅 Brave）：pd(过去一天)/pw(过去一周)/pm(过去一月)' },
        },
        required: ['query'],
      },
    },
  },
  execute: async (args) => {
    const { proxyFetch, config, log } = shared;
    const query = args.query;
    const engine = args.engine || 'auto';
    const count = args.count || 5;
    const freshness = args.freshness;
    const braveKey = config.BRAVE_SEARCH_API_KEY || '';
    const tavilyKey = config.TAVILY_API_KEY || '';

    const doDuckDuckGo = async (q, cnt) => {
      const res = await proxyFetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`DDG API ${res.status}`);
      const data = await res.json();
      const results = [];
      if (data.AbstractText) {
        results.push({ title: data.Heading || q, url: data.AbstractURL || '', snippet: data.AbstractText });
      }
      for (const t of (data.RelatedTopics || []).slice(0, cnt - 1)) {
        if (t.Text && t.FirstURL) {
          results.push({ title: t.Text.slice(0, 60), url: t.FirstURL, snippet: t.Text });
        }
      }
      return results;
    };

    const useEngine = engine === 'auto'
      ? (braveKey ? 'brave' : (tavilyKey ? 'tavily' : 'duckduckgo'))
      : engine;

    if (useEngine === 'brave' && !braveKey) {
      return { success: false, error: 'BRAVE_SEARCH_API_KEY 未配置，请在 .env 中填入' };
    }
    if (useEngine === 'tavily' && !tavilyKey) {
      return { success: false, error: 'TAVILY_API_KEY 未配置，请在 .env 中填入' };
    }

    if (useEngine === 'brave') {
      try {
        const params = new URLSearchParams({ q: query, count: String(count) });
        if (freshness) params.set('freshness', freshness);
        const res = await proxyFetch(
          `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
          {
            headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!res.ok) throw new Error(`Brave API ${res.status}`);
        const data = await res.json();
        const results = (data.web?.results || []).slice(0, count).map(r => ({
          title: r.title, url: r.url, snippet: r.description || '',
        }));
        return { success: true, engine: 'brave', query, results };
      } catch (braveErr) {
        if (engine === 'auto') {
          log.warn('Brave search failed, falling back to DuckDuckGo', { query, error: braveErr?.message });
          try {
            const results = await doDuckDuckGo(query, count);
            if (results.length === 0) {
              return { success: true, engine: 'duckduckgo', query, results: [], fallback: true, hint: 'DuckDuckGo 无即时结果（国内可能无法访问），建议配置 Brave 或 Tavily' };
            }
            return { success: true, engine: 'duckduckgo', query, results, fallback: true };
          } catch (ddgErr) {
            return { success: false, error: `Brave 失败: ${braveErr?.message}，降级 DuckDuckGo 也失败: ${ddgErr?.message}` };
          }
        }
        throw braveErr;
      }
    } else if (useEngine === 'tavily') {
      try {
        const res = await proxyFetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey, query, max_results: count,
            search_depth: 'basic', include_answer: true,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Tavily API ${res.status}`);
        const data = await res.json();
        const results = (data.results || []).slice(0, count).map(r => ({
          title: r.title, url: r.url, snippet: r.content || '',
        }));
        return { success: true, engine: 'tavily', query, answer: data.answer || '', results };
      } catch (tavilyErr) {
        if (engine === 'auto') {
          log.warn('Tavily search failed, falling back to DuckDuckGo', { query, error: tavilyErr?.message });
          try {
            const results = await doDuckDuckGo(query, count);
            if (results.length === 0) {
              return { success: true, engine: 'duckduckgo', query, results: [], fallback: true, hint: 'DuckDuckGo 无即时结果（国内可能无法访问）' };
            }
            return { success: true, engine: 'duckduckgo', query, results, fallback: true };
          } catch (ddgErr) {
            return { success: false, error: `Tavily 失败: ${tavilyErr?.message}，降级 DuckDuckGo 也失败: ${ddgErr?.message}` };
          }
        }
        throw tavilyErr;
      }
    } else {
      const results = await doDuckDuckGo(query, count);
      if (results.length === 0) {
        return { success: true, engine: 'duckduckgo', query, results: [], hint: 'DuckDuckGo 无即时结果（国内可能无法访问），建议用 Brave 或 Tavily' };
      }
      return { success: true, engine: 'duckduckgo', query, results };
    }
  },
};
