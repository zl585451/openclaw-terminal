const { execSync } = require('child_process');
const { convertCommand } = require('./command_converter');

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

    let command = args.command;
    if (isWindows) {
      command = convertCommand(command);
    }

    const fullCommand = isWindows
      ? `chcp 65001 >nul && ${command}`
      : command;

    try {
      const output = execSync(fullCommand, {
        cwd: args.cwd || process.cwd(),
        encoding: 'utf-8',
        timeout: 30000,
        windowsHide: true,
        shell: true,
      });
      return { success: true, output: output.slice(0, 5000) };
    } catch (e) {
      const stderr = e.stderr ? e.stderr.toString('utf-8') : '';
      const stdout = e.stdout ? e.stdout.toString('utf-8') : '';
      const combined = (stdout + stderr).trim().slice(0, 5000);
      if (combined) {
        return { success: false, output: `命令执行出错:\n${combined}` };
      }
      return { success: false, output: `命令执行失败: ${e.message}` };
    }
  },
};
