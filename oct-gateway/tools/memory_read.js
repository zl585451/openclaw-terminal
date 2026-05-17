const shared = require('./shared');

module.exports = {
  name: 'memory_read',
  category: 'memory',
  riskLevel: 'safe',
  displayName: '读取记忆',
  definition: {
    type: 'function',
    function: {
      name: 'memory_read',
      description: '读取 Memory v2/legacy 记忆节点，支持 core://xxx/yyy 或 system://boot',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: '记忆 URI，如 core://agent/identity' },
        },
        required: ['uri'],
      },
    },
  },
  execute: async (args) => {
    const { memory, log } = shared;
    const uri = String(args.uri || '').trim();
    if (!uri) {
      return {
        success: false,
        data: null,
        error: 'uri 不能为空',
        hint: '请传入记忆 URI，例如 core://agent/identity',
      };
    }
    log.debug('memory_read', { uri });
    const r = await memory.readMemory(uri, { treat404AsDebug: true });
    if (!r.ok) {
      return {
        success: false,
        data: null,
        error: r.error,
        hint: '确认 URI 是否存在，或先用 memory_search 搜关键词再决定读取哪个节点',
        uri,
      };
    }
    return {
      success: true,
      data: { uri, node: r.data },
      error: null,
      hint: null,
      uri,
      node: r.data,
    };
  },
};
