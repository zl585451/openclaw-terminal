const fs = require('fs');
const path = require('path');
const shared = require('./tools/shared');
const { enforceAgentPermission } = require('./security/agent_permissions_policy');

const TOOLS_DIR = path.join(__dirname, 'tools');

/** 供其他工具 require 的模块，非 ToolLoader 注册项（无 name/definition/execute） */
const TOOL_LOADER_SKIP = new Set(['shared.js', 'ai_library.js', 'command_converter.js']);

const META_DEFAULTS = { category: 'misc', riskLevel: 'safe' };
const VALID_CATEGORIES = new Set(['project', 'web', 'memory', 'task', 'system', 'misc']);
const VALID_RISK_LEVELS = new Set(['safe', 'guarded', 'dangerous']);

/**
 * 解析工具可选元数据；缺字段或非法值时用默认值，保证旧工具不报错。
 * @param {object} tool
 * @returns {{ category: string, riskLevel: string, displayName: string }}
 */
function resolveToolMeta(tool) {
  const name = tool.name || 'unknown';
  let category = tool.category;
  if (!VALID_CATEGORIES.has(category)) category = META_DEFAULTS.category;
  let riskLevel = tool.riskLevel;
  if (!VALID_RISK_LEVELS.has(riskLevel)) riskLevel = META_DEFAULTS.riskLevel;
  const displayName =
    typeof tool.displayName === 'string' && tool.displayName.trim() ? tool.displayName.trim() : name;
  return { category, riskLevel, displayName };
}

let _definitions = [];
let _executors = {};
let _metaByToolName = {};
let _loaded = false;

/** 动态工具提供者（MCP 等批量工具源） */
const _providers = [];

function loadTools() {
  _loaded = true;
  _definitions = [];
  _executors = {};
  _metaByToolName = {};

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
        const meta = resolveToolMeta(tool);
        let timeoutMs = Number(tool.timeoutMs);
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = 30000;
        timeoutMs = Math.min(10 * 60 * 1000, Math.max(1000, Math.round(timeoutMs)));
        _metaByToolName[tool.name] = {
          ...meta,
          timeoutMs,
        };
        console.log(`[ToolLoader] 已加载工具: ${tool.name} (${meta.category}/${meta.riskLevel})`);
      } catch (e) {
        console.error(`[ToolLoader] 加载 ${file} 失败:`, e.message);
      }
    }
  } else {
    console.warn('[ToolLoader] tools/ 目录不存在，跳过加载');
  }

  console.log(`[ToolLoader] 共加载 ${_definitions.length} 个工具`);
}

function ensureToolsLoaded() {
  if (!_loaded) loadTools();
}

/**
 * 注册一个动态工具提供者。提供者需实现：
 *   getDefinitions() → OpenAI tool 格式数组
 *   executeTool(name, args, context?) → Promise<result>
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
  ensureToolsLoaded();
  const providerDefs = _providers.flatMap(p => {
    try { return p.getDefinitions(); } catch { return []; }
  });
  return [..._definitions, ...providerDefs];
}

function resolveDefinitionByName(name) {
  const defs = getDefinitions();
  return defs.find((d) => d?.function?.name === name) || null;
}

function resolveToolContext(name, args) {
  ensureToolsLoaded();
  const toolName = String(name || '');
  return {
    toolName,
    args: args || {},
    meta: _metaByToolName[toolName] || null,
    definition: resolveDefinitionByName(toolName),
    isMcpTool: toolName.startsWith('mcp_'),
  };
}

async function executeTool(name, args, context) {
  ensureToolsLoaded();
  // OCT 定位为系统管家：已注册工具默认允许执行。
  // 如需恢复历史权限闸门，可显式传入 enforceAgentPermission=true。
  if (context?.enforceAgentPermission === true && context?.skipAgentPermission !== true) {
    enforceAgentPermission(resolveToolContext(name, args));
  }
  // 优先查静态工具
  if (_executors[name]) return await _executors[name](args, context);
  // 再查动态提供者
  for (const p of _providers) {
    try {
      const defs = p.getDefinitions();
      if (defs.some(d => d.function?.name === name)) {
        return await p.executeTool(name, args, context);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      // 如果 provider 已明确声明拥有这个工具，则执行阶段的错误必须原样抛出，
      // 避免被后续兜底再次重试，导致同一 MCP 工具被白白卡两轮超时。
      if (!msg.includes('getDefinitions')) {
        throw e;
      }
    }
  }
  // 对动态命名空间工具做一次直接路由兜底，避免 provider 定义缓存/状态瞬时不一致时误报“不存在”
  if (typeof name === 'string' && name.startsWith('mcp_')) {
    for (const p of _providers) {
      try {
        return await p.executeTool(name, args, context);
      } catch (e) {
        const msg = e?.message || String(e);
        if (
          msg.includes('未知 MCP 工具') ||
          msg.includes('未知 MCP') ||
          msg.includes('未连接') ||
          msg.includes('Unknown')
        ) {
          continue;
        }
        throw e;
      }
    }
  }
  throw new Error(`工具 "${name}" 不存在`);
}

module.exports = {
  loadTools,
  ensureToolsLoaded,
  getDefinitions,
  executeTool,
  getToolMeta: (name) => {
    ensureToolsLoaded();
    return _metaByToolName[name] || null;
  },
  registerProvider,
  setOnTaskBoardUpdate: shared.setOnTaskBoardUpdate,
};
