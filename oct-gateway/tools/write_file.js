const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'write_file',
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件绝对路径' },
          content: { type: 'string', description: '写入内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  execute: async (args) => {
    const dir = path.dirname(args.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(args.path, args.content, 'utf-8');
    return { success: true, message: `已写入 ${args.path}` };
  },
};
