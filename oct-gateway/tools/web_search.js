const shared = require('./shared');

async function fetchPageExcerpt(proxyFetch, url, maxChars = 600) {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  try {
    const res = await proxyFetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, maxChars);
  } catch {
    return '';
  }
}

async function enrichResults(proxyFetch, results, limit = 2) {
  const list = results || [];
  /** 按原始下标取前 limit 条带 url 的项，避免 filter/slice 后与 idx 错位 */
  const indices = [];
  for (let i = 0; i < list.length && indices.length < limit; i++) {
    if (list[i]?.url) indices.push(i);
  }
  if (!indices.length) return results;

  const enrichedPairs = await Promise.all(
    indices.map(async (i) => {
      const item = list[i];
      const excerpt = await fetchPageExcerpt(proxyFetch, item.url, 600);
      if (!excerpt) return [i, item];
      return [
        i,
        {
          ...item,
          snippet: item.snippet && item.snippet.length > 40
            ? item.snippet
            : excerpt,
          excerpt,
        },
      ];
    })
  );

  const out = [...list];
  for (const [i, item] of enrichedPairs) {
    out[i] = item;
  }
  return out;
}

function toolSearchFail(error, hint) {
  return { success: false, data: null, error, hint: hint || null };
}

/** 成功响应：data 为规范载荷，legacy 中的字段同步保留在顶层以兼容旧消费方 */
function toolSearchOk(data, legacy) {
  const hint =
    legacy && Object.prototype.hasOwnProperty.call(legacy, 'hint')
      ? legacy.hint
      : data && data.hint != null
        ? data.hint
        : null;
  return {
    success: true,
    data,
    error: null,
    hint,
    ...legacy,
  };
}

module.exports = {
  name: 'web_search',
  category: 'web',
  riskLevel: 'guarded',
  displayName: '网页搜索',
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网内容，返回相关结果摘要。优先使用此工具获取最新信息；当搜索摘要过短时会自动补抓前几个结果的网页正文片段。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          engine: { type: 'string', description: '搜索引擎：auto/brave/duckduckgo/tavily，默认 auto（自动降级）', enum: ['auto', 'brave', 'duckduckgo', 'tavily'] },
          count: { type: 'number', description: '返回结果数量，默认 8' },
          freshness: { type: 'string', description: '时间范围（仅 Brave）：pd(过去一天)/pw(过去一周)/pm(过去一月)' },
          enrich: { type: 'boolean', description: '是否自动补抓前几个结果的网页正文片段，默认 true' },
        },
        required: ['query'],
      },
    },
  },
  execute: async (args) => {
    const { proxyFetch, config, log } = shared;
    const query = args.query;
    const engine = args.engine || 'auto';
    const count = Math.min(10, Math.max(1, Number(args.count) || 8));
    const freshness = args.freshness;
    const enrich = args.enrich !== false;
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
      return toolSearchFail(
        'BRAVE_SEARCH_API_KEY 未配置，请在 .env 中填入',
        '配置 BRAVE_SEARCH_API_KEY，或改用 engine=duckduckgo / tavily（视可用性）'
      );
    }
    if (useEngine === 'tavily' && !tavilyKey) {
      return toolSearchFail(
        'TAVILY_API_KEY 未配置，请在 .env 中填入',
        '配置 TAVILY_API_KEY，或改用 engine=brave / duckduckgo'
      );
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
        const braveJson = await res.json();
        let results = (braveJson.web?.results || []).slice(0, count).map(r => ({
          title: r.title, url: r.url, snippet: r.description || '',
        }));
        if (enrich) {
          results = await enrichResults(proxyFetch, results, Math.min(2, results.length));
        }
        const payload = { engine: 'brave', query, results, enriched: enrich };
        return toolSearchOk(payload, { engine: 'brave', query, results, enriched: enrich });
      } catch (braveErr) {
        if (engine === 'auto') {
          log.warn('Brave search failed, falling back to DuckDuckGo', { query, error: braveErr?.message });
          try {
            let results = await doDuckDuckGo(query, count);
            if (results.length === 0) {
              const h = 'DuckDuckGo 无即时结果（国内可能无法访问），建议配置 Brave 或 Tavily';
              const payload = { engine: 'duckduckgo', query, results: [], fallback: true, enriched: enrich, hint: h };
              return toolSearchOk(payload, {
                engine: 'duckduckgo',
                query,
                results: [],
                fallback: true,
                enriched: enrich,
                hint: h,
              });
            }
            if (enrich) {
              results = await enrichResults(proxyFetch, results, Math.min(2, results.length));
            }
            const payload2 = { engine: 'duckduckgo', query, results, fallback: true, enriched: enrich };
            return toolSearchOk(payload2, {
              engine: 'duckduckgo',
              query,
              results,
              fallback: true,
              enriched: enrich,
            });
          } catch (ddgErr) {
            return toolSearchFail(
              `Brave 失败: ${braveErr?.message}，降级 DuckDuckGo 也失败: ${ddgErr?.message}`,
              '检查网络与 API 密钥，或稍后重试'
            );
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
            search_depth: 'advanced', include_answer: true,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Tavily API ${res.status}`);
        const tavilyJson = await res.json();
        let results = (tavilyJson.results || []).slice(0, count).map(r => ({
          title: r.title, url: r.url, snippet: r.content || '',
        }));
        if (enrich) {
          results = await enrichResults(proxyFetch, results, Math.min(2, results.length));
        }
        const answer = tavilyJson.answer || '';
        const payloadTv = { engine: 'tavily', query, answer, results, enriched: enrich };
        return toolSearchOk(payloadTv, { engine: 'tavily', query, answer, results, enriched: enrich });
      } catch (tavilyErr) {
        if (engine === 'auto') {
          log.warn('Tavily search failed, falling back to DuckDuckGo', { query, error: tavilyErr?.message });
          try {
            let results = await doDuckDuckGo(query, count);
            if (results.length === 0) {
              const h = 'DuckDuckGo 无即时结果（国内可能无法访问）';
              const dataEmpty = { engine: 'duckduckgo', query, results: [], fallback: true, enriched: enrich, hint: h };
              return toolSearchOk(dataEmpty, {
                engine: 'duckduckgo',
                query,
                results: [],
                fallback: true,
                enriched: enrich,
                hint: h,
              });
            }
            if (enrich) {
              results = await enrichResults(proxyFetch, results, Math.min(2, results.length));
            }
            const dataFb = { engine: 'duckduckgo', query, results, fallback: true, enriched: enrich };
            return toolSearchOk(dataFb, {
              engine: 'duckduckgo',
              query,
              results,
              fallback: true,
              enriched: enrich,
            });
          } catch (ddgErr) {
            return toolSearchFail(
              `Tavily 失败: ${tavilyErr?.message}，降级 DuckDuckGo 也失败: ${ddgErr?.message}`,
              '检查网络与 API 密钥，或稍后重试'
            );
          }
        }
        throw tavilyErr;
      }
    } else {
      let results = await doDuckDuckGo(query, count);
      if (results.length === 0) {
        const h = 'DuckDuckGo 无即时结果（国内可能无法访问），建议用 Brave 或 Tavily';
        const dataEmpty = { engine: 'duckduckgo', query, results: [], enriched: enrich, hint: h };
        return toolSearchOk(dataEmpty, { engine: 'duckduckgo', query, results: [], enriched: enrich, hint: h });
      }
      if (enrich) {
        results = await enrichResults(proxyFetch, results, Math.min(2, results.length));
      }
      const dataDdg = { engine: 'duckduckgo', query, results, enriched: enrich };
      return toolSearchOk(dataDdg, { engine: 'duckduckgo', query, results, enriched: enrich });
    }
  },
};
