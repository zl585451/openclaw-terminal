const fs = require('fs');
const path = require('path');
const { createLogger } = require('../logger');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const log = createLogger('tool:write_file');

function normalizeInputPath(inputPath) {
  const raw = String(inputPath || '').trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) return path.normalize(raw);
  return path.resolve(PROJECT_ROOT, raw);
}

function isWithinProjectRoot(targetPath) {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedRoot = path.resolve(PROJECT_ROOT);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + path.sep);
}

module.exports = {
  name: 'write_file',
  category: 'project',
  riskLevel: 'guarded',
  displayName: '写入文件',
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容。优先使用项目相对路径；也支持绝对路径。写入项目外文件时会记录兼容性日志。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径：优先项目相对路径，也支持绝对路径' },
          content: { type: 'string', description: '写入内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  execute: async (args) => {
    const resolvedPath = normalizeInputPath(args.path);
    if (!resolvedPath) {
      return {
        success: false,
        data: null,
        error: 'path 不能为空',
        hint: '请提供文件路径，例如 src/App.tsx 或绝对路径',
        path: args.path,
      };
    }
    const isProjectPath = isWithinProjectRoot(resolvedPath);
    if (!isProjectPath) {
      log.warn('compat mode: writing outside project root', {
        requestedPath: String(args.path || ''),
        resolvedPath,
      });
    }
    try {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolvedPath, args.content, 'utf-8');
      const message = `已写入 ${resolvedPath}`;
      return {
        success: true,
        data: { path: resolvedPath, message, outsideProject: !isProjectPath },
        error: null,
        hint: !isProjectPath ? '当前写入的是项目目录之外的文件，请确认这符合你的意图。' : null,
        message,
        path: resolvedPath,
        outsideProject: !isProjectPath,
      };
    } catch (e) {
      return {
        success: false,
        data: null,
        error: e?.message || String(e),
        hint: '确认目标目录可写、磁盘空间充足，路径合法',
        path: resolvedPath,
        outsideProject: !isProjectPath,
      };
    }
  },
};
