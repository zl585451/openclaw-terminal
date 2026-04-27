'use strict';

/**
 * 交付打包员 - 纯 JS 拼接,不调 LLM。
 *
 * 输入:ctx.artifacts(adapted_script + voice_registry + performance_design + review_report)
 * 输出:DeliveryPackagePayload { manifest[], versionTag, notes }
 */
async function runDeliveryPackagerAgent(ctx) {
  const startedAt = Date.now();
  const adaptedScript = pickArtifact(ctx?.artifacts, 'adapted_script');
  const voiceRegistry = pickArtifact(ctx?.artifacts, 'voice_registry');
  const performance = pickArtifact(ctx?.artifacts, 'performance_design');
  const review = pickArtifact(ctx?.artifacts, 'review_report');
  if (!adaptedScript) throw new Error('PACKAGER_NO_ADAPTED_SCRIPT');

  const chapterTitle = String(adaptedScript?.payload?.chapterTitle || '未命名章节');
  const segmentCount = (adaptedScript?.payload?.segments || []).length;
  const totalChars = Number(adaptedScript?.payload?.totalCharCount || 0);
  const roleCount = (voiceRegistry?.payload?.registry || []).length;
  const sfxCount = (performance?.payload?.sfxList || []).length;
  const cvCount = (performance?.payload?.cvDirections || []).length;
  const issueCount = (review?.payload?.issues || []).length;
  const conclusion = review?.payload?.conclusion || 'pass';
  const safeChapter = chapterTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30) || '未命名章节';

  const manifest = [
    { name: `${safeChapter}_多人演播样章.json`, type: '台本', size: estimateSize(adaptedScript?.payload) },
    { name: `${safeChapter}_角色音标注表.json`, type: '角色音', size: estimateSize(voiceRegistry?.payload) },
    { name: `${safeChapter}_演播设计稿.json`, type: '演播设计', size: estimateSize(performance?.payload) },
    { name: `${safeChapter}_质检报告.json`, type: '质检', size: estimateSize(review?.payload) },
    { name: 'delivery_manifest.json', type: '清单', size: '0.5 KB' },
  ];

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
    payload: { manifest, versionTag, notes },
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
