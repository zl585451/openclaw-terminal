const fs = require('fs');
const path = require('path');
const shared = require('./tools/shared');

const TOOLS_DIR = path.join(__dirname, 'tools');

/** 供其他工具 require 的模块，非 ToolLoader 注册项（无 name/definition/execute） */
const TOOL_LOADER_SKIP = new Set(['shared.js', 'ai_library.js']);

let _definitions = [];
let _executors = {};

/** 动态工具提供者（MCP 等批量工具源） */
const _providers = [];

function loadTools() {
  _definitions = [];
  _executors = {};

  if (fs.existsSync(TOOLS_DIR)) {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.js'));

    for (const file of files) {
      if (TOOL_LOADER_SKIP.has(file)) continue;
      try {
        const toolPath = path.join(TOOLS_DIR, file);
        delete require.cache[require.resolve(toolPath)]; // 支持热重载
        const tool = require(toolPath);

        if (!tool.name || !tool.definition || !tool.execute) {
          console.warn(`[ToolLoader] 跳过 ${file}：缺少 name/definition/execute`);
          continue;
        }

        _definitions.push(tool.definition);
        _executors[tool.name] = tool.execute;
        console.log(`[ToolLoader] 已加载工具: ${tool.name}`);
      } catch (e) {
        console.error(`[ToolLoader] 加载 ${file} 失败:`, e.message);
      }
    }
  } else {
    console.warn('[ToolLoader] tools/ 目录不存在，跳过加载');
  }

  console.log(`[ToolLoader] 共加载 ${_definitions.length} 个工具`);
}

/**
 * 注册一个动态工具提供者。提供者需实现：
 *   getDefinitions() → OpenAI tool 格式数组
 *   executeTool(name, args) → Promise<result>
 */
function registerProvider(provider) {
  if (typeof provider.getDefinitions !== 'function' || typeof provider.executeTool !== 'function') {
    console.error('[ToolLoader] registerProvider 失败：provider 缺少 getDefinitions 或 executeTool');
    return;
  }
  _providers.push(provider);
  console.log(`[ToolLoader] 已注册工具提供者，共 ${_providers.length} 个`);
}

function getDefinitions() {
  const providerDefs = _providers.flatMap(p => {
    try { return p.getDefinitions(); } catch { return []; }
  });
  return [..._definitions, ...providerDefs];
}

async function executeTool(name, args) {
  // 优先查静态工具
  if (_executors[name]) return await _executors[name](args);
  // 再查动态提供者
  for (const p of _providers) {
    try {
      const defs = p.getDefinitions();
      if (defs.some(d => d.function?.name === name)) {
        return await p.executeTool(name, args);
      }
    } catch {}
  }
  throw new Error(`工具 "${name}" 不存在`);
}

// 初始化时立即加载
loadTools();

module.exports = {
  loadTools,
  getDefinitions,
  executeTool,
  registerProvider,
  setOnTaskBoardUpdate: shared.setOnTaskBoardUpdate,
};
