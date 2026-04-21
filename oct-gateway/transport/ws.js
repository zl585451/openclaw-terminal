const { WebSocketServer } = require('ws');
const { randomUUID, randomBytes } = require('node:crypto');
const { safeParseMessage, serializeMessage } = require('./protocol');
const { createConnectionAdapter } = require('./connection');
const taskQueue = require('../task_queue');

/** 服务端主动 ping，避免长任务阻塞事件循环时客户端 pong 超时断开 */
const SERVER_PING_INTERVAL_MS = 25000;

class WsTransport {
  constructor({
    port,
    host = '0.0.0.0',
    logger,
    modelProvider,
    capabilityProvider,
    authTokenProvider,
    onAuthenticatedMessage,
  }) {
    this.port = port;
    this.host = host;
    this.log = logger;
    this.modelProvider = modelProvider || (() => '');
    this.capabilityProvider = capabilityProvider || (() => ({}));
    this.authTokenProvider = authTokenProvider || (() => '');
    this.onAuthenticatedMessage = onAuthenticatedMessage;
    this.wss = null;
    this.authenticatedClients = new Set();
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port, host: this.host });

    this.wss.on('error', (err) => {
      this.log.error('Server error', { error: err?.message || String(err), code: err?.code || '' });
      if (err.code === 'EADDRINUSE') {
        this.log.error('Port in use', { port: this.port });
      }
      process.exit(1);
    });

    this.wss.on('connection', (ws) => this._handleConnection(ws));
    this.log.info('WebSocket listening', { url: `ws://${this.host}:${this.port}` });
    return this;
  }

  broadcast(payload) {
    if (!this.wss) return;
    const message = serializeMessage(payload);
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(message);
    });
  }

  close(callback) {
    if (!this.wss) {
      if (callback) callback();
      return;
    }
    this.wss.close(callback);
  }

  on(eventName, handler) {
    if (!this.wss) return;
    this.wss.on(eventName, handler);
  }

  _handleConnection(ws) {
    const clientId = randomUUID();
    this.log.info('client connected', { clientId });

    let currentAbort = null;
    let thinkingPulseInterval = null;
    let serverPingInterval = null;

    const connection = createConnectionAdapter({
      clientId,
      ws,
      serializeMessage,
      setAbort: (abortFn) => {
        currentAbort = typeof abortFn === 'function' ? abortFn : null;
      },
      abortCurrent: () => {
        if (currentAbort) currentAbort();
      },
      startThinkingPulse: (intervalMs = 8000) => {
        let elapsed = 0;
        if (thinkingPulseInterval) clearInterval(thinkingPulseInterval);
        thinkingPulseInterval = setInterval(() => {
          elapsed += intervalMs / 1000;
          connection.send({
            type: 'event',
            event: 'agent-phase',
            phase: 'thinking',
            elapsed,
          });
        }, intervalMs);
      },
      stopThinkingPulse: () => {
        if (thinkingPulseInterval) {
          clearInterval(thinkingPulseInterval);
          thinkingPulseInterval = null;
        }
      },
    });

    try {
      const nonce = randomBytes(16).toString('hex');
      ws._nonce = nonce;
      ws._clientId = clientId;
      connection.send({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce },
      });
      serverPingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          try {
            ws.ping();
          } catch (error) {
            this.log.warn('ping failed', { clientId, error: error?.message || String(error) });
          }
        } else if (serverPingInterval) {
          clearInterval(serverPingInterval);
          serverPingInterval = null;
        }
      }, SERVER_PING_INTERVAL_MS);
    } catch (e) {
      this.log.error('send challenge failed', { clientId, error: e?.message || String(e) });
      try {
        ws.close(1011, 'Server error');
      } catch (error) {
        this.log.warn('close after challenge failure failed', { clientId, error: error?.message || String(error) });
      }
      return;
    }

    ws.on('message', async (data) => {
      const message = safeParseMessage(data);
      if (!message) return;

      const { type, id, method, params } = message || {};
      if (type === 'req' && method === 'connect') {
        const token = params?.auth?.token ?? params?.token ?? '';
        const configToken = this.authTokenProvider();
        if (configToken && token !== configToken) {
          connection.send({ type: 'res', id, ok: false, error: { message: 'Invalid token' } });
          return;
        }
        this.authenticatedClients.add(ws);
        const sessionKey = params?.sessionKey || 'main';
        const pendingTasks = taskQueue.getRunningTasks(sessionKey).map((t) => ({
          taskId: t.taskId,
          type: t.type,
          status: t.status,
          startedAt: t.startedAt,
          createdAt: t.createdAt,
        }));
        connection.send({
          type: 'res',
          id,
          ok: true,
          payload: {
            type: 'hello-ok',
            model: this.modelProvider(),
            agent: { model: this.modelProvider() },
            capabilities: this.capabilityProvider(),
            pendingTasks,
          },
        });
        this.log.info('client authenticated', { clientId });
        return;
      }

      if (!this.authenticatedClients.has(ws)) {
        connection.send({ type: 'res', id, ok: false, error: { message: 'Not authenticated' } });
        return;
      }

      try {
        await this.onAuthenticatedMessage(message, connection);
      } catch (err) {
        this.log.error('authenticated message failed', { clientId, error: err?.message || String(err) });
        connection.stopThinkingPulse();
        connection.setAbort(null);
        connection.send({
          type: 'event',
          event: 'chat',
          payload: {
            text: `❌ Gateway 处理失败：${err?.message || String(err)}`,
            state: 'done',
            done: true,
          },
        });
        connection.send({ type: 'event', event: 'agent-phase', phase: 'idle' });
      }
    });

    ws.on('close', () => {
      if (serverPingInterval) {
        clearInterval(serverPingInterval);
        serverPingInterval = null;
      }
      connection.abortCurrent();
      connection.setAbort(null);
      connection.stopThinkingPulse();
      this.authenticatedClients.delete(ws);
      this.log.info('client disconnected', { clientId });
    });

    ws.on('error', (err) => {
      this.log.error('client connection error', { clientId, error: err?.message || String(err) });
    });
  }
}

module.exports = WsTransport;
