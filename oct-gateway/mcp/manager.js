/**
 * McpManager — 管理多个 MCP Server，实现 tool_loader Provider 接口
 *
 * 对外提供：
 *   init()              启动所有配置的 Server，注册进 tool_loader
 *   getStatus()          返回各 Server 状态（供 IPC/HTTP 查询）
 *   addServer(name,cfg) 热添加（写配置 + 连接）
 *   removeServer(name)  热移除（断连 + 写配置）
 */
const McpClient = require('./client');
const toolLoader = require('../tool_loader');
const { createLogger } = require('../logger');
const log = createLogger('mcp:manager');

/** 引用已加载的 fileConfig（延迟 require 避免循环） */
let _fileConfig = null;
let _configPath = null;

class McpManager {
  constructor() {
    this._clients = new Map();   // name → McpClient
    this._toolMap = new Map();   // qualifiedName → serverName
  }

  async init() {
    const cfg = require('../config');
    _fileConfig = cfg.__fileConfig || {};
    _configPath = cfg._configPath || null;
    const servers = _fileConfig.mcpServers || {};
    log.info('初始化 MCP Manager', { serverCount: Object.keys(servers).length });

    for (const [name, cfg] of Object.entries(servers)) {
      await this._startServer(name, cfg);
    }

    // 注册为 tool_loader 的 Provider
    toolLoader.registerProvider({
      getDefinitions: () => this._buildDefinitions(),
      executeTool: (name, args) => this._route(name, args),
    });

    log.info('MCP Provider 已注册');
  }

  async _startServer(name, cfg) {
    try {
      const client = new McpClient(name, cfg);
      await client.connect();
      this._clients.set(name, client);
      log.info(`Server "${name}" 已连接`, { tools: client.tools.map(t => t.name) });
    } catch (e) {
      log.error(`Server "${name}" 启动失败`, { error: e.message });
      // 失败不中断其他 Server
    }
  }

  _buildDefinitions() {
    this._toolMap.clear();
    const defs = [];
    for (const [serverName, client] of this._clients) {
      if (client.status !== 'connected') continue;
      for (const tool of client.tools) {
        const qualifiedName = `mcp_${serverName}_${tool.name}`;
        this._toolMap.set(qualifiedName, serverName);
        defs.push({
          type: 'function',
          function: {
            name: qualifiedName,
            description: `[MCP:${serverName}] ${tool.description || ''}`,
            parameters: tool.inputSchema || { type: 'object', properties: {} },
          },
        });
      }
    }
    return defs;
  }

  async _route(qualifiedName, args) {
    const serverName = this._toolMap.get(qualifiedName);
    if (!serverName) throw new Error(`未知 MCP 工具: ${qualifiedName}`);
    const client = this._clients.get(serverName);
    if (!client || client.status !== 'connected') {
      throw new Error(`MCP Server "${serverName}" 未连接`);
    }
    const toolName = qualifiedName.replace(`mcp_${serverName}_`, '');
    return await client.callTool(toolName, args);
  }

  /** 返回所有 Server 的状态快照（给前端面板用） */
  getStatus() {
    const result = {};
    for (const [name, client] of this._clients) {
      result[name] = {
        status: client.status,
        errorMessage: client.errorMessage,
        tools: client.tools.map(t => ({ name: t.name, description: t.description || '' })),
        config: client.config,
      };
    }
    return result;
  }

  /** 热添加 Server（面板 UI 用） */
  async addServer(name, cfg) {
    if (this._clients.has(name)) {
      this._clients.get(name).disconnect();
    }
    await this._startServer(name, cfg);
    this._saveConfig();
    return this.getStatus()[name];
  }

  /** 热移除 Server（面板 UI 用） */
  removeServer(name) {
    const client = this._clients.get(name);
    if (client) { client.disconnect(); this._clients.delete(name); }
    this._saveConfig();
  }

  _saveConfig() {
    if (!_configPath) {
      log.warn('_saveConfig: 无配置文件路径，跳过保存');
      return;
    }
    const mcpServers = {};
    for (const [name, client] of this._clients) {
      mcpServers[name] = client.config;
    }
    try {
      const fs = require('fs');
      let existing = {};
      try { existing = JSON.parse(fs.readFileSync(_configPath, 'utf-8')); } catch {}
      existing.mcpServers = mcpServers;
      fs.writeFileSync(_configPath, JSON.stringify(existing, null, 2), 'utf-8');
      log.info('MCP 配置已保存', { path: _configPath });
    } catch (e) {
      log.error('保存 MCP 配置失败', { error: e.message });
    }
  }
}

module.exports = new McpManager();
