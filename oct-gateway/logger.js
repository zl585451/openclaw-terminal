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
  return 'INFO';
}

function formatLine({ ts, level, module, message }) {
  const safeModule = (module || 'gateway').replace(/\s+/g, '');
  const safeLevel = normalizeLevel(level);
  const safeMsg = message == null ? '' : String(message);
  return `[${ts}] [${safeLevel}] [${safeModule}] ${safeMsg}`;
}

function write(level, module, message, meta) {
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
  };
}

module.exports = { createLogger, write, formatTs };

