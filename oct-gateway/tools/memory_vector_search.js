const config = require('../config');
const db = require('../memory_vector/db');
const { embedOne } = require('../summarizer/embedding_client');
const recaller = require('../memory_vector/recaller');

module.exports = {
  name: 'memory_vector_search',
  category: 'memory',
  riskLevel: 'safe',
  displayName: '语义搜索历史对话',
  definition: {
    type: 'function',
    function: {
      name: 'memory_vector_search',
      description: '按语义搜索向量记忆库中的历史对话片段。适合用户问“我们之前是不是聊过这个”“你自己查一下以前关于这个主题的数据内容”。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '要查找的主题、问题或概念描述' },
          topK: { type: 'number', description: '最多返回几条，默认 5，最大 10' },
          threshold: { type: 'number', description: '相似度阈值，0 到 1；不传时使用手动检索阈值，通常比自动注入更宽' },
        },
        required: ['query'],
      },
    },
  },
  execute: async (args) => {
    const query = String(args.query || '').trim();
    const topK = Math.max(1, Math.min(10, Number(args.topK) || 5));
    const thresholdRaw = Number(args.threshold);
    const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, Math.min(1, thresholdRaw)) : undefined;

    if (!query) {
      return {
        success: false,
        error: 'query 不能为空',
        hint: '请传入要回忆的主题，例如“AI.library 内置模块”或“之前关于书库上传的讨论”',
      };
    }

    if (config.memory?.vectorRecall?.enabled !== true) {
      return {
        success: false,
        error: 'vector_recall_disabled',
        hint: '当前向量召回未启用，请先在设置中打开“向量召回配置”并重启 Gateway',
      };
    }

    const vector = await embedOne(query);
    const hits = db.searchSimilar(vector, {
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
    const lexicalHits = hits.length === 0 ? db.searchText(query, { limit: topK, currentModelOnly: true }) : [];
    const returnedHits = hits.length > 0 ? hits : lexicalHits.map((hit) => ({ ...hit, confidence: 'low' }));

    return {
      success: true,
      data: {
        query,
        mode: hits.length > 0 ? 'vector' : 'lexical_fallback',
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
      hint: hits.length > 0
        ? null
        : lexicalHits.length > 0
          ? '语义召回未命中，已回退到文本候选；这些结果适合人工核对，不建议直接当作高置信记忆'
          : '没有命中，可换更具体的主题词，或先做 /recall backfill 补历史索引',
    };
  },
};
