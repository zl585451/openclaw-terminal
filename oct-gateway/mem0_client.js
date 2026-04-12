/**
 * Mem0 Service HTTP 客户端
 *
 * 封装对 127.0.0.1:8002 的接口：
 *   isAlive()                        — 健康检查，带 5s 缓存，失败静默降级
 *   addMemory(userMsg, reply, userId) — 提取事实写入，超时 8s，失败返回 { ok: false }
 *   searchMemory(query, opts)         — 语义搜索，超时 8s，失败返回 { ok: false, results: [] }
 *   getAllMemories(userId)             — 获取全部记忆（管理用）
 *   deleteMemory(memoryId, userId)    — 删除单条记忆
 *   clearAll(userId)                  — 清空用户全部记忆
 *
 * 所有方法均不抛出异常，调用方可以放心 fire-and-forget 或直接解构 ok。
 */

const { createLogger } = require('./logger');
const log = createLogger('mem0_client');

const MEM0_BASE_URL = process.env.MEM0_BASE_URL || 'http://127.0.0.1:8002';
const HEALTH_CACHE_MS = 5000;
const REQUEST_TIMEOUT_MS = 8000;

let _healthCache = null; // { ok: boolean, ts: number }

/**
 * 带超时的 fetch（Node 18+ 原生 AbortSignal.timeout）
 */
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * 检查 Mem0 服务是否存活
 * 带 5s 缓存避免每轮对话都发 HTTP 请求
 */
async function isAlive() {
  const now = Date.now();
  if (_healthCache && now - _healthCache.ts < HEALTH_CACHE_MS) {
    return _healthCache.ok;
  }
  try {
    const res = await fetchWithTimeout(`${MEM0_BASE_URL}/health`, {}, 2000);
    if (!res.ok) {
      _healthCache = { ok: false, ts: now };
      return false;
    }
    const data = await res.json();
    const alive = data?.ok === true && data?.mem0_ready === true;
    _healthCache = { ok: alive, ts: now };
    if (!alive) {
      log.debug('mem0 not ready', { error: data?.error });
    }
    return alive;
  } catch (e) {
    _healthCache = { ok: false, ts: now };
    log.debug('mem0 health check failed', { error: e?.message || String(e) });
    return false;
  }
}

/**
 * 强制刷新健康缓存（内部失败降级时使用）
 */
function invalidateHealthCache() {
  _healthCache = null;
}

/**
 * 将一轮对话写入 Mem0（异步，LLM 提取事实后存入 Qdrant）
 * @param {string} userMessage
 * @param {string} assistantReply
 * @param {string} [userId]
 * @returns {Promise<{ ok: boolean, results?: any, error?: string }>}
 */
async function addMemory(userMessage, assistantReply, userId) {
  try {
    const res = await fetchWithTimeout(
      `${MEM0_BASE_URL}/add`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_message: userMessage || '',
          assistant_reply: assistantReply || '',
          user_id: userId || undefined,
        }),
      },
      REQUEST_TIMEOUT_MS
    );
    const data = await res.json();
    if (data?.ok) {
      log.info('mem0.add ok', {
        userId,
        results: Array.isArray(data.results?.results) ? data.results.results.length : '?',
      });
    } else {
      log.warn('mem0.add not ok', { error: data?.error });
      invalidateHealthCache();
    }
    return data;
  } catch (e) {
    log.warn('mem0.add error', { error: e?.message || String(e) });
    invalidateHealthCache();
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * 语义搜索 Mem0 记忆
 * @param {string} query
 * @param {{ limit?: number, userId?: string }} [opts]
 * @returns {Promise<{ ok: boolean, results: Array<{ memory: string, score: number }> }>}
 */
async function searchMemory(query, opts = {}) {
  const limit = opts.limit || 5;
  const userId = opts.userId || undefined;
  try {
    const res = await fetchWithTimeout(
      `${MEM0_BASE_URL}/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, user_id: userId, limit }),
      },
      REQUEST_TIMEOUT_MS
    );
    const data = await res.json();
    if (!data?.ok) {
      log.debug('mem0.search not ok', { error: data?.error });
      invalidateHealthCache();
    }
    return {
      ok: data?.ok === true,
      results: Array.isArray(data?.results) ? data.results : [],
    };
  } catch (e) {
    log.debug('mem0.search error', { error: e?.message || String(e) });
    invalidateHealthCache();
    return { ok: false, results: [] };
  }
}

/**
 * 获取用户全部记忆（管理用，设置页展示）
 * @param {string} [userId]
 * @returns {Promise<{ ok: boolean, count: number, results: Array<{ id: string, memory: string, score?: number }> }>}
 */
async function getAllMemories(userId) {
  try {
    const uid = userId || '';
    const res = await fetchWithTimeout(
      `${MEM0_BASE_URL}/get_all${uid ? `?user_id=${encodeURIComponent(uid)}` : ''}`,
      {},
      REQUEST_TIMEOUT_MS
    );
    const data = await res.json();
    return {
      ok: data?.ok === true,
      count: data?.count || 0,
      results: Array.isArray(data?.results) ? data.results : [],
    };
  } catch (e) {
    log.debug('mem0.get_all error', { error: e?.message || String(e) });
    return { ok: false, count: 0, results: [] };
  }
}

/**
 * 删除单条记忆
 * @param {string} memoryId
 * @param {string} [userId]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function deleteMemory(memoryId, userId) {
  try {
    const res = await fetchWithTimeout(
      `${MEM0_BASE_URL}/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory_id: memoryId, user_id: userId || undefined }),
      },
      REQUEST_TIMEOUT_MS
    );
    const data = await res.json();
    if (data?.ok) {
      log.info('mem0.delete ok', { memoryId });
    } else {
      log.warn('mem0.delete not ok', { memoryId, error: data?.error });
    }
    return { ok: data?.ok === true, error: data?.error };
  } catch (e) {
    log.warn('mem0.delete error', { error: e?.message || String(e) });
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * 清空用户全部记忆
 * @param {string} [userId]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function clearAll(userId) {
  try {
    const res = await fetchWithTimeout(
      `${MEM0_BASE_URL}/clear_all`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId || undefined }),
      },
      REQUEST_TIMEOUT_MS
    );
    const data = await res.json();
    if (data?.ok) {
      log.info('mem0.clear_all ok', { userId });
    } else {
      log.warn('mem0.clear_all not ok', { error: data?.error });
    }
    return { ok: data?.ok === true, error: data?.error };
  } catch (e) {
    log.warn('mem0.clear_all error', { error: e?.message || String(e) });
    return { ok: false, error: e?.message || String(e) };
  }
}

module.exports = { isAlive, addMemory, searchMemory, getAllMemories, deleteMemory, clearAll };
