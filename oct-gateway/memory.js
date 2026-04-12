const config = require('./config');
const { NOCTURNE_BASE_URL } = config;
const { createLogger } = require('./logger');
const fs = require('fs');
const path = require('path');
const log = createLogger('memory');

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

async function nocturneRequestOnce(method, apiPath, params, body) {
  const url = new URL(NOCTURNE_BASE_URL + apiPath);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString(), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status}: ${text}` };
  }
  const data = await res.json().catch(() => null);
  return { ok: true, data };
}

async function nocturneRequest(method, apiPath, params, body) {
  const isRead = method === 'GET';
  const retryCfg = config.nocturne && (isRead ? config.nocturne.read_retry : config.nocturne.write_retry);
  const maxAttempts = retryCfg && typeof retryCfg.count === 'number' ? retryCfg.count + 1 : 1;
  const intervalMs = retryCfg && typeof retryCfg.interval_ms === 'number' ? retryCfg.interval_ms : 500;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await nocturneRequestOnce(method, apiPath, params, body);
      if (r.ok || (r.error && r.error.includes('HTTP 4'))) return r;
      if (attempt < maxAttempts) {
        log.debug('nocturne retry', { method, attempt, maxAttempts, intervalMs });
        await sleep(intervalMs);
      } else {
        return r;
      }
    } catch (e) {
      if (attempt >= maxAttempts) return { ok: false, error: e?.message || String(e) };
      log.debug('nocturne retry after error', { method, attempt, error: e?.message });
      await sleep(intervalMs);
    }
  }
  return { ok: false, error: 'retry exhausted' };
}

function splitUri(uri) {
  const m = uri.match(/^([^:]+):\/\/(.+)$/);
  if (!m) return null;
  return { domain: m[1], path: m[2] };
}

/**
 * 确保某个 URI 的父路径存在。
 * 规则：先读，存在则跳过；404 时用 POST 创建（支持递归创建多级父路径）。
 * Nocturne POST /browse/node 会递归创建父路径，PUT 仅用于更新已存在节点。
 * @param {string} uri - 如 core://a/b/c
 */
async function ensureParentPathExists(uri) {
  const parts = splitUri(uri);
  if (!parts) throw new Error(`无效 URI: ${uri}`);
  const segs = String(parts.path || '').split('/').filter(Boolean);
  if (segs.length <= 1) return;

  const parentPath = segs.slice(0, -1).join('/');
  const parentKey = `${parts.domain}://${parentPath}`;
  if (_confirmedParentPaths.has(parentKey)) {
    log.debug('ensurePathExists: parent already confirmed', { uri: parentKey });
    return;
  }

  for (let i = 1; i < segs.length; i++) {
    const p = segs.slice(0, i).join('/');
    const key = `${parts.domain}://${p}`;
    if (_confirmedParentPaths.has(key)) continue;

    const rr = await readMemory(key, { treat404AsDebug: true });
    if (rr.ok) {
      log.debug('ensurePathExists: path exists', { uri: key });
      _confirmedParentPaths.add(key);
      continue;
    }
    const status = extractHttpStatusFromError(rr.error);
    if (status !== 404) {
      log.warn('ensurePathExists: read failed (non-404)', { uri: key, error: rr.error });
      throw new Error(rr.error || 'read failed');
    }

    // 使用 POST 创建（PUT 仅更新已存在节点，会 404）
    const cr = await nocturneRequest('POST', '/browse/node', { path: p, domain: parts.domain }, {
      content: `${segs[i - 1]} 节点`,
      priority: 2,
      disclosure: '',
    });
    if (cr.ok) {
      _confirmedParentPaths.add(key);
      log.info('ensurePathExists: parent created', { uri: key, method: 'POST' });
    } else {
      const cStatus = extractHttpStatusFromError(cr.error);
      if (cStatus === 422) {
        _confirmedParentPaths.add(key);
        log.debug('ensurePathExists: path exists (422)', { uri: key });
      } else {
        log.error('ensurePathExists: create failed', { uri: key, error: cr.error });
        throw new Error(cr.error || 'create failed');
      }
    }
  }
}

/**
 * Fallback：直接调用 POST 创建父路径（不依赖先读）。
 * 当 ensureParentPathExists 失败时，在 writeMemory 前再尝试一次。
 */
async function ensureParentPathExistsFallback(uri) {
  const parts = splitUri(uri);
  if (!parts) return { ok: false };
  const segs = String(parts.path || '').split('/').filter(Boolean);
  if (segs.length <= 1) return { ok: true };

  const parentPath = segs.slice(0, -1).join('/');
  const cr = await nocturneRequest('POST', '/browse/node', { path: parentPath, domain: parts.domain }, {
    content: `${segs[segs.length - 2]} 节点`,
    priority: 2,
    disclosure: '',
  });
  if (cr.ok) {
    for (let i = 1; i < segs.length; i++) {
      _confirmedParentPaths.add(`${parts.domain}://${segs.slice(0, i).join('/')}`);
    }
    log.info('ensurePathExistsFallback: parent created', { uri: `${parts.domain}://${parentPath}` });
    return { ok: true };
  }
  log.warn('ensurePathExistsFallback: failed', { uri: `${parts.domain}://${parentPath}`, error: cr.error });
  return { ok: false, error: cr.error };
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
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效 URI: ${uri}` };
  const r = await nocturneRequest('GET', '/browse/node', { path: parts.path, domain: parts.domain });
  if (r.ok) {
    log.debug('read ok', { uri });
  } else {
    const status = extractHttpStatusFromError(r.error);
    if (status === 404 && opts && opts.treat404AsDebug === true) {
      log.debug('read not found', { uri, error: r.error });
    } else {
      log.warn('read failed', { uri, error: r.error });
    }
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

  // BLOCKED 检查：同一路径失败 ≥3 次后跳过
  const failCount = failedWrites.get(uri) || 0;
  if (failCount >= FAILED_WRITES_BLOCK_THRESHOLD) {
    log.warn('[BLOCKED] memory write skipped (too many failures)', { uri, failCount });
    return { ok: false, error: `[BLOCKED] ${uri} failed ${failCount} times` };
  }

  const ensureParent = options?.ensureParent !== false;
  let lastError = null;

  // ═══════════════════════════════════════════════════════════════
  // 第一层：ensurePathExists → 创建父路径
  // ═══════════════════════════════════════════════════════════════
  if (ensureParent) {
    try {
      await ensureParentPathExists(uri);
    } catch (e) {
      log.warn('[WARN] ensurePathExists failed, trying direct create', { uri, error: e?.message || String(e) });
      lastError = e?.message || String(e);
    }
  }

  let exists = await readMemory(uri, { treat404AsDebug: true });
  if (!exists.ok) {
    const status = extractHttpStatusFromError(exists.error);
    if (status !== 404) {
      log.warn('[WARN] memory existence check failed, will still attempt write', {
        uri,
        error: exists.error,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 第二层：若节点不存在 → createMemory（POST）
  // 关键修复：不能把“422 已存在”当作覆盖成功，否则会出现假成功但内容未更新
  // ═══════════════════════════════════════════════════════════════
  if (!exists.ok) {
    const cr = await createMemory(uri, content || '', priority, disclosure || '', { treat422AsDebug: false });
    if (cr.ok) {
      failedWrites.delete(uri);
      log.info('[INFO] memory write ok (createMemory)', { uri, contentLen: String(content || '').length, priority });
      return { ...cr, created: true };
    }
    lastError = cr.error;
    const crStatus = extractHttpStatusFromError(cr.error);
    if (crStatus !== 422) {
      log.warn('[WARN] createMemory failed, trying PUT overwrite as fallback', { uri, error: cr.error });
    } else {
      log.warn('[WARN] createMemory reported existing path during write, falling through to PUT overwrite', {
        uri,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 第三层：PUT 覆盖写入（假设节点已存在）
  // ═══════════════════════════════════════════════════════════════
  const r = await nocturneRequest('PUT', '/browse/node',
    { path: parts.path, domain: parts.domain },
    { content, priority, disclosure }
  );
  if (r.ok) {
    failedWrites.delete(uri);
    log.info('[INFO] memory write ok (PUT)', { uri, contentLen: String(content || '').length, priority });
    return { ...r, updated: true };
  }

  // 完全失败：记录、计数、停车场
  lastError = r.error || lastError;
  const newCount = (failedWrites.get(uri) || 0) + 1;
  failedWrites.set(uri, newCount);
  log.error('[ERROR] memory write failed', { uri, contentLen: String(content || '').length, error: lastError, failCount: newCount });
  saveFailedMemory(uri, content, priority, disclosure, lastError);
  return { ok: false, error: lastError };
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
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效 URI: ${uri}` };
  if (!parts.path || !parts.path.trim()) return { ok: false, error: 'path cannot be empty' };

  const r = await nocturneRequest('POST', '/browse/node', { path: parts.path, domain: parts.domain }, {
    content: content || '',
    priority,
    disclosure: disclosure || '',
  });
  if (r.ok) {
    log.info('create ok', { uri, contentLen: String(content || '').length, priority });
  } else {
    const status = extractHttpStatusFromError(r.error);
    if (status === 422) {
      if (opts?.treat422AsDebug) {
        log.debug('create: path exists (422)', { uri, error: r.error });
      } else {
        log.info('create: path exists (422)', { uri });
      }
      // 已存在视为成功，便于 fallback 场景
      return { ok: true };
    }
    log.error('create failed', { uri, contentLen: String(content || '').length, error: r.error });
  }
  return r;
}

async function searchMemory(query, domain) {
  const domainsResult = await nocturneRequest('GET', '/browse/domains');
  const matches = [];
  if (domainsResult.ok && Array.isArray(domainsResult.data)) {
    const domains = domainsResult.data
      .map(d => d.domain)
      .filter(d => !domain || d === domain);
    const q = query.toLowerCase();
    for (const dom of domains) {
      const r = await nocturneRequest('GET', '/browse/node', { path: '', domain: dom, nav_only: 'true' });
      if (!r.ok) continue;
      const children = r.data?.children || [];
      for (const child of children) {
        if (child.path?.toLowerCase().includes(q)) {
          matches.push({ uri: `${dom}://${child.path}`, domain: dom, path: child.path });
        }
      }
    }
  }
  log.debug('search', { query: String(query || ''), domain: domain || '', results: matches.length });
  return { ok: true, data: matches };
}

async function loadBootMemory(coreUris) {
  if (!coreUris || coreUris.length === 0) return '';
  const results = [];
  for (const uri of coreUris) {
    try {
      const r = await readMemoryWithFallback(uri);
      log.debug('boot read', {
        uri,
        ok: r.ok,
        preview: r.ok ? (r.data?.node?.content || '').slice(0, 50) : '',
        error: r.ok ? '' : r.error,
      });
      if (r.ok && r.data) {
        const content =
          r.data?.node?.content ||
          r.data?.content ||
          (typeof r.data === 'string' ? r.data : '');
        const nodeLines = [];
        if (content && content !== '[DELETED]') {
          const trimmed = content.length > 500 ? content.slice(0, 500) + '...' : content;
          nodeLines.push(trimmed);
        }
        // 同时读取子节点的 content_snippet（解决偏好等父节点内容为空的问题）
        const children = r.data?.children || [];
        for (const child of children) {
          const snippet = child.content_snippet || '';
          if (snippet && snippet !== '[DELETED]') {
            const childLabel = child.uri || child.path || '';
            const childTrimmed = snippet.length > 200 ? snippet.slice(0, 200) + '...' : snippet;
            nodeLines.push(`  [${childLabel}] ${childTrimmed}`);
          }
        }
        if (nodeLines.length > 0) {
          results.push(`[${uri}]\n${nodeLines.join('\n')}`);
        }
      }
    } catch (e) {
      log.error('boot read exception', { uri, error: e?.message || String(e) });
    }
  }
  return results.join('\n\n---\n\n');
}

async function isAlive() {
  try {
    const res = await fetch(`${NOCTURNE_BASE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
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
