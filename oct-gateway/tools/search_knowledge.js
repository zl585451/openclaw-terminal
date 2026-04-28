const aiLibrary = require('./ai_library');
const shared = require('./shared');

module.exports = {
  name: 'search_knowledge',
  definition: {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: '搜索音频专业知识库（AI.library）。当前默认客户端仅启用项目书库，专业知识检索模块未启用时不要调用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或问题' },
          top_k: { type: 'number', description: '返回结果数量，默认 3' },
        },
        required: ['query'],
      },
    },
  },
  execute: async (args) => {
    const { log } = shared;
    const query = (args.query || '').trim();
    if (!query) return { success: false, error: '搜索关键词不能为空' };
    const topK = args.top_k || 3;
    log.info('search_knowledge', { query, topK });
    const ret = await aiLibrary.searchKnowledge(query, topK);
    const results = ret.results || [];
    const errorMsg = ret.error;
    if (errorMsg === 'knowledge_search_disabled') {
      return { success: false, results: [], formatted: '', hint: 'knowledge_search_disabled' };
    }
    const formatted = errorMsg || aiLibrary.formatKnowledgeForPrompt(results);
    return { success: true, results, formatted, hint: errorMsg || undefined };
  },
};
