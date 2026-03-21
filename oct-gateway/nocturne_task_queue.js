/**
 * Nocturne 后台任务队列：串行执行记忆相关操作，避免 6 路并发压垮 Nocturne。
 * 失败时仅记录日志，不阻塞主流程。支持健康检查降级。
 */

const memory = require('./memory');
const { createLogger } = require('./logger');
const log = createLogger('nocturne_queue');

const QUEUE_MAX = 15;
const TASK_DELAY_MS = 200;  // 任务间隔，分散 Nocturne 负载
const HEALTH_CHECK_CACHE_MS = 2000;  // 健康检查结果缓存 2 秒

let _queue = [];
let _processing = false;
let _lastHealthCheck = 0;
let _lastHealthOk = true;

async function isNocturneHealthy() {
  const now = Date.now();
  if (now - _lastHealthCheck < HEALTH_CHECK_CACHE_MS) {
    return _lastHealthOk;
  }
  try {
    _lastHealthOk = await memory.isAlive();
    _lastHealthCheck = now;
    return _lastHealthOk;
  } catch (e) {
    log.warn('Nocturne 健康检查异常', { error: e?.message || String(e) });
    _lastHealthOk = false;
    _lastHealthCheck = now;
    return false;
  }
}

/** 强制刷新健康状态（如心跳恢复后） */
function invalidateHealthCache() {
  _lastHealthCheck = 0;
}

function runNext() {
  if (_queue.length === 0) {
    _processing = false;
    return;
  }
  const { fn, name } = _queue.shift();
  _processing = true;

  (async () => {
    const healthy = await isNocturneHealthy();
    if (!healthy) {
      log.debug('Nocturne 离线，跳过后台任务', { name });
      setTimeout(runNext, TASK_DELAY_MS);
      return;
    }

    try {
      await fn();
    } catch (e) {
      log.warn('Nocturne 后台任务失败', { name, error: e?.message || String(e) });
    }

    setTimeout(runNext, TASK_DELAY_MS);
  })();
}

/**
 * 将 Nocturne 相关任务加入后台队列。
 * @param {() => Promise<void>} fn - 异步任务函数
 * @param {string} [name] - 任务名称，用于日志
 */
function enqueue(fn, name = 'unknown') {
  if (_queue.length >= QUEUE_MAX) {
    log.warn('Nocturne 队列已满，丢弃最旧项', { name, queueLen: _queue.length });
    _queue.shift();
  }
  _queue.push({ fn, name });
  if (!_processing) {
    runNext();
  }
}

module.exports = {
  enqueue,
  isNocturneHealthy,
  invalidateHealthCache,
};
