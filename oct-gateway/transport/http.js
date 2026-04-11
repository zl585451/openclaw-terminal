const http = require('http');

class HttpTransport {
  constructor({
    port,
    host = '0.0.0.0',
    logger,
    onRequest,
  }) {
    this.port = port;
    this.host = host;
    this.log = logger;
    this.onRequest = onRequest;
    this.server = null;
  }

  start() {
    this.server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      try {
        const handled = await this.onRequest(req, res);
        if (handled) return;
      } catch (err) {
        this.log.error('HTTP request failed', { error: err?.message || String(err), url: req.url, method: req.method });
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    this.server.listen(this.port, this.host, () => {
      this.log.info('Mobile HTTP listening', { url: `http://${this.host}:${this.port}` });
      this.log.info('Mobile HTTP local', { url: `http://localhost:${this.port}` });
      console.log('[Gateway] HTTP 工具端口已启动:', this.port);
    });

    this.server.on('error', (err) => {
      this.log.error('Mobile HTTP start failed', { error: err?.message || String(err) });
    });

    return this;
  }

  close(callback) {
    if (!this.server) {
      if (callback) callback();
      return;
    }
    this.server.close(callback);
  }
}

module.exports = HttpTransport;
