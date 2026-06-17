const shared = require('./shared');
const vectorDb = require('../memory_vector/db');
const { embedOne } = require('../summarizer/embedding_client');
const recaller = require('../memory_vector/recaller');

function nodeContent(result) {
  return result?.data?.node?.content || result?.data?.content || result?.node?.content || result?.content || '';
}

function nodeChildren(result) {
  return result?.data?.node?.children || result?.data?.children || result?.node?.children || result?.children || [];
}

function uriFromChild(child) {
  if (child?.uri) return child.uri;
  if (child?.path) return `core://${child.path}`;
  return '';
}

async function searchKeyword(args) {
  const { memorySearch, log } = shared;
  const query = String(args.query || '').trim();
  const domain = args.domain || 'core';
  const limit = Math.min(20, Math.max(1, Number(args.limit) || 10));
  if (!query) {
    return {
      success: false,
      data: null,
      error: 'query 不能为空',
      hint: '请传入记忆关键词，例如 OCT、Claude、记忆系统',
    };
  }
  log.debug('memory_search', { query, domain, limit, mode: 'keyword' });
  const r = await memorySearch.searchMemory(query, {
    domain,
    limit,
    include_content: true,
  });
  if (!r.ok) {
    return {
      success: false,
      data: null,
      error: r.error,
      hint: '检查记忆后端是否在线，或换一个更具体的关键词',
      query,
      domain,
      mode: 'keyword',
    };
  }
  const results = r.data || [];
  log.info('memory_search done', { query, results: results.length, mode: 'keyword' });
  return {
    success: true,
    data: { query, domain, mode: 'keyword', results },
    error: null,
    hint: results.length === 0 ? '未命中记忆，可换关键词，或尝试更具体的人名/项目名/主题词' : null,
    query,
    domain,
    mode: 'keyword',
    results,
  };
}

async function searchDate(args) {
  const { memory } = shared;
  const date = String(args.date || '').trim();
  const keyword = String(args.keyword || args.query || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(20, Number(args.limit) || 5));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      success: false,
      data: null,
      error: '日期格式错误，应为 YYYY-MM-DD',
      hint: '请传入 date，例如 2026-04-20；可选 keyword/query 用于过滤',
      mode: 'date',
    };
  }

  const browseResult = await memory.readMemory(`core://logs/raw/${date}`, { treat404AsDebug: true });
  const children = nodeChildren(browseResult);
  if (!browseResult.ok || children.length === 0) {
    return {
      success: true,
      data: { mode: 'date', date, keyword: keyword || null, returned: 0, turns: [], message: `${date} 无对话记录` },
      error: null,
      hint: null,
      mode: 'date',
    };
  }

  const turns = [];
  for (const child of children) {
    const uri = uriFromChild(child);
    if (!uri) continue;
    const r = await memory.readMemory(uri, { treat404AsDebug: true });
    if (!r.ok) continue;
    try {
      const turn = JSON.parse(nodeContent(r) || '{}');
      if (keyword) {
        const text = `${turn.user || ''} ${turn.assistant || ''}`.toLowerCase();
        if (!text.includes(keyword)) continue;
      }
      turns.push({
        uri,
        ts: turn.ts,
        user: String(turn.user || '').slice(0, 500),
        assistant: String(turn.assistant || '').slice(0, 500),
        tools: turn.tools || [],
      });
      if (turns.length >= limit) break;
    } catch {}
  }

  return {
    success: true,
    data: {
      mode: 'date',
      date,
      keyword: keyword || null,
      returned: turns.length,
      turns,
    },
    error: null,
    hint: turns.length === 0 && keyword ? '该日期有记录，但未命中过滤关键词；可去掉关键词或换更具体词' : null,
    mode: 'date',
  };
}

async function searchVector(args) {
  const { config } = shared;
  const query = String(args.query || '').trim();
  const topK = Math.max(1, Math.min(10, Number(args.topK || args.limit) || 5));
  const thresholdRaw = Number(args.threshold);
  const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, Math.min(1, thresholdRaw)) : undefined;

  if (!query) {
    return {
      success: false,
      data: null,
      error: 'query 不能为空',
      hint: '请传入要回忆的主题，例如“AI.library 内置模块”或“之前关于书库上传的讨论”',
      mode: 'vector',
    };
  }

  if (config.memory?.vectorRecall?.enabled !== true) {
    return {
      success: false,
      data: null,
      error: 'vector_recall_disabled',
      hint: '当前向量召回未启用，请先在设置中打开“向量召回配置”并重启 Gateway',
      mode: 'vector',
    };
  }

  const vector = await embedOne(query);
  const hits = vectorDb.searchSimilar(vector, {
    topK,
    threshold: threshold ?? config.memory.vectorRecall.recall.manualThreshold,
  }).map((hit) => {
    const lexical = recaller.scoreLexicalOverlap(query, hit);
    const similarity = Number(hit.similarity || 0);
    const confidence = similarity >= (config.memory.vectorRecall.recall.strongThreshold ?? 0.84)
      ? 'high'
      : similarity >= (config.memory.vectorRecall.recall.autoThreshold ?? 0.78) && lexical.overlap > 0
        ? 'medium'
        : 'low';
    return {
      ...hit,
      lexical_overlap: Number(lexical.overlap.toFixed(4)),
      lexical_matches: lexical.matched.slice(0, 8),
      confidence,
    };
  });
  const lexicalHits = hits.length === 0 ? vectorDb.searchText(query, { limit: topK, currentModelOnly: true }) : [];
  const returnedHits = hits.length > 0 ? hits : lexicalHits.map((hit) => ({ ...hit, confidence: 'low' }));

  return {
    success: true,
    data: {
      mode: 'vector',
      query,
      search_mode: hits.length > 0 ? 'vector' : 'lexical_fallback',
      confidence: hits.some((hit) => hit.confidence === 'high') ? 'high' : hits.length > 0 ? 'medium_or_low' : 'low',
      returned: returnedHits.length,
      hits: returnedHits.map((hit) => ({
        uri: hit.uri,
        date: hit.date,
        session: hit.session || 'default',
        confidence: hit.confidence || 'low',
        similarity: hit.similarity != null ? Number((hit.similarity || 0).toFixed(4)) : null,
        lexical_score: hit.lexical_score != null ? Number((hit.lexical_score || 0).toFixed(4)) : null,
        lexical_overlap: hit.lexical_overlap != null ? Number((hit.lexical_overlap || 0).toFixed(4)) : null,
        lexical_matches: Array.isArray(hit.lexical_matches) ? hit.lexical_matches : [],
        text_preview: String(hit.text_preview || '').slice(0, 200),
        user_text: String(hit.user_text || '').slice(0, 500),
        assistant_text: String(hit.assistant_text || '').slice(0, 500),
        source_ts: hit.source_ts || '',
      })),
    },
    error: null,
    hint: hits.length > 0
      ? null
      : lexicalHits.length > 0
        ? '语义召回未命中，已回退到文本候选；这些结果适合人工核对，不建议直接当作高置信记忆'
        : '没有命中，可换更具体的主题词，或先做 /recall backfill 补历史索引',
    mode: 'vector',
  };
}

async function searchAuto(args) {
  if (args.date) return searchDate(args);
  const keyword = await searchKeyword(args);
  if (!keyword.success || keyword.results?.length > 0 || shared.config.memory?.vectorRecall?.enabled !== true) {
    return keyword;
  }
  const vector = await searchVector(args);
  return {
    ...vector,
    data: {
      ...(vector.data || {}),
      keyword_results: keyword.results || [],
    },
    hint: vector.hint || keyword.hint,
  };
}

module.exports = {
  name: 'memory_search',
  category: 'memory',
  riskLevel: 'safe',
  displayName: '搜索记忆',
  definition: {
    type: 'function',
    function: {
      name: 'memory_search',
      description: '统一搜索 Memory v2/legacy 记忆。mode=keyword 查结构化记忆，mode=vector 查历史语义候选，mode=date 按日期查原始对话；精确 URI 读取用 memory_read。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          mode: {
            type: 'string',
            enum: ['keyword', 'vector', 'date', 'auto'],
            description: '搜索模式。默认 keyword；只记得模糊主题用 vector；明确日期用 date；不确定可用 auto',
          },
          domain: { type: 'string', description: '限定域，如 core（可选）' },
          limit: { type: 'number', description: '返回条数，默认 10' },
          date: { type: 'string', description: 'mode=date 时使用，格式 YYYY-MM-DD' },
          keyword: { type: 'string', description: 'mode=date 时可选，用于过滤当天原始对话' },
          topK: { type: 'number', description: 'mode=vector 时最多返回几条，默认 5，最大 10' },
          threshold: { type: 'number', description: 'mode=vector 时相似度阈值，0 到 1' },
        },
      },
    },
  },
  execute: async (args) => {
    const mode = String(args.mode || (args.date ? 'date' : 'keyword')).trim().toLowerCase();
    if (mode === 'date' || mode === 'recall') return searchDate(args);
    if (mode === 'vector' || mode === 'semantic') return searchVector(args);
    if (mode === 'auto') return searchAuto(args);
    return searchKeyword(args);
  },
};
