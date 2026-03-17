const { NOCTURNE_BASE_URL } = require('./config');

async function nocturneRequest(method, apiPath, params, body) {
  try {
    const url = new URL(NOCTURNE_BASE_URL + apiPath);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    }
    const res = await fetch(url.toString(), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function splitUri(uri) {
  const m = uri.match(/^([^:]+):\/\/(.+)$/);
  if (!m) return null;
  return { domain: m[1], path: m[2] };
}

async function readMemory(uri) {
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效URI: ${uri}` };
  return nocturneRequest('GET', '/browse/node', { path: parts.path, domain: parts.domain });
}

async function writeMemory(uri, content, priority = 2, disclosure = '') {
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效URI: ${uri}` };
  return nocturneRequest('PUT', '/browse/node',
    { path: parts.path, domain: parts.domain },
    { content, priority, disclosure }
  );
}

/** 创建新节点（父路径须已存在），用于 history 等新 path */
async function createMemory(uri, content, priority = 2, disclosure = '') {
  const parts = splitUri(uri);
  if (!parts) return { ok: false, error: `无效URI: ${uri}` };
  return nocturneRequest('POST', '/browse/node',
    { path: parts.path, domain: parts.domain },
    { content, priority, disclosure }
  );
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
  return { ok: true, data: matches };
}

async function loadBootMemory(coreUris) {
  if (!coreUris || coreUris.length === 0) return '';
  const results = [];
  for (const uri of coreUris) {
    try {
      const r = await readMemory(uri);
      console.log('[Memory] 读取', uri, '结果:', r.ok,
        r.ok ? (r.data?.node?.content || '').slice(0, 50) : r.error);
      if (r.ok && r.data) {
        const node = r.data?.node || r.data;
        const priority = node?.priority;
        if (priority !== undefined && priority === 2) continue;
        const content =
          r.data?.node?.content ||
          r.data?.content ||
          (typeof r.data === 'string' ? r.data : '');
        if (content && content !== '[DELETED]') {
          const trimmed =
            content.length > 500 ? content.slice(0, 500) + '...' : content;
          results.push(`[${uri}]\n${trimmed}`);
        }
      }
    } catch (e) {
      console.error('[Memory] 读取失败', uri, e.message);
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

module.exports = { readMemory, writeMemory, createMemory, searchMemory, loadBootMemory, isAlive };
