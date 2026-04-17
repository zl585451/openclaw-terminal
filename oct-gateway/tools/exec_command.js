const { exec } = require('child_process');
const { convertCommand } = require('./command_converter');

const EXEC_TIMEOUT_MS = 30000;
const EXEC_MAX_STDOUT = 5000;
const EXEC_MAX_STDERR_CAPTURE = 2000;
const EXEC_MAX_BUFFER = 2 * 1024 * 1024;

module.exports = {
  name: 'exec_command',
  riskLevel: 'guarded',
  timeoutMs: 60000,
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

    return new Promise((resolve) => {
      const child = exec(fullCommand, {
        cwd: args.cwd || process.cwd(),
        encoding: 'utf8',
        timeout: EXEC_TIMEOUT_MS,
        windowsHide: true,
        shell: true,
        maxBuffer: EXEC_MAX_BUFFER,
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => {
        const chunk = typeof d === 'string' ? d : d.toString('utf8');
        if (stdout.length < EXEC_MAX_STDOUT) stdout += chunk;
      });
      child.stderr?.on('data', (d) => {
        const chunk = typeof d === 'string' ? d : d.toString('utf8');
        if (stderr.length < EXEC_MAX_STDERR_CAPTURE) stderr += chunk;
      });

      child.on('close', (code) => {
        const combined = (stdout + stderr).trim();
        if (code !== 0) {
          const body = combined.slice(0, EXEC_MAX_STDOUT);
          resolve({
            success: false,
            output: body ? `命令执行出错:\n${body}` : `命令退出码: ${code}`,
          });
          return;
        }
        resolve({ success: true, output: stdout.slice(0, EXEC_MAX_STDOUT) });
      });

      child.on('error', (e) => {
        const combined = (stdout + stderr).trim().slice(0, EXEC_MAX_STDOUT);
        if (combined) {
          resolve({ success: false, output: `命令执行出错:\n${combined}` });
        } else {
          resolve({ success: false, output: `命令执行失败: ${e.message}` });
        }
      });
    });
  },
};
