'use strict';

const assert = require('node:assert');
const { startGatewayMemoryJobs } = require('../bootstrap/memoryJobs');

function main() {
  const calls = [];
  const deps = {
    memory: { id: 'memory' },
    memoryTaskQueue: { id: 'queue' },
    memoryManagementAgent: { id: 'agent' },
    reviewQueueMaintenance: { id: 'review' },
    logger: {
      info(message, payload) {
        calls.push(['log', message, payload]);
      },
    },
    memoryLogger: { id: 'memLog' },
    memoryRoot: 'tmp-memory-root',
    scheduleMemoryHealthCheck(options) {
      calls.push(['health', options]);
    },
    scheduleMemoryHeartbeat(options) {
      calls.push(['heartbeat', options]);
    },
    scheduleReviewQueueMaintenance(options) {
      calls.push(['review-maintenance', options]);
    },
    scheduleMemoryGovernanceReport(options) {
      calls.push(['governance', options]);
    },
    startMemoryMonitor(options) {
      calls.push(['monitor', options]);
    },
    startScheduler() {
      calls.push(['scheduler']);
    },
  };

  startGatewayMemoryJobs(deps);

  assert.deepEqual(calls.map(([name]) => name), [
    'health',
    'heartbeat',
    'review-maintenance',
    'governance',
    'log',
    'monitor',
    'scheduler',
  ]);
  assert.deepEqual(calls[0][1], { memory: deps.memory, logger: deps.logger });
  assert.deepEqual(calls[1][1], { memoryTaskQueue: deps.memoryTaskQueue, logger: deps.logger });
  assert.deepEqual(calls[2][1], {
    memoryTaskQueue: deps.memoryTaskQueue,
    reviewQueueMaintenance: deps.reviewQueueMaintenance,
    logger: deps.logger,
  });
  assert.deepEqual(calls[3][1], {
    memoryTaskQueue: deps.memoryTaskQueue,
    memoryManagementAgent: deps.memoryManagementAgent,
    logger: deps.logger,
  });
  assert.deepEqual(calls[4], ['log', 'Memory v2 file backend enabled', { root: 'tmp-memory-root' }]);
  assert.deepEqual(calls[5][1], { logger: deps.memoryLogger });

  console.log('PASS gateway memory jobs bootstrap is isolated');
}

main();
