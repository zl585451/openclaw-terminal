const shared = require('./shared');

module.exports = {
  name: 'memory_read',
  definition: {
    type: 'function',
    function: {
      name: 'memory_read',
      description: '读取 Nocturne 记忆节点，支持 core://xxx/yyy 或 system://boot',
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
    const uri = args.uri;
    log.debug('memory_read', { uri });
    const r = await memory.readMemory(uri, { treat404AsDebug: true });
    return r.ok ? { success: true, data: r.data } : { success: false, error: r.error };
  },
};
