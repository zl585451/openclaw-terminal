const fs = require('fs');
const path = require('path');
const shared = require('./tools/shared');

const TOOLS_DIR = path.join(__dirname, 'tools');

/** 供其他工具 require 的模块，非 ToolLoader 注册项（无 name/definition/execute） */
const TOOL_LOADER_SKIP = new Set(['shared.js', 'ai_library.js']);

let _definitions = [];
let _executors = {};

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

function getDefinitions() { return _definitions; }
function getExecutors() { return _executors; }
async function executeTool(name, args) {
  const fn = _executors[name];
  if (!fn) throw new Error(`工具 "${name}" 不存在`);
  return await fn(args);
}

// 初始化时立即加载
loadTools();

module.exports = {
  loadTools,
  getDefinitions,
  getExecutors,
  executeTool,
  setOnTaskBoardUpdate: shared.setOnTaskBoardUpdate,
};
