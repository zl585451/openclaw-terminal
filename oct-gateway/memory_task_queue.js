/**
 * 后台记忆任务队列：串行执行记忆相关操作，失败时仅记录日志，不阻塞主流程。
 */

const memory = require('./memory');
const { createLogger } = require('./logger');
const log = createLogger('memory_queue');

const QUEUE_MAX = 15;
const TASK_DELAY_MS = 200;
const HEALTH_CHECK_CACHE_MS = 2000;

let queue = [];
let processing = false;
let lastHealthCheck = 0;
let lastHealthOk = true;

async function isMemoryHealthy() {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_CACHE_MS) {
    return lastHealthOk;
  }
  try {
    lastHealthOk = await memory.isAlive();
    lastHealthCheck = now;
    return lastHealthOk;
  } catch (error) {
    log.warn('memory health check failed', { error: error?.message || String(error) });
    lastHealthOk = false;
    lastHealthCheck = now;
    return false;
  }
}

function invalidateHealthCache() {
  lastHealthCheck = 0;
}

function runNext() {
  if (queue.length === 0) {
    processing = false;
    return;
  }
  const { fn, name } = queue.shift();
  processing = true;

  (async () => {
    const healthy = await isMemoryHealthy();
    if (!healthy) {
      log.debug('memory offline, skip background task', { name });
      setTimeout(runNext, TASK_DELAY_MS);
      return;
    }

    try {
      await fn();
    } catch (error) {
      log.warn('background memory task failed', { name, error: error?.message || String(error) });
    }

    setTimeout(runNext, TASK_DELAY_MS);
  })();
}

function enqueue(fn, name = 'unknown') {
  if (queue.length >= QUEUE_MAX) {
    log.warn('memory queue full, dropping oldest task', { name, queueLen: queue.length });
    queue.shift();
  }
  queue.push({ fn, name });
  if (!processing) {
    runNext();
  }
}

module.exports = {
  enqueue,
  isMemoryHealthy,
  invalidateHealthCache,
};
