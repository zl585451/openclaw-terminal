/**
 * mem0_search — AI 主动语义搜索 Mem0 记忆
 *
 * 使用场景：
 *   用户问"你还记得我说过什么关于X吗？" → AI 主动搜索
 *   AI 需要回忆某段历史信息时
 *
 * 和 contextBuilder 自动注入的区别：
 *   contextBuilder 是每轮自动触发（被动）
 *   此工具是 AI 主动调用（主动，可携带更精确的搜索词）
 */

const mem0Client = require('../mem0_client');
const { createLogger } = require('../logger');
const log = createLogger('tool:mem0_search');

module.exports = {
  name: 'mem0_search',
  category: 'memory',
  riskLevel: 'safe',
  displayName: '搜索智能记忆',

  definition: {
    type: 'function',
    function: {
      name: 'mem0_search',
      description:
        '在 Mem0 智能记忆库中语义搜索用户相关信息。' +
        '当用户询问"你还记得…吗"、"我之前说过…"、"关于X你知道什么"时使用。' +
        '返回与查询语义最相近的记忆条目及相似度分数。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索内容，用自然语言描述，例如"用户的职业"、"用户喜好"、"用户的名字"',
          },
          limit: {
            type: 'number',
            description: '返回条数，1-10，默认 5',
          },
        },
        required: ['query'],
      },
    },
  },

  execute: async (args) => {
    const query = String(args.query || '').trim();
    const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));

    if (!query) {
      return {
        success: false,
        data: null,
        error: '搜索词不能为空',
        hint: '请提供搜索关键词',
      };
    }

    const alive = await mem0Client.isAlive();
    if (!alive) {
      return {
        success: false,
        data: null,
        error: 'Mem0 服务未启动',
        hint: 'Mem0 记忆服务当前不可用，无法搜索',
      };
    }

    log.debug('mem0_search executing', { query, limit });

    const result = await mem0Client.searchMemory(query, { limit });

    if (!result.ok) {
      return {
        success: false,
        data: null,
        error: '搜索失败',
        hint: '请稍后重试',
        query,
      };
    }

    const items = result.results || [];
    log.info('mem0_search ok', { query, hits: items.length });

    return {
      success: true,
      data: { query, results: items, total: items.length },
      error: null,
      hint: items.length === 0 ? '未找到相关记忆' : null,
      query,
      results: items,
      total: items.length,
    };
  },
};
