'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePortPair() {
  for (let i = 0; i < 40; i += 1) {
    const port = 24000 + Math.floor(Math.random() * 20000);
    if (await canListen(port) && await canListen(port + 1)) return port;
  }
  throw new Error('Unable to find free gateway port pair');
}

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);
    const onMessage = (raw) => {
      let message = null;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
    }
    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

async function waitForGatewayReady(child, port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Gateway exited before ready with code ${child.exitCode}`);
    }
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error('connect timeout'));
        }, 800);
        ws.once('open', () => {
          clearTimeout(timer);
          resolve();
        });
        ws.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      return ws;
    } catch (error) {
      lastError = error;
      await wait(250);
    }
  }
  throw new Error(`Gateway did not become ready: ${lastError?.message || 'unknown'}`);
}

async function main() {
  const port = await findFreePortPair();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oct-gateway-smoke-'));
  const configFile = path.join(tmpDir, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({
    OCT_PROVIDER: 'custom',
    OCT_MODEL: 'smoke-model',
    CUSTOM_BASE_URL: 'http://127.0.0.1:1/v1',
    CUSTOM_API_KEY: 'sk-smoke',
    OCT_USE_EXTERNAL_OMNIROUTE: 'false',
    SUMMARIZER_ENABLED: 'false',
  }, null, 2), 'utf-8');

  const gatewayDir = path.resolve(__dirname, '..');
  const child = spawn(process.execPath, ['index.js'], {
    cwd: gatewayDir,
    env: {
      ...process.env,
      OCT_CONFIG_FILE: configFile,
      OCT_GOOGLE_CONFIG_FILE: path.join(tmpDir, 'missing-google-profile.json'),
      OCT_GATEWAY_PORT: String(port),
      OCT_GATEWAY_TOKEN: 'smoke-token',
      SUMMARIZER_ENABLED: 'false',
      VECTOR_RECALL_ENABLED: 'false',
      OCT_MEMORY_ROOT: path.join(tmpDir, 'memory'),
      VECTOR_DB_PATH: path.join(tmpDir, 'vectors.db'),
      NO_PROXY: 'localhost,127.0.0.1,::1',
      no_proxy: 'localhost,127.0.0.1,::1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  let ws = null;
  try {
    ws = await waitForGatewayReady(child, port);
    const challenge = await waitForMessage(ws, (message) => message.event === 'connect.challenge');
    assert.ok(challenge.payload.nonce);

    ws.send(JSON.stringify({
      type: 'req',
      id: 'connect-1',
      method: 'connect',
      params: { token: 'smoke-token', sessionKey: 'main' },
    }));
    const hello = await waitForMessage(ws, (message) => message.id === 'connect-1');
    assert.equal(hello.ok, true);
    assert.equal(hello.payload.model, 'smoke-model');

    ws.send(JSON.stringify({
      type: 'req',
      id: 'sessions-1',
      method: 'sessions.list',
      params: {},
    }));
    const sessions = await waitForMessage(ws, (message) => message.id === 'sessions-1');
    assert.equal(sessions.ok, true);
    assert.ok(Array.isArray(sessions.payload.sessions));

    ws.send(JSON.stringify({
      type: 'req',
      id: 'help-1',
      method: 'chat.send',
      params: { message: '/help', sessionKey: 'main' },
    }));
    const help = await waitForMessage(ws, (message) => message.event === 'chat' && /OCT Gateway 命令/.test(message.payload?.text || ''));
    assert.equal(help.payload.done, true);

    console.log('PASS gateway smoke start/connect/sessions/help');
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    child.kill('SIGTERM');
    await wait(500);
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
