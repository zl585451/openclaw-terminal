const config = require('../config');
const { createLogger } = require('../logger');
const fs = require('fs');
const path = require('path');
const log = createLogger('memory');
const memoryV2 = require('./memory_v2_store');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 同一路径失败次数，≥3 后标记 [BLOCKED] 跳过 */
const failedWrites = new Map();

const FAILED_WRITES_BLOCK_THRESHOLD = 3;
const FAILED_MEMORIES_PATH = path.join(process.cwd(), '.temp', 'failed_memories.json');

function extractHttpStatusFromError(errText) {
  const s = String(errText || '');
  const m = s.match(/HTTP\s+(\d{3})\b/);
  return m ? (m[1] | 0) : null;
}

// 缓存已确认存在的父节点路径，避免 writeMemory 每次都递归检查（进程生命周期内）。
const _confirmedParentPaths = new Set(); // `${domain}://${pathPrefix}`

function splitUri(uri) {
  const m = uri.match(/^([^:]+):\/\/(.+)$/);
  if (!m) return null;
  return { domain: m[1], path: m[2] };
}

/**
 * 停车场暂存：写入失败的记忆保存到 .temp/failed_memories.json
 */
function saveFailedMemory(uri, content, priority, disclosure, error) {
  try {
    const dir = path.dirname(FAILED_MEMORIES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let list = [];
    if (fs.existsSync(FAILED_MEMORIES_PATH)) {
      try {
        list = JSON.parse(fs.readFileSync(FAILED_MEMORIES_PATH, 'utf-8'));
      } catch {}
    }
    list.push({
      uri,
      content: String(content || '').slice(0, 500),
      priority,
      disclosure,
      error: String(error || '').slice(0, 200),
      ts: new Date().toISOString(),
    });
    fs.writeFileSync(FAILED_MEMORIES_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {
    log.debug('saveFailedMemory: write failed', { error: e?.message });
  }
}

/**
 * 读取节点
 * @param {string} uri
 * @param {{ treat404AsDebug?: boolean }} [opts]
 *
 * 修改原因：404 在"先读后创/逐级建路径"中是常态，若一律 warn 会刷屏。
 * 默认行为不变；只有 opts.treat404AsDebug=true 时才把 404 降到 debug。
 */
async function readMemory(uri, opts) {
  const r = memoryV2.readMemory(uri);
  if (!r.ok && !(opts && opts.treat404AsDebug === true)) {
    log.debug('memory_v2 read miss', { uri, error: r.error });
  }
  return r;
}

/**
 * 带 database is locked 重试的记忆读取。
 * 仅当错误包含 "database is locked" 时重试，最多 3 次，退避 100ms、200ms。
 * @param {string} uri
 * @param {{ treat404AsDebug?: boolean }} [opts]
 * @param {number} [maxRetries=3]
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
async function readMemoryWithRetry(uri, opts = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const r = await readMemory(uri, opts);
    if (r.ok) return r;
    const isLocked = String(r.error || '').toLowerCase().includes('database is locked');
    if (isLocked && i < maxRetries - 1) {
      const delayMs = 100 * (i + 1);
      log.debug('database is locked, retry', { uri, attempt: i + 1, maxRetries, delayMs });
      await sleep(delayMs);
      continue;
    }
    return r;
  }
  return { ok: false, error: 'retry exhausted' };
}

/**
 * 带 fallback 的记忆读取，404 时静默返回空，不阻塞主流程。
 * 适用于 core://my_user/history/* 和 core://my_user/preferences/* 首次使用场景。
 *
 * 第一层：直接读取，404 时 log.warn 并返回空
 * 第二层（可选）：ensurePathExists 后重试
 * 兜底：try/catch 捕获所有错误，返回空
 *
 * @param {string} uri
 * @param {{ ensurePathThenRetry?: boolean }} [opts]
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
async function readMemoryWithFallback(uri, opts = {}) {
  try {
    const r = await readMemoryWithRetry(uri, { treat404AsDebug: true });
    if (r.ok) return r;

    const status = extractHttpStatusFromError(r.error);
    if (status === 404) {
      log.info('memory not found, using empty', { uri });
      return { ok: false, data: null, error: r.error };
    }

    // 第二层：创建路径后重试（可选）
    if (opts.ensurePathThenRetry) {
      try {
        const memoryHistory = require('./memory_history');
        const parts = splitUri(uri);
        if (parts) {
          await memoryHistory.ensurePathExists(parts.domain, `${parts.path}/x`);
          const r2 = await readMemoryWithRetry(uri, { treat404AsDebug: true });
          if (r2.ok) return r2;
        }
      } catch {}
    }

    return r;
  } catch (error) {
    log.warn('memory read failed', { uri, error: error?.message || String(error) });
    return { ok: false, data: null, error: error?.message };
  }
}


/**
 * 写入节点 - 三层 fallback 机制，确保记忆写入尽可能成功。
 * @param {string} uri
 * @param {string} content
 * @param {number} [priority]
 * @param {string} [disclosure]
 * @param {{ ensureParent?: boolean }} [options]
 */
async function writeMemory(uri, content, priority = 2, disclosure = '', options) {
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效 URI: ${uri}` };
  const summaryMatch = parts.path.match(/^logs\/summary\/(daily|weekly|monthly)\/(.+)$/);
  if (summaryMatch) {
    let parsed = content;
    try { parsed = JSON.parse(String(content || '{}')); } catch {}
    return memoryV2.writeSummary(summaryMatch[1], summaryMatch[2], parsed);
  }
  const pendingMatch = parts.path.match(/^logs\/summary\/_pending\/(daily|weekly|monthly)\/(.+)$/);
  if (pendingMatch) {
    if (String(content || '') === '[CLEARED]') return memoryV2.clearPending(pendingMatch[1], pendingMatch[2]);
    let parsed = content;
    try { parsed = JSON.parse(String(content || '{}')); } catch {}
    return memoryV2.markPending(pendingMatch[1], pendingMatch[2], parsed);
  }
  return memoryV2.writeNote(uri, content, priority, disclosure);
}

/**
 * 创建新节点（POST 会递归创建父路径）。
 * 用于 history 等新 path。若节点已存在返回 422，可视为成功。
 * @param {string} uri
 * @param {string} content
 * @param {number} [priority]
 * @param {string} [disclosure]
 * @param {{ treat422AsDebug?: boolean }} [opts]
 */
async function createMemory(uri, content, priority = 2, disclosure = '', opts) {
  return writeMemory(uri, content, priority, disclosure, opts);
}

async function searchMemory(query, domain) {
  return memoryV2.searchMemory(query, domain || 'core', { limit: config.memory?.search_default_limit || 10 });
}

async function loadBootMemory(coreUris) {
  return memoryV2.loadBootMemory(coreUris);
}

async function isAlive() {
  return true;
}

/**
 * 重试停车场中失败的记忆（可选调用）
 * @returns {{ retried: number, failed: number }}
 */
async function retryFailedMemories() {
  let retried = 0;
  let failed = 0;
  try {
    if (!fs.existsSync(FAILED_MEMORIES_PATH)) return { retried, failed };
    const list = JSON.parse(fs.readFileSync(FAILED_MEMORIES_PATH, 'utf-8'));
    if (!Array.isArray(list) || list.length === 0) return { retried, failed };
    failedWrites.clear();
    for (const item of list) {
      const r = await writeMemory(item.uri, item.content, item.priority ?? 2, item.disclosure ?? '');
      if (r.ok) retried++;
      else failed++;
    }
    fs.writeFileSync(FAILED_MEMORIES_PATH, '[]', 'utf-8');
    if (retried > 0) log.info('retryFailedMemories', { retried, failed });
  } catch (e) {
    log.warn('retryFailedMemories failed', { error: e?.message });
  }
  return { retried, failed };
}

module.exports = { readMemory, readMemoryWithFallback, writeMemory, createMemory, searchMemory, loadBootMemory, isAlive, retryFailedMemories };
