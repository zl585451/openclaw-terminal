const memory = require('./memory/memory');
const reviewQueueMaintenance = require('./review_queue_maintenance');
const { createLogger } = require('./logger');

const log = createLogger('review_queue_actions');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'candidate';
}

function buildArchiveUri(candidate = {}, now = new Date()) {
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  const originalUri = String(candidate.original_uri || '');
  return `core://agent/review_archive/${yyyy}-${mm}-${dd}/${hh}${mi}${ss}_${slugify(originalUri)}`;
}

async function readReviewCandidate(uri) {
  const res = await memory.readMemory(uri, { treat404AsDebug: true });
  if (!res.ok || !res.data) {
    return { ok: false, error: res.error || 'read_failed' };
  }

  const node = res.data?.node || res.data || null;
  let candidate = null;
  try {
    candidate = JSON.parse(String(node?.content || ''));
  } catch {
    return { ok: false, error: 'invalid_candidate_json' };
  }

  if (!candidate || candidate.kind !== 'memory_review_candidate') {
    return { ok: false, error: 'not_review_candidate' };
  }

  return {
    ok: true,
    uri,
    node,
    candidate,
    priority: node?.priority ?? 1,
    disclosure: node?.disclosure || 'Governor review candidate',
  };
}

async function writeCandidate(uri, candidate, meta = {}) {
  return memory.writeMemory(
    uri,
    JSON.stringify(candidate, null, 2),
    meta.priority ?? 1,
    meta.disclosure || 'Governor review candidate'
  );
}

function buildResolvedCandidate(candidate, status, patch = {}) {
  return {
    ...candidate,
    review_status: status,
    updated_at: new Date().toISOString(),
    ...patch,
  };
}

async function approveReviewCandidate(uri, options = {}) {
  const loaded = await readReviewCandidate(uri);
  if (!loaded.ok) return loaded;

  const { candidate, priority, disclosure } = loaded;
  if (!['pending', 'expired'].includes(candidate.review_status)) {
    return { ok: false, error: `candidate_not_approvable:${candidate.review_status}` };
  }

  const targetUri = options.targetUri || candidate.original_uri;
  const content = String(candidate.full_content || candidate.content_preview || '').trim();
  if (!targetUri || !content) {
    return { ok: false, error: 'missing_target_or_content' };
  }

  const wr = await memory.writeMemory(
    targetUri,
    content,
    Number(candidate.original_priority || priority || 2),
    candidate.disclosure || options.disclosure || 'Governor approved memory'
  );
  if (!wr.ok) {
    return { ok: false, error: wr.error || 'target_write_failed' };
  }

  const next = buildResolvedCandidate(candidate, 'approved', {
    approved_at: new Date().toISOString(),
    approved_target_uri: targetUri,
    resolved_by: options.resolvedBy || 'review_queue_actions',
    approval_note: options.note || null,
  });
  const save = await writeCandidate(uri, next, { priority, disclosure });
  if (!save.ok) return { ok: false, error: save.error || 'candidate_update_failed' };

  log.debug('approveReviewCandidate', { uri, targetUri });
  return { ok: true, uri, targetUri };
}

async function rejectReviewCandidate(uri, options = {}) {
  const loaded = await readReviewCandidate(uri);
  if (!loaded.ok) return loaded;

  const { candidate, priority, disclosure } = loaded;
  if (!['pending', 'expired'].includes(candidate.review_status)) {
    return { ok: false, error: `candidate_not_rejectable:${candidate.review_status}` };
  }

  const next = buildResolvedCandidate(candidate, 'rejected', {
    rejected_at: new Date().toISOString(),
    resolved_by: options.resolvedBy || 'review_queue_actions',
    rejection_reason: options.reason || 'manual_reject',
  });
  const save = await writeCandidate(uri, next, { priority, disclosure });
  if (!save.ok) return { ok: false, error: save.error || 'candidate_update_failed' };

  log.debug('rejectReviewCandidate', { uri, reason: options.reason || 'manual_reject' });
  return { ok: true, uri };
}

async function archiveReviewCandidate(uri, options = {}) {
  const loaded = await readReviewCandidate(uri);
  if (!loaded.ok) return loaded;

  const { candidate, priority, disclosure } = loaded;
  const archiveUri = options.archiveUri || buildArchiveUri(candidate);
  const archivePayload = {
    kind: 'memory_review_archive',
    archived_at: new Date().toISOString(),
    archived_from: uri,
    original_uri: candidate.original_uri || null,
    previous_status: candidate.review_status || null,
    resolved_by: options.resolvedBy || 'review_queue_actions',
    candidate,
  };

  const wr = await memory.writeMemory(
    archiveUri,
    JSON.stringify(archivePayload, null, 2),
    1,
    'Governor review archive'
  );
  if (!wr.ok) {
    return { ok: false, error: wr.error || 'archive_write_failed' };
  }

  const next = buildResolvedCandidate(candidate, 'archived', {
    archived_at: archivePayload.archived_at,
    archive_uri: archiveUri,
    resolved_by: options.resolvedBy || 'review_queue_actions',
    archive_reason: options.reason || 'archived_for_record',
  });
  const save = await writeCandidate(uri, next, { priority, disclosure });
  if (!save.ok) return { ok: false, error: save.error || 'candidate_update_failed' };

  log.debug('archiveReviewCandidate', { uri, archiveUri });
  return { ok: true, uri, archiveUri };
}

async function mergeReviewCandidate(uri, options = {}) {
  const loaded = await readReviewCandidate(uri);
  if (!loaded.ok) return loaded;

  const { candidate, priority, disclosure } = loaded;
  const canonicalUri = String(options.canonicalUri || '').trim();
  if (!canonicalUri) return { ok: false, error: 'missing_canonical_uri' };

  const current = await memory.readMemory(canonicalUri, { treat404AsDebug: true });
  if (!current.ok || !current.data) {
    return { ok: false, error: current.error || 'canonical_read_failed' };
  }

  const node = current.data?.node || current.data || {};
  const currentContent = String(node?.content || '');
  const snippet = String(candidate.full_content || candidate.content_preview || '').trim();
  if (!snippet) return { ok: false, error: 'missing_candidate_content' };

  const mergedContent = currentContent.includes(snippet)
    ? currentContent
    : `${currentContent.trim()}\n\n[merged candidate]\n${snippet}`.trim();

  const wr = await memory.writeMemory(
    canonicalUri,
    mergedContent,
    Number(node?.priority || candidate.original_priority || 2),
    node?.disclosure || candidate.disclosure || 'Merged memory candidate'
  );
  if (!wr.ok) {
    return { ok: false, error: wr.error || 'canonical_write_failed' };
  }

  const next = buildResolvedCandidate(candidate, 'merged', {
    merged_at: new Date().toISOString(),
    canonical_uri: canonicalUri,
    resolved_by: options.resolvedBy || 'review_queue_actions',
    merge_note: options.note || null,
  });
  const save = await writeCandidate(uri, next, { priority, disclosure });
  if (!save.ok) return { ok: false, error: save.error || 'candidate_update_failed' };

  log.debug('mergeReviewCandidate', { uri, canonicalUri });
  return { ok: true, uri, canonicalUri };
}

async function archiveResolvedReviewCandidates(options = {}) {
  const statuses = new Set(options.statuses || ['auto_dropped', 'deduped', 'expired', 'approved', 'rejected', 'merged']);
  const olderThanHours = Number(options.olderThanHours || 48);
  const dryRun = options.dryRun === true;
  const scan = await reviewQueueMaintenance.scanReviewCandidates(options);
  const now = new Date(scan.nowIso);
  const report = {
    scanned: scan.candidateCount,
    matched: 0,
    archived: 0,
    updated: [],
    failed: [],
    dryRun,
  };

  for (const item of scan.candidates) {
    const candidate = item.candidate || {};
    const status = String(candidate.review_status || '');
    if (!statuses.has(status)) continue;
    if (status === 'archived') continue;

    const refTs = parseDate(candidate.updated_at || candidate.rejected_at || candidate.approved_at || candidate.expired_at || candidate.merged_at);
    if (!refTs) continue;
    const ageHours = (now.getTime() - refTs) / (60 * 60 * 1000);
    if (ageHours < olderThanHours) continue;

    report.matched += 1;
    if (dryRun) {
      report.updated.push({ uri: item.uri, action: 'would_archive', status });
      continue;
    }

    const ar = await archiveReviewCandidate(item.uri, {
      resolvedBy: 'review_queue_actions:auto_archive',
      reason: `resolved_${status}_older_than_${olderThanHours}h`,
    });
    if (ar.ok) {
      report.archived += 1;
      report.updated.push({ uri: item.uri, action: 'archived', status, archiveUri: ar.archiveUri });
    } else {
      report.failed.push({ uri: item.uri, action: 'archive', status, error: ar.error || 'archive_failed' });
    }
  }

  log.debug('archiveResolvedReviewCandidates', {
    scanned: report.scanned,
    matched: report.matched,
    archived: report.archived,
    failed: report.failed.length,
    dryRun,
  });

  return report;
}

function parseDate(value) {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
}

module.exports = {
  readReviewCandidate,
  approveReviewCandidate,
  rejectReviewCandidate,
  archiveReviewCandidate,
  mergeReviewCandidate,
  archiveResolvedReviewCandidates,
};
