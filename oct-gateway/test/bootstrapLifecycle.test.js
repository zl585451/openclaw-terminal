const assert = require('assert');
const {
  registerTaskBoardBroadcast,
  registerGatewayShutdown,
} = require('../bootstrap/lifecycle');

function createProcessDouble() {
  const handlers = new Map();
  return {
    exitedWith: null,
    on(signal, handler) {
      handlers.set(signal, handler);
    },
    off(signal, handler) {
      if (handlers.get(signal) === handler) handlers.delete(signal);
    },
    emit(signal) {
      const handler = handlers.get(signal);
      if (handler) handler();
    },
    exit(code) {
      this.exitedWith = code;
    },
    has(signal) {
      return handlers.has(signal);
    },
  };
}

function testTaskBoardBroadcast() {
  let callback = null;
  const messages = [];
  const registered = registerTaskBoardBroadcast({
    tools: {
      setOnTaskBoardUpdate(cb) {
        callback = cb;
      },
    },
    transports: {
      wsTransport: {
        broadcast(message) {
          messages.push(message);
        },
      },
    },
  });

  assert.equal(registered, true);
  assert.equal(typeof callback, 'function');
  callback();
  assert.deepEqual(messages, [{ type: 'event', event: 'task-board-update' }]);
}

function testTaskBoardMissingDependencies() {
  assert.equal(registerTaskBoardBroadcast({ tools: {}, transports: {} }), false);
}

function testGatewayShutdown() {
  const events = [];
  const processRef = createProcessDouble();
  const cleanup = registerGatewayShutdown({
    processRef,
    logger: { info: (message) => events.push(['log', message]) },
    stopScheduler: () => events.push(['stopScheduler']),
    transports: {
      close: (done) => {
        events.push(['close']);
        done();
      },
    },
  });

  assert.equal(processRef.has('SIGINT'), true);
  assert.equal(processRef.has('SIGTERM'), true);
  processRef.emit('SIGTERM');

  assert.deepEqual(events, [
    ['log', 'shutting down'],
    ['stopScheduler'],
    ['close'],
  ]);
  assert.equal(processRef.exitedWith, 0);

  cleanup();
  assert.equal(processRef.has('SIGINT'), false);
  assert.equal(processRef.has('SIGTERM'), false);
}

testTaskBoardBroadcast();
testTaskBoardMissingDependencies();
testGatewayShutdown();

console.log('PASS gateway lifecycle bootstrap is isolated');
