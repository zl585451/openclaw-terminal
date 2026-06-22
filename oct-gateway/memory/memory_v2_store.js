/**
 * Memory v2 lightweight local store.
 *
 * This is the default memory backend for OCT. It keeps the legacy core:// URI
 * shape at API boundaries, but stores data in plain files under ~/.openclaw.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_ROOT = path.join(os.homedir(), '.openclaw', 'memory');

function getMemoryRoot() {
  const config = require('../config');
  return config.memory?.root || process.env.OCT_MEMORY_ROOT || DEFAULT_ROOT;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeSegment(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[<>:"|?*\x00-\x1F]/g, '_'))
    .join('/');
}

function splitUri(uri) {
  const match = String(uri || '').match(/^([^:]+):\/\/(.*)$/);
  if (!match) return null;
  return { domain: match[1], path: match[2] || '' };
}

function jsonLinePathForDate(dateStr) {
  return path.join(getMemoryRoot(), 'turns', `${dateStr}.jsonl`);
}

function notePathForUri(uri) {
  const parts = splitUri(uri);
  if (!parts) return null;
  const rel = safeSegment(parts.path || 'root') || 'root';
  return path.join(getMemoryRoot(), 'notes', safeSegment(parts.domain || 'core'), `${rel}.md`);
}

function summaryPath(level, key) {
  return path.join(getMemoryRoot(), 'summaries', safeSegment(level), `${safeSegment(key)}.json`);
}

function pendingPath(level, key) {
  return path.join(getMemoryRoot(), 'summaries', '_pending', safeSegment(level), `${safeSegment(key)}.json`);
}

function readJsonFile(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readJsonl(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function listRawDates() {
  const dir = path.join(getMemoryRoot(), 'turns');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .map((name) => name.slice(0, 10))
    .sort();
}

function readDayTurns(dateStr) {
  return readJsonl(jsonLinePathForDate(dateStr))
    .map((item, index) => ({ ...item, _index: index + 1 }))
    .sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0));
}

function listRecentTurns(limit = 5) {
  const dates = listRawDates().slice(-7).reverse();
  const turns = [];
  for (const date of dates) {
    turns.push(...readDayTurns(date).reverse());
    if (turns.length >= limit) break;
  }
  return turns
    .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
    .slice(0, limit);
}

function appendRawTurn(payload, uri) {
  const dateStr = String(payload?.ts || new Date().toISOString()).slice(0, 10);
  const filePath = jsonLinePathForDate(dateStr);
  ensureDir(path.dirname(filePath));
  const finalPayload = {
    ...payload,
    uri,
  };
  fs.appendFileSync(filePath, JSON.stringify(finalPayload) + '\n', 'utf-8');
  return { ok: true, data: { uri, node: { uri, content: JSON.stringify(finalPayload) } } };
}

function dedupeExists(key) {
  if (!key) return false;
  const indexPath = path.join(getMemoryRoot(), 'indexes', 'raw_dedupe.json');
  const data = readJsonFile(indexPath, {});
  return Boolean(data[key]);
}

function markDedupe(key, value) {
  if (!key) return;
  const indexPath = path.join(getMemoryRoot(), 'indexes', 'raw_dedupe.json');
  const data = readJsonFile(indexPath, {});
  data[key] = value || { ts: new Date().toISOString() };
  writeJsonFile(indexPath, data);
}

function readSummary(level, key) {
  const data = readJsonFile(summaryPath(level, key), null);
  if (!data) return null;
  return data;
}

function writeSummary(level, key, data) {
  writeJsonFile(summaryPath(level, key), data);
  return { ok: true, data };
}

function markPending(level, key, data) {
  writeJsonFile(pendingPath(level, key), data);
  return { ok: true, data };
}

function clearPending(level, key) {
  writeJsonFile(pendingPath(level, key), { cleared: true, cleared_at: new Date().toISOString() });
  return { ok: true };
}

function listPending(level) {
  const dir = path.join(getMemoryRoot(), 'summaries', '_pending', safeSegment(level));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ key: name.slice(0, -5), data: readJsonFile(path.join(dir, name), {}) }))
    .filter((item) => !item.data?.cleared);
}

function writeNote(uri, content, priority = 2, disclosure = '') {
  const filePath = notePathForUri(uri);
  if (!filePath) return { ok: false, error: `无效 URI: ${uri}` };
  const meta = [
    '---',
    `uri: ${uri}`,
    `priority: ${priority}`,
    `disclosure: ${String(disclosure || '').replace(/\r?\n/g, ' ')}`,
    `updated_at: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n');
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, meta + String(content || ''), 'utf-8');
  return { ok: true, data: { uri, path: filePath, node: { uri, content } } };
}

function stripFrontmatter(text) {
  return String(text || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function readNote(uri) {
  const filePath = notePathForUri(uri);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return {
    uri,
    path: filePath,
    content: stripFrontmatter(raw),
  };
}

function walkFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, out);
    else if (!predicate || predicate(full)) out.push(full);
  }
  return out;
}

function searchNotes(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const root = path.join(getMemoryRoot(), 'notes', safeSegment(opts.domain || 'core'));
  const matches = [];
  for (const filePath of walkFiles(root, (p) => p.endsWith('.md'))) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const content = stripFrontmatter(raw);
    const rel = path.relative(root, filePath).replace(/\\/g, '/').replace(/\.md$/, '');
    const uri = `${opts.domain || 'core'}://${rel}`;
    const haystack = `${uri}\n${content}`.toLowerCase();
    if (!haystack.includes(q)) continue;
    matches.push({
      uri,
      domain: opts.domain || 'core',
      path: rel,
      content: content.slice(0, opts.maxContentChars || 1000),
      content_snippet: content.slice(0, 200),
      priority: 2,
      match_score: haystack.includes(q) ? 0.8 : 0.5,
    });
    if (matches.length >= (opts.limit || 10)) break;
  }
  return matches;
}

function searchTurns(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const matches = [];
  for (const date of listRawDates().slice(-30).reverse()) {
    for (const turn of readDayTurns(date).reverse()) {
      const haystack = `${turn.user || ''}\n${turn.assistant || ''}`.toLowerCase();
      if (!haystack.includes(q)) continue;
      matches.push({
        uri: turn.uri || `core://logs/raw/${date}/turn-${turn._index}`,
        domain: 'core',
        path: (turn.uri || '').replace(/^core:\/\//, ''),
        content: JSON.stringify(turn),
        content_snippet: `${String(turn.user || '').slice(0, 80)} -> ${String(turn.assistant || '').slice(0, 120)}`,
        priority: 1,
        match_score: 0.45,
      });
      if (matches.length >= (opts.limit || 5)) return matches;
    }
  }
  return matches;
}

function childFor(uri, content = '') {
  const parts = splitUri(uri);
  return {
    uri,
    path: parts?.path || '',
    content_snippet: String(content || '').slice(0, 200),
  };
}

function readMemory(uri) {
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效 URI: ${uri}` };
  const p = parts.path;

  if (p === 'logs/raw') {
    const children = listRawDates().map((date) => childFor(`core://logs/raw/${date}`));
    return { ok: true, data: { node: { uri, content: '', children }, children } };
  }
  const dayMatch = p.match(/^logs\/raw\/(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch) {
    const children = readDayTurns(dayMatch[1]).map((turn, index) =>
      childFor(turn.uri || `core://logs/raw/${dayMatch[1]}/turn-${index + 1}`, JSON.stringify(turn))
    );
    return { ok: true, data: { node: { uri, content: '', children }, children } };
  }
  const rawTurnMatch = p.match(/^logs\/raw\/(\d{4}-\d{2}-\d{2})\/(.+)$/);
  if (rawTurnMatch) {
    const turns = readDayTurns(rawTurnMatch[1]);
    const turn = turns.find((item) => item.uri === uri || String(item.uri || '').endsWith(`/${rawTurnMatch[2]}`));
    if (!turn) return { ok: false, error: 'HTTP 404: not found' };
    return { ok: true, data: { node: { uri, content: JSON.stringify(turn) }, content: JSON.stringify(turn) } };
  }
  const summaryMatch = p.match(/^logs\/summary\/(daily|weekly|monthly)\/(.+)$/);
  if (summaryMatch) {
    const data = readSummary(summaryMatch[1], summaryMatch[2]);
    if (!data) return { ok: false, error: 'HTTP 404: not found' };
    const content = JSON.stringify(data);
    return { ok: true, data: { node: { uri, content }, content } };
  }
  const pendingMatch = p.match(/^logs\/summary\/_pending\/(daily|weekly|monthly)$/);
  if (pendingMatch) {
    const children = listPending(pendingMatch[1]).map((item) =>
      childFor(`core://logs/summary/_pending/${pendingMatch[1]}/${item.key}`, JSON.stringify(item.data))
    );
    return { ok: true, data: { node: { uri, content: '', children }, children } };
  }
  const pendingNodeMatch = p.match(/^logs\/summary\/_pending\/(daily|weekly|monthly)\/(.+)$/);
  if (pendingNodeMatch) {
    const data = readJsonFile(pendingPath(pendingNodeMatch[1], pendingNodeMatch[2]), null);
    if (!data) return { ok: false, error: 'HTTP 404: not found' };
    const content = data.cleared ? '[CLEARED]' : JSON.stringify(data);
    return { ok: true, data: { node: { uri, content }, content } };
  }

  const note = readNote(uri);
  if (!note) return { ok: false, error: 'HTTP 404: not found' };
  return { ok: true, data: { node: { uri, content: note.content, children: [] }, content: note.content, children: [] } };
}

function searchMemory(query, domain = 'core', opts = {}) {
  const notes = searchNotes(query, { ...opts, domain, limit: opts.limit || 10 });
  const remaining = Math.max(0, (opts.limit || 10) - notes.length);
  const turns = remaining > 0 ? searchTurns(query, { limit: remaining }) : [];
  return { ok: true, data: [...notes, ...turns] };
}

function loadBootMemory(coreUris) {
  if (!coreUris || coreUris.length === 0) return '';
  const blocks = [];
  for (const uri of coreUris) {
    const result = readMemory(uri);
    if (!result.ok) continue;
    const content = result.data?.node?.content || result.data?.content || '';
    if (content && content !== '[DELETED]') {
      blocks.push(`[${uri}]\n${String(content).slice(0, 500)}`);
    }
  }
  return blocks.join('\n\n---\n\n');
}

module.exports = {
  getMemoryRoot,
  appendRawTurn,
  dedupeExists,
  markDedupe,
  listRawDates,
  readDayTurns,
  listRecentTurns,
  readSummary,
  writeSummary,
  markPending,
  clearPending,
  listPending,
  writeNote,
  readNote,
  searchNotes,
  searchTurns,
  readMemory,
  searchMemory,
  loadBootMemory,
};
