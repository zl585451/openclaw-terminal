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

function buildParallelSearchQuality(groups) {
  const totalResults = groups.reduce((n, item) => n + (item.results?.length || 0), 0);
  const weakGroups = groups.filter((item) => {
    const level = item.searchQuality?.level || (item.results?.length ? 'rich' : 'empty');
    return !item.success || level === 'empty' || level === 'limited' || (item.results?.length || 0) === 0;
  });

  if (totalResults === 0) {
    return {
      level: 'empty',
      totalResults,
      weakQueries: weakGroups.length,
      reason: '所有并行查询都没有返回可用网页结果',
    };
  }

  if (weakGroups.length === groups.length || totalResults <= groups.length) {
    return {
      level: 'limited',
      totalResults,
      weakQueries: weakGroups.length,
      reason: `并行查询整体信息有限：${groups.length} 个查询共 ${totalResults} 条结果`,
    };
  }

  return {
    level: 'rich',
    totalResults,
    weakQueries: weakGroups.length,
    reason: `并行查询返回 ${totalResults} 条结果`,
  };
}

function buildParallelSearchMessage(groups, quality) {
  if (!quality || quality.level === 'rich') return null;
  const lines = [];
  lines.push('══════════════════════════════════════');
  lines.push('搜索退级警告：并行搜索结果不足');
  lines.push('══════════════════════════════════════');
  lines.push(`质量: ${quality.level}`);
  lines.push(`原因: ${quality.reason}`);
  lines.push('');
  lines.push('【各查询结果】');
  for (const group of groups) {
    const level = group.searchQuality?.level || (group.results?.length ? 'unknown' : 'empty');
    lines.push(`- ${group.query}: ${group.success ? level : 'failed'}，结果 ${group.results?.length || 0} 条`);
    if (group.error) lines.push(`  错误: ${group.error}`);
    for (const item of (group.results || []).slice(0, 2)) {
      lines.push(`  • ${item.title || '(无标题)'}`);
      if (item.url) lines.push(`    ${item.url}`);
      if (item.snippet) lines.push(`    ${String(item.snippet).slice(0, 180)}`);
    }
  }
  lines.push('');
  lines.push('【退级决策】');
  lines.push('如果这是本任务第一轮搜索，可以最多换一组更具体关键词再搜一次。');
  lines.push('如果已经补搜过，或下一轮仍是弱结果，请停止搜索，基于已知结果诚实说明信息不足。');
  lines.push('不要在没有新关键词或新线索时继续重复 web_search / parallel_web_research。');
  lines.push('══════════════════════════════════════');
  return lines.join('\n');
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
    const parallelSearchQuality = buildParallelSearchQuality(data);
    const message = buildParallelSearchMessage(data, parallelSearchQuality);

    return {
      success: successCount > 0,
      searchQuality: parallelSearchQuality,
      parallelSearchSummary: {
        queriesRequested: queries.length,
        queriesSucceeded: successCount,
        totalResultsReturned: data.reduce((n, s) => n + s.results.length, 0),
        elapsedMs,
        weakQueries: parallelSearchQuality.weakQueries,
      },
      data,
      ...(message ? { message } : {}),
      ...(message ? { hint: '搜索结果不足时不要空转；最多补搜一次，仍弱则诚实收尾' } : {}),
      ...(successCount === 0 ? { error: '所有并行查询均失败' } : {}),
    };
  },
};
