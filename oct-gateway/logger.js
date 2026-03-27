// 日志级别配置：DEBUG < INFO < WARN < ERROR
const LOG_LEVEL = 'INFO'; // 修改此处：DEBUG / INFO / WARN / ERROR

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTs(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function normalizeLevel(level) {
  const l = String(level || '').toUpperCase();
  if (l === 'ERROR') return 'ERROR';
  if (l === 'WARN' || l === 'WARNING') return 'WARN';
  if (l === 'DEBUG') return 'DEBUG';
  if (l === 'OK') return 'OK';
  return 'INFO';
}

// 日志级别优先级
const LEVEL_PRIORITY = {
  'DEBUG': 0,
  'INFO': 1,
  'OK': 1,
  'WARN': 2,
  'ERROR': 3
};

function shouldLog(level) {
  const currentPriority = LEVEL_PRIORITY[normalizeLevel(level)] || 1;
  const configPriority = LEVEL_PRIORITY[LOG_LEVEL] || 1;
  return currentPriority >= configPriority;
}

// 颜色与去重仅作用于输出层，不改变调用方的日志结构/语义。
// 修改原因：
// 1) Nocturne Memory 路径递归创建会伴随 404/422（读不到/已存在）这种"正常状态"，刷屏会淹没真实错误。
// 2) 需要让 memory 相关日志一眼可见，并在同一会话中对相同 404/422 仅记录一次。
const ANSI = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function isMemoryModule(module) {
  const m = String(module || '').toLowerCase();
  // memory, mem, memory_history, memory_feedback, memory_search 等
  return m === 'mem' || m.includes('memory') || m.startsWith('mem_') || m.startsWith('memory_');
}

function extractHttpStatusFromError(errText) {
  const s = String(errText || '');
  const m = s.match(/HTTP\s+(\d{3})\b/);
  return m ? (m[1] | 0) : null;
}

// 同一会话内重复的 404/422 只打一次，避免刷屏。
// - 会话 key 优先取 meta.sessionKey（若调用方未提供则退化为进程级）
// - 仅抑制重复项，不删除原日志：首次仍会输出
const _dedupe = new Map(); // key -> lastTs
const DEDUPE_TTL_MS = 10 * 60 * 1000;
const DEDUPE_MAX_KEYS = 5000;

function shouldDedupe({ level, module, message, meta }) {
  const m = meta && typeof meta === 'object' ? meta : null;
  const err = m?.error;
  const uri = m?.uri || m?.path || '';
  const status = extractHttpStatusFromError(err);
  if (status !== 404 && status !== 422) return false;

  // 只对 404/422 的"异常型日志"去重（避免影响业务 INFO 流）
  const L = normalizeLevel(level);
  if (L !== 'WARN' && L !== 'ERROR') return false;

  const sessionKey = m?.sessionKey || m?.session || m?.sid || 'global';
  const mod = String(module || 'gateway');
  const msg = String(message || '');
  const key = `${sessionKey}|${mod}|${status}|${uri}|${msg}`;

  const now = Date.now();
  // 过期清理（轻量）
  if (_dedupe.size > DEDUPE_MAX_KEYS) {
    for (const [k, ts] of _dedupe.entries()) {
      if (now - ts > DEDUPE_TTL_MS) _dedupe.delete(k);
    }
    // 仍过大则丢最早一批（避免无界增长）
    if (_dedupe.size > DEDUPE_MAX_KEYS) {
      const keys = [..._dedupe.keys()].slice(0, _dedupe.size - DEDUPE_MAX_KEYS);
      for (const k of keys) _dedupe.delete(k);
    }
  }

  const last = _dedupe.get(key);
  if (last && now - last < DEDUPE_TTL_MS) return true;
  _dedupe.set(key, now);
  return false;
}

function formatLine({ ts, level, module, message }) {
  const rawModule = (module || 'gateway').replace(/\s+/g, '');
  const safeModule = isMemoryModule(rawModule)
    ? `${ANSI.cyan}${rawModule}${ANSI.reset}`
    : rawModule;
  const safeLevel = normalizeLevel(level);
  const safeMsg = message == null ? '' : String(message);
  return `[${ts}] [${safeLevel}] [${safeModule}] ${safeMsg}`;
}

function write(level, module, message, meta) {
  // 新增：检查日志级别
  if (!shouldLog(level)) return;
  
  if (shouldDedupe({ level, module, message, meta })) return;

  const ts = formatTs(new Date());
  const line = formatLine({ ts, level, module, message });
  const metaText = meta && typeof meta === 'object'
    ? (() => {
        try { return ' ' + JSON.stringify(meta); } catch { return ''; }
      })()
    : '';

  if (level === 'ERROR') console.error(line + metaText);
  else if (level === 'WARN') console.warn(line + metaText);
  else if (level === 'DEBUG') console.log(line + metaText);
  else console.log(line + metaText);
}

function createLogger(moduleName) {
  return {
    info: (msg, meta) => write('INFO', moduleName, msg, meta),
    warn: (msg, meta) => write('WARN', moduleName, msg, meta),
    error: (msg, meta) => write('ERROR', moduleName, msg, meta),
    debug: (msg, meta) => write('DEBUG', moduleName, msg, meta),
    ok: (msg, meta) => write('OK', moduleName, msg, meta),
  };
}

module.exports = { createLogger, write, formatTs };
