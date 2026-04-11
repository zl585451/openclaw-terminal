/**
 * 工具层共享模块：任务存储、memory 队列、代理 fetch、缓存等
 * 供 tools/*.js 各工具引用
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const memory = require('../memory');
const memoryHistory = require('../memory_history');
const memorySearch = require('../memory_search');
const memoryGovernor = require('../memory_governor');
const config = require('../config');
const { createLogger } = require('../logger');
const log = createLogger('tools');

function getTasksFilePath() {
  return process.env.OPENCLAW_TASKS_PATH ||
    (process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'openclaw-terminal', 'tasks.json')
      : path.join(os.homedir(), '.config', 'openclaw-terminal', 'tasks.json'));
}
const TASKS_FILE_PATH = getTasksFilePath();
log.info('TASKS_FILE_PATH', { path: TASKS_FILE_PATH });

let onTaskBoardUpdate = null;
function setOnTaskBoardUpdate(fn) {
  onTaskBoardUpdate = fn;
}
function getOnTaskBoardUpdate() {
  return onTaskBoardUpdate;
}

function loadTasksData() {
  try {
    if (fs.existsSync(TASKS_FILE_PATH)) {
      const content = fs.readFileSync(TASKS_FILE_PATH, 'utf-8');
      const data = JSON.parse(content);
      return {
        tasks: data.tasks || [],
        parking: data.parking || [],
        intention: data.intention || '',
        updatedAt: data.updatedAt || '',
      };
    }
  } catch (e) {
    log.error('tasks load failed', { error: e?.message || String(e) });
  }
  return { tasks: [], parking: [], intention: '', updatedAt: '' };
}

function saveTasksData(data) {
  try {
    data.updatedAt = new Date().toISOString();
    const dir = path.dirname(TASKS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TASKS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    log.error('tasks save failed', { error: e?.message || String(e) });
    return false;
  }
}

function normalizeTaskContent(content) {
  return String(content || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isLikelyDuplicateTaskContent(a, b) {
  const left = normalizeTaskContent(a);
  const right = normalizeTaskContent(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (shorter.length < 4) return false;

  return longer.includes(shorter) && longer.length - shorter.length <= 16;
}

function findOpenDuplicateTask(tasks, content) {
  return (tasks || []).find(task => !task?.done && isLikelyDuplicateTaskContent(task?.content, content)) || null;
}

// memory_write 队列
const WRITE_QUEUE = [];
let isProcessingQueue = false;
const WRITE_TIMEOUT_MS = 5000;
const WRITE_DELAY_MS = 200;

async function writeWithTimeout(uri, content, priority, disclosure) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      log.error('memory_write timeout', { uri, timeoutMs: WRITE_TIMEOUT_MS });
      resolve({ ok: false, error: `写入超时 (${WRITE_TIMEOUT_MS}ms)` });
    }, WRITE_TIMEOUT_MS);

    (async () => {
      try {
        const routed = memoryGovernor.routeRecord({
          source: 'tool_memory_write',
          uri,
          content,
          priority,
          disclosure,
        });
        if (routed.decision === 'reject') {
          clearTimeout(timer);
          log.info('memory_write governor rejected', { uri, reason: routed.reason });
          resolve({ ok: false, blocked: true, error: `Governor blocked: ${routed.reason}` });
          return;
        }

        const targetUri = routed.uri;
        const targetContent = routed.content;
        const targetPriority = routed.priority ?? priority;
        const targetDisclosure = routed.disclosure ?? disclosure;

        const m = uri.match(/^([^:]+):\/\/(.+)$/);
        if (!m) {
          clearTimeout(timer);
          resolve({ ok: false, error: `无效 URI: ${uri}` });
          return;
        }
        const targetMatch = targetUri.match(/^([^:]+):\/\/(.+)$/);
        if (!targetMatch) {
          clearTimeout(timer);
          resolve({ ok: false, error: `Governor 返回无效 URI: ${targetUri}` });
          return;
        }

        const [, domain, pathPart] = targetMatch;
        const exists = await memory.readMemory(targetUri, { treat404AsDebug: true });
        if (exists.ok && exists.data) {
          const r = await memory.writeMemory(targetUri, targetContent, targetPriority, targetDisclosure);
          clearTimeout(timer);
          resolve({ ...r, updated: r.ok });
        } else {
          await memoryHistory.ensurePathExists(domain, pathPart);
          const r = await memory.createMemory(targetUri, targetContent, targetPriority, targetDisclosure);
          clearTimeout(timer);
          resolve({ ...r, created: r.ok });
        }
      } catch (e) {
        clearTimeout(timer);
        log.error('memory_write exception', { uri, error: e?.message || String(e) });
        resolve({ ok: false, error: e?.message || String(e) });
      }
    })();
  });
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (WRITE_QUEUE.length > 0) {
    const task = WRITE_QUEUE.shift();
    log.debug('memory_write process', { uri: task.uri, remaining: WRITE_QUEUE.length });

    try {
      const result = await writeWithTimeout(task.uri, task.content, task.priority, task.disclosure);
      if (result.ok) {
        memorySearch.invalidateGlossaryCache();
        task.resolve({ success: true, created: result.created, updated: result.updated });
      } else {
        log.error('memory_write failed', { uri: task.uri, error: result.error });
        task.resolve({ success: false, error: result.error });
      }
    } catch (e) {
      log.error('memory_write task exception', { uri: task.uri, error: e?.message || String(e) });
      task.resolve({ success: false, error: e?.message || String(e) });
    }

    if (WRITE_QUEUE.length > 0) {
      await new Promise(r => setTimeout(r, WRITE_DELAY_MS));
    }
  }

  isProcessingQueue = false;
}

function enqueueWrite(uri, content, priority, disclosure) {
  return new Promise((resolve) => {
    WRITE_QUEUE.push({ uri, content, priority, disclosure, resolve });
    log.debug('memory_write enqueue', { uri, queueLen: WRITE_QUEUE.length });
    processQueue();
  });
}

// 代理 fetch
let proxyDispatcher = null;
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
if (proxyUrl) {
  try {
    const { ProxyAgent } = require('undici');
    proxyDispatcher = new ProxyAgent(proxyUrl);
    log.info('proxy enabled', { proxyUrl });
  } catch (e) {
    log.warn('ProxyAgent not available, proxy disabled', { error: e?.message || String(e) });
  }
}

function proxyFetch(url, options = {}) {
  if (proxyDispatcher && !options.dispatcher) {
    return fetch(url, { ...options, dispatcher: proxyDispatcher });
  }
  return fetch(url, options);
}

// web_fetch 缓存
const fetchCache = new Map();
const FETCH_CACHE_TTL = Number(process.env.OCT_FETCH_CACHE_TTL_MS || 5 * 60 * 1000);
const FETCH_CACHE_MAX = Number(process.env.OCT_FETCH_CACHE_MAX || 100);
const MAX_CACHED_CONTENT_SIZE = Number(process.env.OCT_FETCH_CACHE_MAX_CHARS || 4000);

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = Number(process.env.OCT_FETCH_CACHE_CLEANUP_INTERVAL_MS || 60_000);

function cleanupFetchCache() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  let cleaned = 0;
  for (const [key, val] of fetchCache) {
    if (now - val.timestamp > FETCH_CACHE_TTL) {
      fetchCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log.debug('fetch cache cleaned', { cleaned });
  }
}

setInterval(() => cleanupFetchCache(), Math.max(5_000, CLEANUP_INTERVAL)).unref?.();

module.exports = {
  memory,
  memorySearch,
  config,
  log,
  loadTasksData,
  saveTasksData,
  normalizeTaskContent,
  isLikelyDuplicateTaskContent,
  findOpenDuplicateTask,
  setOnTaskBoardUpdate,
  getOnTaskBoardUpdate,
  enqueueWrite,
  proxyFetch,
  fetchCache,
  cleanupFetchCache,
  FETCH_CACHE_TTL,
  FETCH_CACHE_MAX,
  MAX_CACHED_CONTENT_SIZE,
};
