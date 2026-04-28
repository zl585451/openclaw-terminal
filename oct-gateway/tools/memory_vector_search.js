const config = require('../config');
const db = require('../memory_vector/db');
const { embedOne } = require('../summarizer/embedding_client');

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
          threshold: { type: 'number', description: '相似度阈值，0 到 1，默认使用当前配置' },
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
    const hits = db.searchSimilar(vector, { topK, threshold });
    const lexicalHits = hits.length === 0 ? db.searchText(query, { limit: topK, currentModelOnly: true }) : [];

    return {
      success: true,
      data: {
        query,
        mode: hits.length > 0 ? 'vector' : 'lexical_fallback',
        confidence: hits.length > 0 ? 'high' : 'low',
        returned: (hits.length > 0 ? hits : lexicalHits).length,
        hits: (hits.length > 0 ? hits : lexicalHits).map((hit) => ({
          uri: hit.uri,
          date: hit.date,
          session: hit.session || 'default',
          similarity: hit.similarity != null ? Number((hit.similarity || 0).toFixed(4)) : null,
          lexical_score: hit.lexical_score != null ? Number((hit.lexical_score || 0).toFixed(4)) : null,
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
