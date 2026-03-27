const fs = require('fs');

module.exports = {
  name: 'read_file',
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径' },
        },
        required: ['path'],
      },
    },
  },
  execute: async (args) => {
    const content = fs.readFileSync(args.path, 'utf-8');
    return { success: true, content: content.slice(0, 10000) };
  },
};
