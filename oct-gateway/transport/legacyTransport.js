const { WebSocketServer } = require('ws');
const http = require('http');
const { randomUUID, randomBytes } = require('node:crypto');
const { createConnectionAdapter } = require('./connection');

function startLegacyTransport({
  port,
  host = '0.0.0.0',
  logger,
  authTokenProvider,
  modelProvider,
  onAuthenticatedMessage,
  onHttpRequest,
  onTaskBoardUpdateRegister,
}) {
  const wss = new WebSocketServer({ port, host });
  const httpPort = port + 1;
  const authenticatedClients = new Set();

  wss.on('error', (err) => {
    logger.error('Server error', { error: err?.message || String(err), code: err?.code || '' });
    if (err.code === 'EADDRINUSE') {
      logger.error('Port in use', { port });
    }
    process.exit(1);
  });
  logger.info('WebSocket listening', { url: `ws://${host}:${port}` });

  if (onTaskBoardUpdateRegister) {
    onTaskBoardUpdateRegister(() => {
      const msg = JSON.stringify({ type: 'event', event: 'task-board-update' });
      wss.clients.forEach((client) => {
        if (client.readyState === 1) client.send(msg);
      });
    });
  }

  const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    Promise.resolve(onHttpRequest(req, res))
      .then((handled) => {
        if (handled) return;
        res.writeHead(404);
        res.end('Not found');
      })
      .catch((e) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
        }
      });
  });

  httpServer.listen(httpPort, host, () => {
    logger.info('Mobile HTTP listening', { url: `http://${host}:${httpPort}` });
    logger.info('Mobile HTTP local', { url: `http://localhost:${httpPort}` });
    console.log('[Gateway] HTTP 工具端口已启动:', httpPort);
  });

  httpServer.on('error', (err) => {
    logger.error('Mobile HTTP start failed', { error: err?.message || String(err) });
  });

  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    logger.info('client connected', { clientId });

    let currentAbort = null;
    let thinkingPulseInterval = null;
    let thinkingSeconds = 0;

    try {
      const nonce = randomBytes(16).toString('hex');
      ws._nonce = nonce;
      ws._clientId = clientId;
      ws.send(JSON.stringify({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce },
      }));
    } catch (e) {
      logger.error('send challenge failed', { clientId, error: e?.message || String(e) });
      try { ws.close(1011, 'Server error'); } catch (_) {}
      return;
    }

    ws.on('message', async (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      const { type, id, method, params } = msg || {};

      if (type === 'req' && method === 'connect') {
        const token = params?.auth?.token ?? params?.token ?? '';
        const configToken = authTokenProvider();
        if (configToken && token !== configToken) {
          ws.send(JSON.stringify({ type: 'res', id, ok: false, error: { message: 'Invalid token' } }));
          return;
        }
        authenticatedClients.add(ws);
        ws.send(JSON.stringify({
          type: 'res',
          id,
          ok: true,
          payload: {
            type: 'hello-ok',
            model: modelProvider(),
            agent: { model: modelProvider() },
          },
        }));
        logger.info('client authenticated', { clientId });
        return;
      }

      if (!authenticatedClients.has(ws)) {
        ws.send(JSON.stringify({ type: 'res', id, ok: false, error: { message: 'Not authenticated' } }));
        return;
      }

      const connection = createConnectionAdapter({
        clientId,
        ws,
        serializeMessage: JSON.stringify,
        setAbort: (abortFn) => {
          currentAbort = typeof abortFn === 'function' ? abortFn : null;
        },
        abortCurrent: () => {
          if (currentAbort) currentAbort();
        },
        startThinkingPulse: (intervalMs = 8000) => {
          thinkingSeconds = 0;
          if (thinkingPulseInterval) clearInterval(thinkingPulseInterval);
          thinkingPulseInterval = setInterval(() => {
            thinkingSeconds += intervalMs / 1000;
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'event',
                event: 'agent-phase',
                phase: 'thinking',
                elapsed: thinkingSeconds,
              }));
            }
          }, intervalMs);
        },
        stopThinkingPulse: () => {
          if (thinkingPulseInterval) {
            clearInterval(thinkingPulseInterval);
            thinkingPulseInterval = null;
          }
        },
      });

      await onAuthenticatedMessage(msg, connection);
    });

    ws.on('close', () => {
      if (currentAbort) currentAbort();
      currentAbort = null;
      if (thinkingPulseInterval) { clearInterval(thinkingPulseInterval); thinkingPulseInterval = null; }
      authenticatedClients.delete(ws);
      logger.info('client disconnected', { clientId });
    });

    ws.on('error', (err) => {
      logger.error('client connection error', { clientId, error: err?.message || String(err) });
    });
  });

  return {
    wss,
    httpServer,
    close(callback) {
      httpServer.close(() => {
        wss.close(callback);
      });
    },
  };
}

module.exports = {
  startLegacyTransport,
};
