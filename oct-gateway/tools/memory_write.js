const shared = require('./shared');

module.exports = {
  name: 'memory_write',
  category: 'memory',
  riskLevel: 'guarded',
  displayName: '写入记忆',
  definition: {
    type: 'function',
    function: {
      name: 'memory_write',
      description: '写入或更新 Memory v2/legacy 记忆节点',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: '记忆 URI' },
          content: { type: 'string', description: '记忆内容' },
          priority: { type: 'number', description: '优先级 0-2，0 最高' },
          disclosure: { type: 'string', description: '触发条件描述' },
        },
        required: ['uri', 'content'],
      },
    },
  },
  execute: async (args) => {
    const { enqueueWrite, log } = shared;
    const uri = String(args.uri || '').trim();
    const content = args.content ?? '';
    const priority = args.priority ?? 2;
    const disclosure = args.disclosure ?? '';
    const m = uri.match(/^([^:]+):\/\/(.+)$/);
    if (!m) {
      return {
        success: false,
        data: null,
        error: `无效 URI: ${uri}`,
        hint: '请使用类似 core://my_user/preferences/theme 这样的记忆 URI',
        uri,
      };
    }
    log.info('memory_write enqueue', { uri, contentLen: String(content || '').length, priority });
    const result = await enqueueWrite(uri, content, priority, disclosure);
    if (!result?.success) log.error('memory_write failed', { uri, error: result?.error || 'unknown' });
    if (!result?.success) {
      return {
        success: false,
        data: null,
        error: result?.error || 'unknown',
        hint: '确认记忆后端在线、URI 合法，并避免一次写入过多内容',
        uri,
      };
    }
    return {
      success: true,
      data: {
        uri,
        created: !!result.created,
        updated: !!result.updated,
      },
      error: null,
      hint: null,
      uri,
      created: !!result.created,
      updated: !!result.updated,
    };
  },
};
