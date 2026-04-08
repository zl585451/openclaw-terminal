const fs = require('fs');
const path = require('path');
const { isLocalInternalRequest, readJsonBody } = require('./helpers');

function createHttpRequestHandler({
  memory,
  memoryManagementAgent,
  reviewQueueActions,
  toolLoader,
  mcpManager,
  mobileHtmlPath = path.join(__dirname, '..', 'mobile.html'),
}) {
  return async function handleTransportHttpRequest(req, res) {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'oct-vault' }));
      return true;
    }

    if (req.url?.startsWith('/internal/memory/')) {
      if (!isLocalInternalRequest(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'internal_endpoint_local_only' }));
        return true;
      }

      if (req.method === 'GET' && req.url === '/internal/memory/governance/latest') {
        memory.readMemory('core://agent/governance/latest', { treat404AsDebug: true })
          .then((result) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          })
          .catch((e) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
          });
        return true;
      }

      if (req.method === 'POST' && req.url === '/internal/memory/governance/run') {
        readJsonBody(req).then(async (body) => {
          const result = await memoryManagementAgent.runMemoryGovernancePass(body || {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result }));
        }).catch((e) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
        });
        return true;
      }

      if (req.method === 'POST' && req.url === '/internal/memory/review-action') {
        readJsonBody(req).then(async (body) => {
          const action = String(body?.action || '').trim();
          const uri = String(body?.uri || '').trim();
          let result;

          if (action === 'approve') {
            result = await reviewQueueActions.approveReviewCandidate(uri, body || {});
          } else if (action === 'reject') {
            result = await reviewQueueActions.rejectReviewCandidate(uri, body || {});
          } else if (action === 'archive') {
            result = await reviewQueueActions.archiveReviewCandidate(uri, body || {});
          } else if (action === 'merge') {
            result = await reviewQueueActions.mergeReviewCandidate(uri, body || {});
          } else {
            result = { ok: false, error: 'unsupported_review_action' };
          }

          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        }).catch((e) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
        });
        return true;
      }
    }

    if (req.method === 'POST' && req.url === '/tool') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const { tool, args } = JSON.parse(body || '{}');
          const result = await toolLoader.executeTool(tool, args || {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, result }));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
        }
      });
      return true;
    }

    if (req.method === 'GET' && req.url === '/mcp/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mcpManager.getStatus()));
      return true;
    }

    if (req.method === 'POST' && req.url === '/mcp/server') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const name = parsed.name;
          let command;
          let args;
          let env;
          if (parsed.config && typeof parsed.config === 'object') {
            ({ command, args, env } = parsed.config);
          } else {
            ({ command, args, env } = parsed);
          }
          const serverConfig = { command, args, env: env || {} };
          const status = await mcpManager.addServer(name, serverConfig);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, status }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return true;
    }

    if (req.method === 'DELETE' && req.url?.startsWith('/mcp/server/')) {
      const name = req.url.replace('/mcp/server/', '');
      mcpManager.removeServer(name);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return true;
    }

    if (req.url === '/' || req.url === '/mobile') {
      try {
        const html = fs.readFileSync(mobileHtmlPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (e) {
        res.writeHead(500);
        res.end('mobile.html not found: ' + e.message);
      }
      return true;
    }

    return false;
  };
}

module.exports = createHttpRequestHandler;
