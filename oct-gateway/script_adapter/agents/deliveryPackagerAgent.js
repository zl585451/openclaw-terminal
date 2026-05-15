'use strict';

/**
 * 交付打包员 - 纯 JS 拼接,不调 LLM。
 *
 * 输入:ctx.artifacts(adapted_script + voice_registry + review_report/basic_qc_report)
 * 输出:统一交付 JSON payload,包含台本、角色音表、基础质检报告和 manifest。
 */
async function runDeliveryPackagerAgent(ctx) {
  const startedAt = Date.now();
  const adaptedScript = pickArtifact(ctx?.artifacts, 'adapted_script');
  const voiceRegistry = pickArtifact(ctx?.artifacts, 'voice_registry');
  const performance = pickArtifact(ctx?.artifacts, 'performance_design');
  const review = pickArtifact(ctx?.artifacts, 'basic_qc_report') || pickArtifact(ctx?.artifacts, 'review_report');
  if (!adaptedScript) throw new Error('PACKAGER_NO_ADAPTED_SCRIPT');

  const adaptedPayload = adaptedScript?.payload || {};
  const voicePayload = voiceRegistry?.payload || { registry: [], unresolved: [] };
  const reviewPayload = review?.payload || { conclusion: 'pass', issues: [] };
  if (String(reviewPayload?.conclusion || '').trim().toLowerCase() === 'reject') {
    const p0Count = (Array.isArray(reviewPayload?.issues) ? reviewPayload.issues : [])
      .filter((issue) => issue?.severity === 'P0').length;
    throw new Error(`PACKAGER_REJECTED_BY_QC: 质检结论为 reject，P0=${p0Count}，拒绝生成交付包。`);
  }
  const chapterTitle = String(adaptedPayload?.chapterTitle || '未命名章节');
  const segmentCount = (adaptedPayload?.segments || []).length;
  const totalChars = Number(adaptedPayload?.totalCharCount || 0);
  const roleCount = (voicePayload?.registry || []).length;
  const sfxCount = (performance?.payload?.sfxList || []).length;
  const cvCount = (performance?.payload?.cvDirections || []).length;
  const issueCount = (reviewPayload?.issues || []).length;
  const conclusion = reviewPayload?.conclusion || 'pass';
  const safeChapter = chapterTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30) || '未命名章节';

  const manifest = [
    { name: `${safeChapter}_多人演播样章.json`, type: '台本', size: estimateSize(adaptedPayload) },
    { name: `${safeChapter}_角色音标注表.json`, type: '角色音', size: estimateSize(voicePayload) },
    { name: `${safeChapter}_基础质检报告.json`, type: '质检', size: estimateSize(reviewPayload) },
    { name: 'delivery_manifest.json', type: '清单', size: '0.5 KB' },
  ];
  if (performance?.payload) {
    manifest.splice(2, 0, { name: `${safeChapter}_演播设计稿.json`, type: '演播设计', size: estimateSize(performance.payload) });
  }

  const versionTag = `audiobook-mvp-${formatLocalDate(new Date())}-v1`;
  const conclusionLabel = {
    pass: '可直接交付',
    pass_with_changes: '带条件交付',
    reject: '需返工',
  }[conclusion] || '已生成';
  const notes = [
    `${chapterTitle}:${segmentCount} 段、${totalChars} 字、${roleCount} 个角色音、${sfxCount} 条音效、${cvCount} 条 CV 指导。`,
    `质检结论:${conclusionLabel}(${issueCount} 条问题记录)。`,
    issueCount > 0 ? '请优先处理 P0/P1 问题再进入录制。' : '无重大问题,可以交给制作团队。',
  ].join(' ');

  return {
    payload: {
      versionTag,
      manifest,
      notes,
      adapted_script: adaptedPayload,
      voice_markers: voicePayload,
      voice_registry: voicePayload,
      basic_qc_report: reviewPayload,
      review_report: reviewPayload,
      ...(performance?.payload ? { performance_design: performance.payload } : {}),
    },
    latencyMs: Date.now() - startedAt,
    model: 'js-packager',
  };
}

function estimateSize(jsonObj) {
  if (jsonObj == null) return '0 B';
  if (Array.isArray(jsonObj) && jsonObj.length === 0) return '0 B';
  if (typeof jsonObj === 'object' && !Array.isArray(jsonObj) && Object.keys(jsonObj).length === 0) return '0 B';
  const bytes = Buffer.byteLength(JSON.stringify(jsonObj), 'utf8');
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function pickArtifact(artifacts = {}, type) {
  return Object.values(artifacts).find((a) => a?.artifactType === type) || null;
}

module.exports = {
  runDeliveryPackagerAgent,
  estimateSize,
  formatLocalDate,
  pickArtifact,
};
