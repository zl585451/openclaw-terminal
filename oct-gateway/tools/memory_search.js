const shared = require('./shared');

module.exports = {
  name: 'memory_search',
  category: 'memory',
  riskLevel: 'safe',
  displayName: '搜索记忆',
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
    log.debug('memory_search', { query, domain, limit });
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
        hint: '检查 Nocturne 是否在线，或换一个更具体的关键词',
        query,
        domain,
      };
    }
    const results = r.data || [];
    log.info('memory_search done', { query, results: results.length });
    return {
      success: true,
      data: { query, domain, results },
      error: null,
      hint: results.length === 0 ? '未命中记忆，可换关键词，或尝试更具体的人名/项目名/主题词' : null,
      query,
      domain,
      results,
    };
  },
};
