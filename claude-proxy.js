const http = require('http');
const https = require('https');

const PORT = 9999;
const TARGET_HOST = 'api.deepseek.com';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let bodyChunks = [];
  req.on('data', chunk => {
    bodyChunks.push(chunk);
  });

  req.on('end', () => {
    console.log(`[Proxy] Received request: ${req.method} ${req.url}`);
    const rawBody = Buffer.concat(bodyChunks).toString();
    let modifiedBody = rawBody;
    
    // Log body preview
    console.log(`[Proxy] Request body start: ${rawBody.slice(0, 100)}`);

    // Only process POST requests to /v1/messages
    if (req.method === 'POST' && (req.url.endsWith('/messages') || req.url.includes('/messages'))) {
      try {
        const payload = JSON.parse(rawBody);
        if (payload && Array.isArray(payload.messages)) {
          let systemInjections = [];
          
          // Filter out role: 'system' messages and collect their content
          const filteredMessages = payload.messages.filter(msg => {
            if (msg && msg.role === 'system') {
              if (typeof msg.content === 'string') {
                systemInjections.push(msg.content);
              } else if (Array.isArray(msg.content)) {
                msg.content.forEach(part => {
                  if (part && part.type === 'text') {
                    systemInjections.push(part.text);
                  }
                });
              }
              return false; // exclude
            }
            return true;
          });

          if (systemInjections.length > 0) {
            payload.messages = filteredMessages;
            
            // Merge system content into top-level system parameter
            const injectedText = systemInjections.join('\n\n');
            if (payload.system) {
              if (typeof payload.system === 'string') {
                payload.system = `${payload.system}\n\n${injectedText}`;
              } else if (Array.isArray(payload.system)) {
                payload.system.push({ type: 'text', text: injectedText });
              }
            } else {
              payload.system = injectedText;
            }
            
            console.log(`[Proxy] Successfully extracted and merged ${systemInjections.length} system message(s) into top-level system parameter.`);
          }
          
          modifiedBody = JSON.stringify(payload);
        }
      } catch (err) {
        console.error('[Proxy] Failed to parse or modify JSON body:', err.message);
      }
    }

    // Forward the request to DeepSeek
    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path: req.url.replace(/^\/v1/, '/anthropic'), // Map to deepseek's anthropic path if needed
      method: req.method,
      headers: {
        ...req.headers,
        host: TARGET_HOST,
        'content-length': Buffer.byteLength(modifiedBody),
      }
    };

    // Remove client connection headers to avoid transfer encoding mismatches
    delete options.headers['connection'];
    delete options.headers['keep-alive'];

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy] Target request error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy Gateway Error', details: err.message }));
    });

    proxyReq.write(modifiedBody);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`[Claude Code DeepSeek Proxy] Running on http://localhost:${PORT}`);
  console.log(`[Instructions] Set ANTHROPIC_BASE_URL=http://localhost:${PORT}/v1 and run Claude Code!`);
});
