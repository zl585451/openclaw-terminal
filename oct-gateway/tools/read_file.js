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
  category: 'project',
  riskLevel: 'safe',
  displayName: '读取文件',
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
      return {
        success: false,
        data: null,
        error: 'path 不能为空',
        hint: '请提供项目内文件路径，例如 oct-gateway/index.js',
      };
    }

    if (!isWithinAllowedRoots(resolvedPath)) {
      return {
        success: false,
        data: null,
        error: `禁止读取项目目录之外的文件: ${resolvedPath}`,
        hint: '请使用项目根目录下的相对路径或项目内的绝对路径',
        allowedRoots: ALLOWED_ROOTS,
      };
    }

    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        data: null,
        error: `文件不存在: ${resolvedPath}`,
        hint: '确认路径是否正确，或先列出目录再读取',
        requestedPath: String(args.path || ''),
        resolvedPath,
      };
    }

    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const sliced = content.slice(0, 10000);
      return {
        success: true,
        data: { path: resolvedPath, content: sliced },
        error: null,
        hint: null,
        path: resolvedPath,
        content: sliced,
      };
    } catch (e) {
      return {
        success: false,
        data: null,
        error: e?.message || String(e),
        hint: '确认文件可读、未被占用，且路径有效',
        path: resolvedPath,
      };
    }
  },
};
