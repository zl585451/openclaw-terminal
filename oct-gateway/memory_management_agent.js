const reviewQueueMaintenance = require('./review_queue_maintenance');
const { createLogger } = require('./logger');

const log = createLogger('memory_management_agent');

function bumpCounter(map, key) {
  const nextKey = key || 'unknown';
  map[nextKey] = (map[nextKey] || 0) + 1;
}

function buildSuggestions(summary) {
  const suggestions = [];
  if (summary.pending > 20) {
    suggestions.push('review_queue_backlog_high');
  }
  if (summary.expired > 0) {
    suggestions.push('expired_candidates_ready_for_cleanup');
  }
  if ((summary.bySource.history_summary || 0) > 8) {
    suggestions.push('history_summary_candidates_should_be_compacted');
  }
  if ((summary.byLayer.scratch || 0) > (summary.byLayer.core || 0) * 2 && summary.pending > 6) {
    suggestions.push('scratch_candidates_dominate_queue');
  }
  if ((summary.bySource.feedback || 0) > 0 && (summary.bySource.clarification_preference || 0) > 0) {
    suggestions.push('feedback_and_preference_signals_present');
  }
  return suggestions;
}

async function inspectReviewQueue(options = {}) {
  const scan = await reviewQueueMaintenance.scanReviewCandidates(options);
  const summary = {
    scannedLeafs: scan.scannedLeafs,
    candidateCount: scan.candidateCount,
    pending: 0,
    expired: 0,
    approved: 0,
    rejected: 0,
    bySource: {},
    byLayer: {},
    topPending: [],
  };

  for (const item of scan.candidates) {
    const candidate = item.candidate || {};
    const status = candidate.review_status || 'unknown';
    const source = candidate.source || 'unknown';
    const layer = candidate.suggested_layer || 'unknown';

    bumpCounter(summary.bySource, source);
    bumpCounter(summary.byLayer, layer);

    if (status === 'pending') summary.pending += 1;
    else if (status === 'expired') summary.expired += 1;
    else if (status === 'approved') summary.approved += 1;
    else if (status === 'rejected') summary.rejected += 1;

    if (status === 'pending') {
      summary.topPending.push({
        uri: item.uri,
        source,
        layer,
        score: candidate.governor_score ?? 0,
        created_at: candidate.created_at || null,
        expires_at: candidate.expires_at || null,
        cleanup_hint: candidate.cleanup_hint || null,
      });
    }
  }

  summary.topPending.sort((a, b) => {
    const scoreGap = (b.score || 0) - (a.score || 0);
    if (scoreGap !== 0) return scoreGap;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  summary.topPending = summary.topPending.slice(0, options.topN || 5);
  summary.suggestions = buildSuggestions(summary);

  return {
    nowIso: scan.nowIso,
    summary,
  };
}

async function runMemoryGovernancePass(options = {}) {
  const report = await inspectReviewQueue(options);
  log.info('memory governance report', {
    pending: report.summary.pending,
    expired: report.summary.expired,
    approved: report.summary.approved,
    rejected: report.summary.rejected,
    bySource: report.summary.bySource,
    byLayer: report.summary.byLayer,
    suggestions: report.summary.suggestions,
    topPending: report.summary.topPending,
  });
  return report;
}

module.exports = {
  inspectReviewQueue,
  runMemoryGovernancePass,
};
