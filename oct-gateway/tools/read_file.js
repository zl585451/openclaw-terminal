const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED_ROOTS = [PROJECT_ROOT];

function normalizeInputPath(inputPath) {
  const raw = String(inputPath || '').trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) return path.normalize(raw);
  return path.resolve(PROJECT_ROOT, raw);
}

function isWithinAllowedRoots(targetPath) {
  const normalizedTarget = path.resolve(targetPath);
  return ALLOWED_ROOTS.some((root) => {
    const normalizedRoot = path.resolve(root);
    return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + path.sep);
  });
}

module.exports = {
  name: 'read_file',
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容。优先传项目根目录下的相对路径；也可传项目内绝对路径。不会读取项目目录之外的文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '项目内文件路径，优先使用相对路径，如 src/App.tsx 或 oct-gateway/index.js' },
        },
        required: ['path'],
      },
    },
  },
  execute: async (args) => {
    const resolvedPath = normalizeInputPath(args.path);
    if (!resolvedPath) {
      return { success: false, error: 'path 不能为空', hint: '请提供项目内文件路径，例如 oct-gateway/index.js' };
    }

    if (!isWithinAllowedRoots(resolvedPath)) {
      return {
        success: false,
        error: `禁止读取项目目录之外的文件: ${resolvedPath}`,
        allowedRoots: ALLOWED_ROOTS,
      };
    }

    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        error: `文件不存在: ${resolvedPath}`,
        requestedPath: String(args.path || ''),
        resolvedPath,
      };
    }

    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      return {
        success: true,
        path: resolvedPath,
        content: content.slice(0, 10000),
      };
    } catch (e) {
      return {
        success: false,
        error: e?.message || String(e),
        path: resolvedPath,
      };
    }
  },
};
