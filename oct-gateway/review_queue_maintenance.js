const memory = require('./memory');
const { createLogger } = require('./logger');

const log = createLogger('review_queue_maintenance');

const REVIEW_ROOT_URI = 'core://agent/review_queue';

function getNodeAndChildren(data) {
  const node = data?.node || data || null;
  const children = node?.children || data?.children || [];
  return { node, children: Array.isArray(children) ? children : [] };
}

function childUriFromEntry(entry, parentUri) {
  if (!entry) return null;
  if (entry.uri) return entry.uri;
  const parent = String(parentUri || '');
  const parentParts = parent.match(/^([^:]+):\/\/(.+)$/);
  if (!parentParts) return null;
  const domain = parentParts[1];
  const childPath = entry.path || '';
  if (!childPath) return null;
  return `${domain}://${childPath}`;
}

async function collectLeafUris(uri, bucket, visited = new Set()) {
  if (!uri || visited.has(uri)) return;
  visited.add(uri);

  const res = await memory.readMemory(uri, { treat404AsDebug: true });
  if (!res.ok || !res.data) return;

  const { node, children } = getNodeAndChildren(res.data);
  if (!children.length) {
    bucket.push({
      uri,
      content: node?.content || '',
      priority: node?.priority,
      disclosure: node?.disclosure || '',
    });
    return;
  }

  for (const child of children) {
    const childUri = childUriFromEntry(child, uri);
    if (!childUri) continue;
    await collectLeafUris(childUri, bucket, visited);
  }
}

function tryParseCandidate(content) {
  try {
    const parsed = JSON.parse(String(content || ''));
    if (parsed && parsed.kind === 'memory_review_candidate') return parsed;
  } catch {}
  return null;
}

function shouldExpireCandidate(candidate, nowIso) {
  if (!candidate) return false;
  if (candidate.review_status !== 'pending') return false;
  if (!candidate.expires_at) return false;
  return new Date(candidate.expires_at).getTime() <= new Date(nowIso).getTime();
}

function buildExpiredCandidate(candidate, nowIso) {
  return {
    ...candidate,
    review_status: 'expired',
    expired_at: nowIso,
    cleanup_result: 'auto_expired',
  };
}

async function expireStaleReviewCandidates(options = {}) {
  const dryRun = options.dryRun !== false ? true : false;
  const nowIso = options.nowIso || new Date().toISOString();
  const leafs = [];
  await collectLeafUris(REVIEW_ROOT_URI, leafs);

  const report = {
    scanned: leafs.length,
    expired: 0,
    updated: [],
    failed: [],
    dryRun,
  };

  for (const item of leafs) {
    const candidate = tryParseCandidate(item.content);
    if (!candidate) continue;
    if (!shouldExpireCandidate(candidate, nowIso)) continue;

    report.expired += 1;

    if (dryRun) {
      report.updated.push({ uri: item.uri, action: 'would_expire' });
      continue;
    }

    const next = buildExpiredCandidate(candidate, nowIso);
    const writeResult = await memory.writeMemory(
      item.uri,
      JSON.stringify(next, null, 2),
      item.priority ?? 1,
      item.disclosure || 'Governor review candidate'
    );

    if (writeResult.ok) {
      report.updated.push({ uri: item.uri, action: 'expired' });
    } else {
      report.failed.push({ uri: item.uri, error: writeResult.error || 'write_failed' });
    }
  }

  log.info('expireStaleReviewCandidates', {
    scanned: report.scanned,
    expired: report.expired,
    updated: report.updated.length,
    failed: report.failed.length,
    dryRun: report.dryRun,
  });

  return report;
}

module.exports = {
  expireStaleReviewCandidates,
};
