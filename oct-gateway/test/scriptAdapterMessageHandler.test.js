const assert = require('assert');
const { createScriptAdapterMessageHandler } = require('../script_adapter/messageHandler');

function createConnection() {
  return {
    sent: [],
    send(message) {
      this.sent.push(message);
    },
  };
}

function createHandler(overrides = {}) {
  const calls = [];
  return {
    calls,
    handler: createScriptAdapterMessageHandler({
      startIntake: async (params) => ({ success: true, params }),
      startAnalysis: async () => ({ success: true }),
      startProductionHandoff: async () => ({ success: true }),
      startChapterPipelineRun: (params) => ({ taskId: params.taskId || 'run-1' }),
      cancelChapterPipelineRun: (taskId, reason) => ({ success: true, taskId, reason }),
      listChapterPipelineRuns: () => [{ taskId: 'run-1' }],
      startBatch: async () => ({ success: true, batchId: 'batch-1' }),
      getBatchStatus: (batchId) => ({ success: Boolean(batchId), batchId }),
      listBatches: (params) => ({ batches: [], params }),
      cancelBatch: (batchId) => ({ success: Boolean(batchId), batchId }),
      rerunChapter: () => ({ success: true }),
      deleteBatch: (batchId) => ({ success: Boolean(batchId), batchId }),
      approveGate: () => ({ success: true }),
      rejectGate: () => ({ success: true }),
      connectionRegistry: {
        subscribe(batchId, connection) {
          calls.push(['subscribe', batchId, connection]);
        },
      },
      logger: { info() {}, warn() {}, error() {} },
      ...overrides,
    }),
  };
}

async function testIntakeStart() {
  const { handler } = createHandler();
  const connection = createConnection();
  const handled = await handler({
    type: 'req',
    id: '1',
    method: 'scriptAdapter.intake.start',
    params: { title: 'demo' },
  }, connection);

  assert.equal(handled, true);
  assert.deepEqual(connection.sent[0], {
    type: 'res',
    id: '1',
    ok: true,
    method: 'scriptAdapter.intake.start',
    payload: { success: true, params: { title: 'demo' } },
    error: undefined,
  });
}

async function testRunStartPayload() {
  const { handler } = createHandler();
  const connection = createConnection();
  await handler({
    type: 'req',
    id: '2',
    method: 'scriptAdapter.run.start',
    params: { taskId: 'task-1' },
  }, connection);

  assert.equal(connection.sent[0].ok, true);
  assert.equal(connection.sent[0].payload.type, 'script-adapter-run-started');
  assert.equal(connection.sent[0].payload.taskId, 'task-1');
}

async function testBatchSubscribe() {
  const { handler, calls } = createHandler();
  const connection = createConnection();
  await handler({
    type: 'req',
    id: '3',
    method: 'scriptAdapter.batch.subscribe',
    params: { batchId: ' batch-1 ' },
  }, connection);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'batch-1');
  assert.deepEqual(connection.sent[0].payload, {
    subscribed: true,
    batchId: 'batch-1',
  });
}

async function testUnknownScriptAdapterFallsThrough() {
  const { handler } = createHandler();
  const connection = createConnection();
  const handled = await handler({
    type: 'req',
    id: '4',
    method: 'scriptAdapter.unknown',
  }, connection);

  assert.equal(handled, false);
  assert.equal(connection.sent.length, 0);
}

async function testNonScriptAdapterFallsThrough() {
  const { handler } = createHandler();
  const connection = createConnection();
  const handled = await handler({
    type: 'req',
    id: '5',
    method: 'sessions.list',
  }, connection);

  assert.equal(handled, false);
}

(async () => {
  await testIntakeStart();
  await testRunStartPayload();
  await testBatchSubscribe();
  await testUnknownScriptAdapterFallsThrough();
  await testNonScriptAdapterFallsThrough();
  console.log('PASS script adapter message handler is isolated');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
