const fs = require('fs');
const path = require('path');
const { createLogger } = require('../logger');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const log = createLogger('tool:read_file');

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
  name: 'read_file',
  category: 'project',
  riskLevel: 'safe',
  displayName: '读取文件',
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容。优先传项目根目录下的相对路径；也可传任意绝对路径。读取项目外文件时会记录兼容性日志。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，优先使用项目相对路径，如 src/App.tsx 或 oct-gateway/index.js；也支持绝对路径' },
        },
        required: ['path'],
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
        hint: '请提供文件路径，例如 oct-gateway/index.js 或绝对路径',
      };
    }
    const isProjectPath = isWithinProjectRoot(resolvedPath);
    if (!isProjectPath) {
      log.warn('compat mode: reading outside project root', {
        requestedPath: String(args.path || ''),
        resolvedPath,
      });
    }

    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        data: null,
        error: `文件不存在: ${resolvedPath}`,
        hint: '确认路径是否正确，或先列出目录再读取',
        requestedPath: String(args.path || ''),
        resolvedPath,
        outsideProject: !isProjectPath,
      };
    }

    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const sliced = content.slice(0, 10000);
      return {
        success: true,
        data: { path: resolvedPath, content: sliced, outsideProject: !isProjectPath },
        error: null,
        hint: !isProjectPath ? '当前读取的是项目目录之外的文件，请确认这是你想分析的目标。' : null,
        path: resolvedPath,
        content: sliced,
        outsideProject: !isProjectPath,
      };
    } catch (e) {
      return {
        success: false,
        data: null,
        error: e?.message || String(e),
        hint: '确认文件可读、未被占用，且路径有效',
        path: resolvedPath,
        outsideProject: !isProjectPath,
      };
    }
  },
};
