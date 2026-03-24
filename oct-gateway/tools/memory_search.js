const shared = require('./shared');

module.exports = {
  name: 'memory_search',
  definition: {
    type: 'function',
    function: {
      name: 'memory_search',
      description: '按关键词搜索 Nocturne 记忆（支持模糊匹配，用户提到邮箱/项目/钱包等时可自动调用）',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          domain: { type: 'string', description: '限定域，如 core（可选）' },
          limit: { type: 'number', description: '返回条数，默认 10' },
        },
        required: ['query'],
      },
    },
  },
  execute: async (args) => {
    const { memorySearch, log } = shared;
    log.debug('memory_search', { query: args.query, domain: args.domain || 'core', limit: args.limit || 10 });
    const r = await memorySearch.searchMemory(args.query, {
      domain: args.domain || 'core',
      limit: args.limit || 10,
      include_content: true,
    });
    if (!r.ok) return { success: false, error: r.error };
    log.info('memory_search done', { query: args.query, results: (r.data || []).length });
    return { success: true, results: r.data || [] };
  },
};
