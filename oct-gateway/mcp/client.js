/**
 * McpClient — 管理单个 MCP Server 的 stdio 连接
 * JSON-RPC 2.0 over stdin/stdout
 */
const { spawn } = require('child_process');
const { createLogger } = require('../logger');

function buildChildEnv(extraEnv) {
  const env = { ...process.env, ...(extraEnv || {}) };
  // MCP 子进程默认走用户当前网络，不继承宿主进程里残留的代理环境变量，
  // 避免开发机/历史代理配置污染普通用户链路。
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.ALL_PROXY;
  delete env.http_proxy;
  delete env.https_proxy;
  delete env.all_proxy;
  const noProxyValue = [env.NO_PROXY, env.no_proxy, 'localhost', '127.0.0.1', '::1']
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  const mergedNoProxy = Array.from(new Set(noProxyValue)).join(',');
  if (mergedNoProxy) {
    env.NO_PROXY = mergedNoProxy;
    env.no_proxy = mergedNoProxy;
  }
  return env;
}

class McpClient {
  constructor(serverName, config) {
    this.serverName = serverName;
    this.config = config;   // { command, args, env }
    this.tools = [];
    this.status = 'disconnected'; // disconnected | connecting | connected | error
    this.errorMessage = '';

    this._proc = null;
    this._buf = '';
    this._lastId = 0;
    this._pending = new Map();  // id → { resolve, reject, timer }
    this._log = createLogger(`mcp:${serverName}`);
  }

  async connect() {
    this.status = 'connecting';
    try {
      await this._connectOnce(this.config.env, 'primary');
    } catch (e) {
      if (!this._shouldRetryWithDefaultIndex(this.config.env)) {
        this.status = 'error';
        this.errorMessage = e.message;
        this._log.error('握手失败', { error: e.message });
        throw e;
      }

      const fallbackEnv = { ...(this.config.env || {}) };
      const mirrorIndex = fallbackEnv.UV_DEFAULT_INDEX || fallbackEnv.UV_INDEX_URL;
      delete fallbackEnv.UV_DEFAULT_INDEX;
      delete fallbackEnv.UV_INDEX_URL;
      if (this._proc) {
        this._proc.kill();
        this._proc = null;
      }
      this._pending.clear();
      this._buf = '';
      this.tools = [];
      this._log.warn('MCP 镜像拉包失败，回退官方 PyPI 源重试', {
        mirrorIndex,
        error: e.message,
      });

      try {
        await this._connectOnce(fallbackEnv, 'fallback_default_index');
      } catch (fallbackError) {
        this.status = 'error';
        this.errorMessage = fallbackError.message;
        this._log.error('握手失败', {
          error: fallbackError.message,
          fallbackFromMirror: true,
          mirrorIndex,
        });
        throw fallbackError;
      }
    }
  }

  async callTool(name, args) {
    const res = await this._request('tools/call', { name, arguments: args || {} });
    // MCP 返回 { content: [{ type, text }] }，提取文本
    if (res?.content) {
      return res.content.map(c => c.text || JSON.stringify(c)).join('\n');
    }
    return JSON.stringify(res);
  }

  disconnect() {
    if (this._proc) {
      this._proc.kill();
      this._proc = null;
    }
    this.status = 'disconnected';
  }

  // ---------- 内部 ----------

  _shouldRetryWithDefaultIndex(env) {
    const command = String(this.config.command || '').trim().toLowerCase();
    return command === 'uvx' && Boolean(env && (env.UV_DEFAULT_INDEX || env.UV_INDEX_URL));
  }

  async _connectOnce(envOverride, attemptLabel) {
    const spawnEnv = buildChildEnv(envOverride);
    this._log.info('启动 MCP Server', {
      command: this.config.command,
      args: this.config.args,
      attempt: attemptLabel,
      uvDefaultIndex: envOverride?.UV_DEFAULT_INDEX || envOverride?.UV_INDEX_URL || '',
    });

    this._proc = spawn(this.config.command, this.config.args || [], {
      env: spawnEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const proc = this._proc;
    proc.stdout.on('data', (chunk) => this._onData(chunk));
    proc.stderr.on('data', (d) => this._log.debug('stderr', { msg: d.toString().trim(), attempt: attemptLabel }));
    proc.on('exit', (code) => {
      if (proc !== this._proc) return;
      this.status = 'disconnected';
      this._log.warn('MCP Server 退出', { code, attempt: attemptLabel });
      for (const { reject, timer } of this._pending.values()) {
        clearTimeout(timer);
        reject(new Error(`MCP Server "${this.serverName}" 意外退出`));
      }
      this._pending.clear();
    });
    proc.on('error', (e) => {
      if (proc !== this._proc) return;
      this.status = 'error';
      this.errorMessage = e.message;
      this._log.error('MCP Server 启动失败', { error: e.message, attempt: attemptLabel });
    });

    await this._request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'oct-gateway', version: '1.0.0' },
    });
    this._notify('notifications/initialized');
    const res = await this._request('tools/list', {});
    this.tools = res.tools || [];
    this.status = 'connected';
    this.errorMessage = '';
    this._log.info('连接成功', { toolCount: this.tools.length, attempt: attemptLabel });
  }

  _onData(chunk) {
    this._buf += chunk.toString();
    const lines = this._buf.split('\n');
    this._buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try { msg = JSON.parse(trimmed); } catch { continue; }
      this._dispatch(msg);
    }
  }

  _dispatch(msg) {
    if (msg.id !== undefined && this._pending.has(msg.id)) {
      const { resolve, reject, timer } = this._pending.get(msg.id);
      clearTimeout(timer);
      this._pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
    // notifications 直接丢弃（未来可扩展）
  }

  _request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this._lastId;
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MCP 请求超时: ${method}`));
      }, 30000);
      this._pending.set(id, { resolve, reject, timer });
      this._proc.stdin.write(msg);
    });
  }

  _notify(method, params = {}) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this._proc?.stdin?.write(msg);
  }
}

module.exports = McpClient;
