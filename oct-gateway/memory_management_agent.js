const memory = require('./memory');
const reviewQueueMaintenance = require('./review_queue_maintenance');
const reviewQueueActions = require('./review_queue_actions');
const { createLogger } = require('./logger');

const log = createLogger('memory_management_agent');

function bumpCounter(map, key) {
  const nextKey = key || 'unknown';
  map[nextKey] = (map[nextKey] || 0) + 1;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildGovernanceReportUris(now = new Date()) {
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  const datePath = `${yyyy}-${mm}-${dd}`;
  return {
    latestUri: 'core://agent/governance/latest',
    reportUri: `core://agent/governance/reports/${datePath}/${hh}${mi}${ss}`,
  };
}

function parseIsoTs(value) {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
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

function inferImpactAreas(item = {}) {
  const areas = new Set();
  const source = String(item.source || '');
  const pathFamily = String(item.pathFamily || '');
  const layer = String(item.layer || '');

  if (source === 'history_summary' || pathFamily === 'core://my_user/history') {
    areas.add('历史摘要质量');
    areas.add('相关记忆注入');
  }
  if (source === 'clarification_preference' || pathFamily === 'core://my_user/preferences') {
    areas.add('偏好系统');
    areas.add('相关记忆注入');
  }
  if (source === 'feedback' || pathFamily === 'core://agent/feedback') {
    areas.add('反馈闭环');
    areas.add('长期规则修正');
  }
  if (pathFamily === 'core://amy/*') {
    areas.add('AMY 身份设定');
    areas.add('长期人格记忆');
  }
  if (pathFamily.startsWith('project://')) {
    areas.add('项目记忆');
    areas.add('项目上下文注入');
  }
  if (layer === 'scratch') {
    areas.add('候选层堆积');
    areas.add('垃圾记忆拦截');
  }
  if (item.type === 'expired') {
    areas.add('review_queue 清理');
  }
  if (item.type === 'backlog') {
    areas.add('记忆治理吞吐');
  }
  if (!areas.size) {
    areas.add('记忆治理规则');
  }

  return [...areas];
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

function buildPriorityQueue(summary) {
  const ranked = [...(summary.actionableAdvice || [])]
    .map((item) => {
      let weight = item.priority === 'high' ? 100 : item.priority === 'medium' ? 60 : 30;
      if (typeof item.count === 'number') weight += Math.min(item.count, 20);
      if (typeof item.ageHours === 'number') weight += Math.min(item.ageHours, 48);
      if (item.type === 'rule_tightening') weight += 15;
      if (item.type === 'expired') weight += 20;
      if (item.type === 'backlog') weight += 25;
      return {
        ...item,
        weight,
        impactAreas: inferImpactAreas(item),
      };
    })
    .sort((a, b) => b.weight - a.weight);

  return ranked.slice(0, 3).map((item, index) => ({
    rank: index + 1,
    priority: item.priority,
    action: item.action,
    reason: item.reason,
    source: item.source || null,
    pathFamily: item.pathFamily || null,
    layer: item.layer || null,
    count: item.count ?? null,
    ageHours: item.ageHours ?? null,
    impactAreas: item.impactAreas || [],
  }));
}

function buildPriorityDigest(summary) {
  const items = summary.priorityQueue || [];
  if (!items.length) {
    return ['priority queue -> no urgent governance actions'];
  }
  return items.map((item) => {
    const target = item.source || item.pathFamily || item.layer || 'system';
    const impact = (item.impactAreas || []).slice(0, 2).join(' / ');
    return `priority ${item.rank} -> ${item.action} @ ${target}${impact ? ` | impact: ${impact}` : ''}`;
  });
}

function buildDedupeKey(item = {}) {
  const candidate = item.candidate || {};
  const source = String(candidate.source || 'unknown');
  const originalUri = String(candidate.original_uri || '').toLowerCase();
  const preview = String(candidate.content_preview || '').trim().toLowerCase();
  if (originalUri) return `${source}::${originalUri}`;
  return `${source}::${preview}`;
}

function pickCanonicalCandidate(items = []) {
  return [...items].sort((a, b) => {
    const scoreGap = Number(b.candidate?.governor_score || 0) - Number(a.candidate?.governor_score || 0);
    if (scoreGap !== 0) return scoreGap;
    return parseIsoTs(a.candidate?.created_at) - parseIsoTs(b.candidate?.created_at);
  })[0] || null;
}

function shouldAutoDrop(item, nowIso) {
  const candidate = item.candidate || {};
  if (candidate.review_status !== 'pending') return false;

  const score = Number(candidate.governor_score || 0);
  const layer = String(candidate.suggested_layer || '');
  const cleanupHint = String(candidate.cleanup_hint || '');
  const source = String(candidate.source || '');
  const expiresAt = parseIsoTs(candidate.expires_at);
  const nowTs = parseIsoTs(nowIso);

  if (!expiresAt || !nowTs || expiresAt > nowTs) return false;
  if (layer === 'core' || layer === 'project') return false;
  if (score > 2) return false;

  return (
    cleanupHint === 'auto_drop_if_idle' ||
    cleanupHint === 'archive_if_not_reused' ||
    source === 'history_summary'
  );
}

function buildUpdatedCandidate(candidate, nextStatus, nowIso, extra = {}) {
  return {
    ...candidate,
    review_status: nextStatus,
    updated_at: nowIso,
    ...extra,
  };
}

async function writeCandidateUpdate(item, nextCandidate) {
  return memory.writeMemory(
    item.uri,
    JSON.stringify(nextCandidate, null, 2),
    item.priority ?? 1,
    item.disclosure || 'Governor review candidate'
  );
}

async function persistGovernanceSnapshot(report) {
  const now = new Date();
  const { latestUri, reportUri } = buildGovernanceReportUris(now);
  const snapshot = {
    kind: 'memory_governance_report',
    created_at: now.toISOString(),
    summary: report.summary,
    autonomousActions: report.autonomousActions,
  };
  const content = JSON.stringify(snapshot, null, 2);
  const disclosure = '内部治理记录（静默后台）';

  const writes = await Promise.all([
    memory.writeMemory(reportUri, content, 1, disclosure, { ensureParent: true }),
    memory.writeMemory(latestUri, content, 1, disclosure, { ensureParent: true }),
  ]);

  return {
    ok: writes.every((item) => item && item.ok),
    reportUri,
    latestUri,
    failed: writes.filter((item) => !item || !item.ok).map((item) => item?.error || 'write_failed'),
  };
}

async function runAutonomousGovernanceActions(options = {}) {
  const scan = await reviewQueueMaintenance.scanReviewCandidates(options);
  const nowIso = scan.nowIso;
  const report = {
    scanned: scan.candidateCount,
    autoDropped: 0,
    autoDeduped: 0,
    autoArchived: 0,
    failed: [],
    updated: [],
  };

  // 1) 自动清理：低风险、已过期、弱候选
  for (const item of scan.candidates) {
    if (!shouldAutoDrop(item, nowIso)) continue;
    const next = buildUpdatedCandidate(item.candidate, 'auto_dropped', nowIso, {
      cleanup_result: 'auto_dropped_weak_candidate',
      resolved_by: 'memory_management_agent',
    });
    const wr = await writeCandidateUpdate(item, next);
    if (wr.ok) {
      report.autoDropped += 1;
      report.updated.push({ uri: item.uri, action: 'auto_dropped' });
    } else {
      report.failed.push({ uri: item.uri, action: 'auto_dropped', error: wr.error || 'write_failed' });
    }
  }

  // 2) 自动去重：同源同路径/同摘要的 pending 候选，仅保留 canonical 一条
  const latestScan = await reviewQueueMaintenance.scanReviewCandidates(options);
  const groups = new Map();
  for (const item of latestScan.candidates) {
    if ((item.candidate?.review_status || '') !== 'pending') continue;
    const key = buildDedupeKey(item);
    if (!key || key.endsWith('::')) continue;
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }

  for (const items of groups.values()) {
    if (items.length < 2) continue;
    const canonical = pickCanonicalCandidate(items);
    for (const item of items) {
      if (item.uri === canonical?.uri) continue;
      const next = buildUpdatedCandidate(item.candidate, 'deduped', nowIso, {
        cleanup_result: 'auto_deduped',
        resolved_by: 'memory_management_agent',
        canonical_uri: canonical?.uri || null,
      });
      const wr = await writeCandidateUpdate(item, next);
      if (wr.ok) {
        report.autoDeduped += 1;
        report.updated.push({ uri: item.uri, action: 'deduped', canonicalUri: canonical?.uri || null });
      } else {
        report.failed.push({ uri: item.uri, action: 'deduped', error: wr.error || 'write_failed' });
      }
    }
  }

  // 3) 自动归档：已解决且老化的候选转入 review_archive，避免 review_queue 继续堆积
  const archiveReport = await reviewQueueActions.archiveResolvedReviewCandidates({
    dryRun: false,
    olderThanHours: Number(options.archiveResolvedOlderThanHours || 72),
    nowIso,
  });
  report.autoArchived += archiveReport.archived || 0;
  report.updated.push(...(archiveReport.updated || []).map((item) => ({
    ...item,
    action: item.action || 'archived',
  })));
  report.failed.push(...(archiveReport.failed || []));

  return report;
}

function buildPrioritySummary(summary) {
  return (summary.priorityQueue || []).map((item) => ({
    rank: item.rank,
    action: item.action,
    target: item.source || item.pathFamily || item.layer || 'system',
    impactAreas: item.impactAreas || [],
    why: item.reason,
  }));
}

function inferRecommendedChange(item = {}) {
  switch (item.action) {
    case 'compact_review_queue':
      return '收紧 hold 条件，降低低价值候选进入 review_queue 的概率，并优先处理积压最多的来源';
    case 'review_expired_candidates':
      return '确认 expired 候选是否继续软过期保留，或升级为定期归档/物理清理策略';
    case 'tighten_history_summary_write_rule':
      return '提高 history_summary 进入长期层或 review_queue 的门槛，更多历史摘要仅保留在 archive 语义下';
    case 'require_repeated_preference_confirmation':
      return '偏好类记忆需要重复出现或明确“记住”信号后再晋升长期层';
    case 'dedupe_feedback_memory':
      return '合并相似反馈节点，避免同一风格修正被重复写入';
    case 'raise_preference_promotion_threshold':
      return '提高 core://my_user/preferences 的 promote 分数线，并加强 hold/confirm 逻辑';
    case 'protect_amy_identity_namespace':
      return '对 core://amy/* 增加更强确认规则，避免临时描述污染身份层';
    case 'compact_project_memory_candidates':
      return '为 project 记忆增加合并/归档规则，避免项目候选持续堆积';
    case 'strengthen_scratch_rejection':
      return '进一步拦截一次性、临时、调试型 scratch 记录，并缩短弱候选保留时间';
    case 'review_oldest_pending':
      return '优先人工检查 oldest pending，确认其应晋升、归档还是拒绝';
    case 'inspect_source_rule':
      return '回看该来源的写入条件，确认它是否过于宽松或缺少去重';
    case 'inspect_path_family':
      return '回看该路径家族的长期准入规则，确认是否应提高确认门槛';
    default:
      return '检查当前治理规则与注入策略，决定是否需要提高准入门槛或增加归档规则';
  }
}

function inferExpectedImpact(item = {}) {
  const impacts = item.impactAreas || [];
  const primary = impacts[0] || '记忆治理';
  switch (item.action) {
    case 'compact_review_queue':
      return `降低 review_queue 积压，提升 ${primary} 的可控性`;
    case 'review_expired_candidates':
      return `减少过期候选噪音，稳定 ${primary}`;
    case 'tighten_history_summary_write_rule':
      return '减少历史摘要污染上下文，提高相关记忆注入质量';
    case 'require_repeated_preference_confirmation':
    case 'raise_preference_promotion_threshold':
      return '减少错误偏好长期化，提高偏好系统稳定性';
    case 'dedupe_feedback_memory':
      return '减少重复反馈节点，提高反馈闭环信噪比';
    case 'protect_amy_identity_namespace':
      return '降低身份层被临时内容污染的风险';
    case 'compact_project_memory_candidates':
      return '减少项目记忆堆积，让项目上下文更干净';
    case 'strengthen_scratch_rejection':
      return '减少垃圾候选进入治理链，整体 backlog 会下降';
    case 'review_oldest_pending':
      return '降低长时间悬而未决的候选，避免 review_queue 失控';
    default:
      return `提升 ${primary} 的稳定性与治理可见性`;
  }
}

function buildGovernanceTasks(summary) {
  return (summary.priorityQueue || []).map((item) => ({
    task_type: 'memory_governance_action',
    task_status: 'recommended',
    rank: item.rank,
    target_rule: item.action,
    target_scope: item.source || item.pathFamily || item.layer || 'system',
    recommended_change: inferRecommendedChange(item),
    expected_impact: inferExpectedImpact(item),
    impact_areas: item.impactAreas || [],
    why: item.reason,
  }));
}

function buildHealthSummary(summary, autonomy = {}) {
  const watchList = [];
  const recentActions = [];
  let level = 'healthy';
  let reason = 'queue_under_control';

  if ((summary.pending || 0) >= 16) {
    level = 'warning';
    reason = 'pending_backlog_high';
    watchList.push(`pending backlog=${summary.pending}`);
  }

  if ((summary.expired || 0) >= 8) {
    if (level === 'healthy') {
      level = 'warning';
      reason = 'expired_backlog_high';
    }
    watchList.push(`expired backlog=${summary.expired}`);
  }

  if ((autonomy.failed || []).length > 0) {
    level = 'attention';
    reason = 'autonomous_actions_failed';
    watchList.push(`autonomy failures=${autonomy.failed.length}`);
  }

  if ((summary.oldestPending?.ageHours || 0) >= 72) {
    if (level === 'healthy') {
      level = 'warning';
      reason = 'oldest_pending_stale';
    }
    watchList.push(`oldest pending=${summary.oldestPending.ageHours}h`);
  }

  if ((summary.hotSources || []).length > 0) {
    const topSource = summary.hotSources[0];
    if (topSource?.count >= 8) {
      watchList.push(`hot source=${topSource.source}:${topSource.count}`);
    }
  }

  if ((summary.hotPathFamilies || []).length > 0) {
    const topFamily = summary.hotPathFamilies[0];
    if (topFamily?.count >= 5) {
      watchList.push(`hot path=${topFamily.pathFamily}:${topFamily.count}`);
    }
  }

  if ((autonomy.autoDropped || 0) > 0) {
    recentActions.push(`auto_dropped=${autonomy.autoDropped}`);
  }
  if ((autonomy.autoDeduped || 0) > 0) {
    recentActions.push(`auto_deduped=${autonomy.autoDeduped}`);
  }
  if ((autonomy.autoArchived || 0) > 0) {
    recentActions.push(`auto_archived=${autonomy.autoArchived}`);
  }

  const recommendedFocus = (summary.priorityQueue || []).slice(0, 2).map((item) => ({
    action: item.action,
    target: item.source || item.pathFamily || item.layer || 'system',
    why: item.reason,
  }));

  return {
    level,
    reason,
    watchList,
    recentActions,
    recommendedFocus,
  };
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
  summary.priorityQueue = buildPriorityQueue(summary);
  summary.prioritySummary = buildPrioritySummary(summary);
  summary.governanceTasks = buildGovernanceTasks(summary);
  summary.digest = buildGovernanceDigest(summary);
  summary.priorityDigest = buildPriorityDigest(summary);

  return {
    nowIso: scan.nowIso,
    summary,
  };
}

async function runMemoryGovernancePass(options = {}) {
  const autonomy = await runAutonomousGovernanceActions(options);
  const report = await inspectReviewQueue(options);
  report.summary.health = buildHealthSummary(report.summary, autonomy);
  for (const line of report.summary.digest || []) {
    log.debug(`memory governance digest: ${line}`);
  }
  for (const line of report.summary.priorityDigest || []) {
    log.debug(`memory governance priority: ${line}`);
  }
  for (const task of report.summary.governanceTasks || []) {
    log.debug('memory governance task', task);
  }
  log.info('memory governance health', report.summary.health);
  const snapshot = await persistGovernanceSnapshot({ ...report, autonomousActions: autonomy });
  log.debug('memory governance snapshot', snapshot);
  log.debug('memory governance autonomous actions', autonomy);
  log.debug('memory governance report', {
    pending: report.summary.pending,
    expired: report.summary.expired,
    approved: report.summary.approved,
    rejected: report.summary.rejected,
    bySource: report.summary.bySource,
    byLayer: report.summary.byLayer,
    suggestions: report.summary.suggestions,
    actionableAdvice: report.summary.actionableAdvice,
    priorityQueue: report.summary.priorityQueue,
    prioritySummary: report.summary.prioritySummary,
    governanceTasks: report.summary.governanceTasks,
    hotSources: report.summary.hotSources,
    hotPathFamilies: report.summary.hotPathFamilies,
    oldestPending: report.summary.oldestPending,
    topPending: report.summary.topPending,
    autonomousActions: autonomy,
    snapshot,
  });
  return { ...report, autonomousActions: autonomy, snapshot };
}

module.exports = {
  inspectReviewQueue,
  runAutonomousGovernanceActions,
  runMemoryGovernancePass,
};
