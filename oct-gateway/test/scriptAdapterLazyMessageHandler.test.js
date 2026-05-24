const assert = require('assert');
const {
  createLazyScriptAdapterMessageHandler,
  createLazyScriptAdapterRuntime,
  _internals,
} = require('../script_adapter/lazyMessageHandler');

function createConnection() {
  return {
    sent: [],
    send(message) {
      this.sent.push(message);
    },
  };
}

async function testNonScriptAdapterDoesNotLoadRuntime() {
  let loads = 0;
  const getRuntime = createLazyScriptAdapterRuntime({
    loadRuntime: () => {
      loads += 1;
      return {
        handleMessage: async () => true,
      };
    },
  });
  const handler = createLazyScriptAdapterMessageHandler({ getRuntime });
  const handled = await handler({ type: 'req', id: '1', method: 'sessions.list' }, createConnection());

  assert.equal(handled, false);
  assert.equal(loads, 0);
  assert.equal(getRuntime.isLoaded(), false);
}

async function testScriptAdapterLoadsRuntimeOnceAndDelegates() {
  let loads = 0;
  const calls = [];
  const getRuntime = createLazyScriptAdapterRuntime({
    loadRuntime: () => {
      loads += 1;
      return {
        handleMessage: async (msg, connection) => {
          calls.push([msg.method, connection]);
          return true;
        },
      };
    },
  });
  const handler = createLazyScriptAdapterMessageHandler({ getRuntime });
  const connection = createConnection();

  assert.equal(await handler({ type: 'req', id: '2', method: 'scriptAdapter.run.list' }, connection), true);
  assert.equal(await handler({ type: 'req', id: '3', method: 'scriptAdapter.batch.list' }, connection), true);

  assert.equal(loads, 1);
  assert.equal(getRuntime.isLoaded(), true);
  assert.deepEqual(calls.map(([method]) => method), [
    'scriptAdapter.run.list',
    'scriptAdapter.batch.list',
  ]);
}

async function testRuntimeLoadFailureReturnsGatewayError() {
  const errors = [];
  const getRuntime = createLazyScriptAdapterRuntime({
    loadRuntime: () => {
      throw new Error('boom');
    },
  });
  const handler = createLazyScriptAdapterMessageHandler({
    getRuntime,
    logger: {
      error(message, meta) {
        errors.push([message, meta]);
      },
    },
  });
  const connection = createConnection();
  const handled = await handler({
    type: 'req',
    id: '4',
    method: 'scriptAdapter.run.start',
  }, connection);

  assert.equal(handled, true);
  assert.equal(errors.length, 1);
  assert.deepEqual(connection.sent[0], {
    type: 'res',
    id: '4',
    ok: false,
    method: 'scriptAdapter.run.start',
    payload: undefined,
    error: { message: 'script adapter runtime failed to load' },
  });
}

function testRequestClassifier() {
  assert.equal(_internals.isScriptAdapterRequest({ type: 'req', method: 'scriptAdapter.run.list' }), true);
  assert.equal(_internals.isScriptAdapterRequest({ type: 'evt', method: 'scriptAdapter.run.list' }), false);
  assert.equal(_internals.isScriptAdapterRequest({ type: 'req', method: 'image.generate' }), false);
}

(async () => {
  await testNonScriptAdapterDoesNotLoadRuntime();
  await testScriptAdapterLoadsRuntimeOnceAndDelegates();
  await testRuntimeLoadFailureReturnsGatewayError();
  testRequestClassifier();
  console.log('PASS script adapter lazy message handler gates runtime load');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
