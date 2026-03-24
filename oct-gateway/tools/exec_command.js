const { execSync } = require('child_process');

module.exports = {
  name: 'exec_command',
  definition: {
    type: 'function',
    function: {
      name: 'exec_command',
      description: '执行 shell 命令，返回输出结果',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          cwd: { type: 'string', description: '工作目录（可选）' },
        },
        required: ['command'],
      },
    },
  },
  execute: async (args) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows
      ? `chcp 65001 >nul && ${args.command}`
      : args.command;
    const output = execSync(command, {
      cwd: args.cwd || process.cwd(),
      encoding: 'utf-8',
      timeout: 30000,
      windowsHide: true,
      shell: true,
    });
    return { success: true, output: output.slice(0, 5000) };
  },
};
