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
  name: 'write_file',
  category: 'project',
  riskLevel: 'guarded',
  displayName: '写入文件',
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '项目内路径：优先相对项目根目录，或使用项目内的绝对路径' },
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
        hint: '请提供项目根目录下的相对路径，例如 src/App.tsx',
        path: args.path,
      };
    }
    if (!isWithinAllowedRoots(resolvedPath)) {
      return {
        success: false,
        data: null,
        error: `禁止写入项目目录之外的文件: ${resolvedPath}`,
        hint: '请使用项目根目录下的相对路径或项目内的绝对路径',
        allowedRoots: ALLOWED_ROOTS,
        path: resolvedPath,
      };
    }
    try {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolvedPath, args.content, 'utf-8');
      const message = `已写入 ${resolvedPath}`;
      return {
        success: true,
        data: { path: resolvedPath, message },
        error: null,
        hint: null,
        message,
        path: resolvedPath,
      };
    } catch (e) {
      return {
        success: false,
        data: null,
        error: e?.message || String(e),
        hint: '确认目标目录可写、磁盘空间充足，路径合法',
        path: resolvedPath,
      };
    }
  },
};
