'use strict';

const webSearch = require('./web_search');

function makeSemaphore(limit) {
  let active = 0;
  const queue = [];
  const acquire = () =>
    new Promise((resolve) => {
      const tryRun = () => {
        if (active < limit) {
          active++;
          resolve();
        } else {
          queue.push(tryRun);
        }
      };
      tryRun();
    });
  const release = () => {
    active--;
    if (queue.length) queue.shift()();
  };
  return { acquire, release };
}

module.exports = {
  name: 'parallel_web_research',
  timeoutMs: 60000,

  definition: {
    type: 'function',
    function: {
      name: 'parallel_web_research',
      description:
        '并行执行多个独立网络搜索，比多次单独调用 web_search 快 3-5 倍。' +
        '适合需要同时调研 2-5 个不同关键词/维度的场景。结果按查询分组返回。',
      parameters: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            description: '2-5 个独立搜索关键词，每个维度一条',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 5,
          },
          engine: {
            type: 'string',
            description: '搜索引擎，默认 auto（自动选择）',
            enum: ['auto', 'brave', 'duckduckgo', 'tavily'],
          },
          count: {
            type: 'number',
            description: '每个查询返回的结果数，默认 6',
          },
          enrich: {
            type: 'boolean',
            description: '是否抓取每个查询前 2 条结果的网页正文片段，默认 true',
          },
          maxConcurrent: {
            type: 'number',
            description: '最大并发搜索数，默认 3，最大 5',
          },
        },
        required: ['queries'],
      },
    },
  },

  execute: async (args) => {
    const queries = (args.queries || [])
      .slice(0, 5)
      .map((q) => String(q).trim())
      .filter(Boolean);

    if (queries.length < 2) {
      return {
        success: false,
        error: '至少需要 2 个查询词，单次搜索请直接用 web_search',
        data: null,
      };
    }

    const engine = args.engine || 'auto';
    const count = Math.min(8, Math.max(3, Number(args.count) || 6));
    const enrich = args.enrich !== false;
    const sem = makeSemaphore(Math.min(5, Math.max(1, Number(args.maxConcurrent) || 3)));

    const runOne = async (query) => {
      await sem.acquire();
      try {
        const result = await Promise.race([
          webSearch.execute({ query, engine, count, enrich }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`查询超时（20s）`)), 20000)
          ),
        ]);
        return { query, ok: true, result };
      } catch (err) {
        return { query, ok: false, error: err?.message || String(err) };
      } finally {
        sem.release();
      }
    };

    const startMs = Date.now();
    const settled = await Promise.all(queries.map(runOne));
    const elapsedMs = Date.now() - startMs;

    const data = settled.map(({ query, ok, result, error }) => {
      if (!ok) {
        return {
          query,
          success: false,
          error,
          results: [],
          searchQuality: { level: 'empty', reason: `查询失败: ${error}` },
        };
      }
      return {
        query,
        success: result.success,
        engine: result.data?.engine || engine,
        searchQuality: result.searchQuality,
        results: (result.data?.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet || '',
          ...(r.excerpt ? { excerpt: r.excerpt } : {}),
        })),
        ...(result.data?.answer ? { answer: result.data.answer } : {}),
      };
    });

    const successCount = data.filter((s) => s.success).length;

    return {
      success: successCount > 0,
      parallelSearchSummary: {
        queriesRequested: queries.length,
        queriesSucceeded: successCount,
        totalResultsReturned: data.reduce((n, s) => n + s.results.length, 0),
        elapsedMs,
      },
      data,
      ...(successCount === 0 ? { error: '所有并行查询均失败' } : {}),
    };
  },
};
