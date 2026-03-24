const shared = require('./shared');

module.exports = {
  name: 'memory_write',
  definition: {
    type: 'function',
    function: {
      name: 'memory_write',
      description: '写入或更新 Nocturne 记忆节点',
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
    const uri = args.uri || '';
    const content = args.content ?? '';
    const priority = args.priority ?? 2;
    const disclosure = args.disclosure ?? '';
    const m = uri.match(/^([^:]+):\/\/(.+)$/);
    if (!m) return { success: false, error: `无效 URI: ${uri}` };
    log.info('memory_write enqueue', { uri, contentLen: String(content || '').length, priority });
    const result = await enqueueWrite(uri, content, priority, disclosure);
    if (!result?.success) log.error('memory_write failed', { uri, error: result?.error || 'unknown' });
    return result;
  },
};
