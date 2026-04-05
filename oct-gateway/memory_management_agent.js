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

function normalizePathFamily(uri = '') {
  const raw = String(uri || '');
  if (!raw) return 'unknown';
  const lowered = raw.toLowerCase();
  if (lowered.startsWith('core://my_user/preferences')) return 'core://my_user/preferences';
  if (lowered.startsWith('core://my_user/profile')) return 'core://my_user/profile';
  if (lowered.startsWith('core://my_user/history')) return 'core://my_user/history';
  if (lowered.startsWith('core://agent/review_queue')) return 'core://agent/review_queue';
  if (lowered.startsWith('core://agent/feedback')) return 'core://agent/feedback';
  if (lowered.startsWith('core://agent/')) return 'core://agent/*';
  if (lowered.startsWith('core://amy/')) return 'core://amy/*';
  if (lowered.startsWith('project://')) {
    const parts = raw.split('/').slice(0, 3).join('/');
    return parts || 'project://*';
  }
  if (lowered.startsWith('core://')) {
    const parts = raw.split('/').slice(0, 3).join('/');
    return parts || 'core://*';
  }
  return raw.split('/').slice(0, 3).join('/') || 'unknown';
}

function buildActionableAdvice(summary) {
  const advice = [];

  if (summary.pending >= 10) {
    advice.push({
      priority: 'high',
      type: 'backlog',
      action: 'compact_review_queue',
      reason: `pending backlog is ${summary.pending}`,
    });
  }

  if (summary.expired > 0) {
    advice.push({
      priority: 'high',
      type: 'expired',
      action: 'review_expired_candidates',
      reason: `${summary.expired} expired candidates are waiting for cleanup review`,
    });
  }

  for (const source of summary.hotSources) {
    advice.push({
      priority: source.count >= 6 ? 'high' : 'medium',
      type: 'source_hotspot',
      action: 'inspect_source_rule',
      source: source.source,
      count: source.count,
      reason: `${source.source} produced ${source.count} pending candidates`,
    });

    if (source.source === 'history_summary' && source.count >= 6) {
      advice.push({
        priority: 'high',
        type: 'rule_tightening',
        action: 'tighten_history_summary_write_rule',
        source: source.source,
        count: source.count,
        reason: 'history summaries are entering review too often; archive routing or hold threshold should be stricter',
      });
    }

    if (source.source === 'clarification_preference' && source.count >= 4) {
      advice.push({
        priority: 'medium',
        type: 'rule_tightening',
        action: 'require_repeated_preference_confirmation',
        source: source.source,
        count: source.count,
        reason: 'clarification preferences are accumulating; long-term preference promotion may be too easy',
      });
    }

    if (source.source === 'feedback' && source.count >= 4) {
      advice.push({
        priority: 'medium',
        type: 'rule_tightening',
        action: 'dedupe_feedback_memory',
        source: source.source,
        count: source.count,
        reason: 'feedback-derived candidates are accumulating; merge or dedupe rules may be needed',
      });
    }
  }

  for (const family of summary.hotPathFamilies) {
    advice.push({
      priority: family.count >= 4 ? 'high' : 'medium',
      type: 'path_hotspot',
      action: 'inspect_path_family',
      pathFamily: family.pathFamily,
      count: family.count,
      reason: `${family.pathFamily} accumulated ${family.count} pending candidates`,
    });

    if (family.pathFamily === 'core://my_user/preferences' && family.count >= 4) {
      advice.push({
        priority: 'high',
        type: 'rule_tightening',
        action: 'raise_preference_promotion_threshold',
        pathFamily: family.pathFamily,
        count: family.count,
        reason: 'user preference namespace is filling with pending items; promotion threshold should be raised',
      });
    }

    if (family.pathFamily === 'core://amy/*' && family.count >= 3) {
      advice.push({
        priority: 'medium',
        type: 'rule_tightening',
        action: 'protect_amy_identity_namespace',
        pathFamily: family.pathFamily,
        count: family.count,
        reason: 'amy identity-related paths are receiving too many candidates; require stronger confirmation',
      });
    }

    if (String(family.pathFamily || '').startsWith('project://') && family.count >= 5) {
      advice.push({
        priority: 'medium',
        type: 'rule_tightening',
        action: 'compact_project_memory_candidates',
        pathFamily: family.pathFamily,
        count: family.count,
        reason: 'project memory candidates are stacking up; project-level merge or archive rules may need tightening',
      });
    }
  }

  if (summary.oldestPending && summary.oldestPending.ageHours >= 24) {
    advice.push({
      priority: 'medium',
      type: 'stale_pending',
      action: 'review_oldest_pending',
      uri: summary.oldestPending.uri,
      ageHours: summary.oldestPending.ageHours,
      reason: `oldest pending candidate has waited ${summary.oldestPending.ageHours} hours`,
    });
  }

  if ((summary.byLayer.scratch || 0) >= 8) {
    advice.push({
      priority: 'high',
      type: 'rule_tightening',
      action: 'strengthen_scratch_rejection',
      layer: 'scratch',
      count: summary.byLayer.scratch,
      reason: `scratch candidates reached ${summary.byLayer.scratch}; reject or shorter retention should be considered`,
    });
  }

  return advice.slice(0, 8);
}

function buildGovernanceDigest(summary) {
  const lines = [];

  const headlineParts = [
    `pending=${summary.pending}`,
    `expired=${summary.expired}`,
    `approved=${summary.approved}`,
    `rejected=${summary.rejected}`,
  ];
  lines.push(`review_queue ${headlineParts.join(' | ')}`);

  if (summary.hotSources.length) {
    const topSources = summary.hotSources
      .map((item) => `${item.source}:${item.count}`)
      .join(', ');
    lines.push(`hot sources -> ${topSources}`);
  }

  if (summary.hotPathFamilies.length) {
    const topFamilies = summary.hotPathFamilies
      .map((item) => `${item.pathFamily}:${item.count}`)
      .join(', ');
    lines.push(`hot paths -> ${topFamilies}`);
  }

  if (summary.oldestPending) {
    lines.push(
      `oldest pending -> ${summary.oldestPending.pathFamily || summary.oldestPending.uri} (${summary.oldestPending.ageHours}h)`
    );
  }

  if (summary.actionableAdvice.length) {
    const advice = summary.actionableAdvice
      .map((item) => `${item.action}${item.source ? `:${item.source}` : ''}${item.pathFamily ? `:${item.pathFamily}` : ''}`)
      .join(', ');
    lines.push(`actions -> ${advice}`);
  } else {
    lines.push('actions -> queue healthy, no immediate intervention suggested');
  }

  return lines;
}

async function inspectReviewQueue(options = {}) {
  const scan = await reviewQueueMaintenance.scanReviewCandidates(options);
  const nowTs = new Date(scan.nowIso).getTime();
  const summary = {
    scannedLeafs: scan.scannedLeafs,
    candidateCount: scan.candidateCount,
    pending: 0,
    expired: 0,
    approved: 0,
    rejected: 0,
    bySource: {},
    byLayer: {},
    byPathFamily: {},
    topPending: [],
    hotSources: [],
    hotPathFamilies: [],
    oldestPending: null,
  };

  for (const item of scan.candidates) {
    const candidate = item.candidate || {};
    const status = candidate.review_status || 'unknown';
    const source = candidate.source || 'unknown';
    const layer = candidate.suggested_layer || 'unknown';
    const pathFamily = normalizePathFamily(candidate.original_uri || item.uri);

    bumpCounter(summary.bySource, source);
    bumpCounter(summary.byLayer, layer);
    bumpCounter(summary.byPathFamily, pathFamily);

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
        pathFamily,
      });

      const createdTs = candidate.created_at ? new Date(candidate.created_at).getTime() : 0;
      if (createdTs > 0) {
        const ageHours = Math.max(0, Math.round((nowTs - createdTs) / (60 * 60 * 1000)));
        if (!summary.oldestPending || createdTs < summary.oldestPending.createdTs) {
          summary.oldestPending = {
            uri: item.uri,
            source,
            layer,
            pathFamily,
            created_at: candidate.created_at || null,
            createdTs,
            ageHours,
          };
        }
      }
    }
  }

  summary.topPending.sort((a, b) => {
    const scoreGap = (b.score || 0) - (a.score || 0);
    if (scoreGap !== 0) return scoreGap;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  summary.topPending = summary.topPending.slice(0, options.topN || 5);
  summary.hotSources = Object.entries(summary.bySource)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  summary.hotPathFamilies = Object.entries(summary.byPathFamily)
    .map(([pathFamily, count]) => ({ pathFamily, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  if (summary.oldestPending) {
    delete summary.oldestPending.createdTs;
  }
  summary.suggestions = buildSuggestions(summary);
  summary.actionableAdvice = buildActionableAdvice(summary);
  summary.digest = buildGovernanceDigest(summary);

  return {
    nowIso: scan.nowIso,
    summary,
  };
}

async function runMemoryGovernancePass(options = {}) {
  const report = await inspectReviewQueue(options);
  for (const line of report.summary.digest || []) {
    log.info(`memory governance digest: ${line}`);
  }
  log.info('memory governance report', {
    pending: report.summary.pending,
    expired: report.summary.expired,
    approved: report.summary.approved,
    rejected: report.summary.rejected,
    bySource: report.summary.bySource,
    byLayer: report.summary.byLayer,
    suggestions: report.summary.suggestions,
    actionableAdvice: report.summary.actionableAdvice,
    hotSources: report.summary.hotSources,
    hotPathFamilies: report.summary.hotPathFamilies,
    oldestPending: report.summary.oldestPending,
    topPending: report.summary.topPending,
  });
  return report;
}

module.exports = {
  inspectReviewQueue,
  runMemoryGovernancePass,
};
