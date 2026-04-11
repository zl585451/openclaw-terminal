function isLocalInternalRequest(req) {
  const remote = String(req.socket?.remoteAddress || '');
  return (
    remote === '127.0.0.1' ||
    remote === '::1' ||
    remote === '::ffff:127.0.0.1'
  );
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendCanvasTransportEvent(connection, action, payload) {
  connection.send({
    type: 'event',
    event: 'canvas',
    action,
    payload,
  });
}

function sendCanvasEvent(ws, action, payload) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({
    type: 'event',
    event: 'canvas',
    action,
    payload,
  }));
}

module.exports = {
  isLocalInternalRequest,
  readJsonBody,
  sendCanvasTransportEvent,
  sendCanvasEvent,
};
