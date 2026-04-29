'use strict';

const config = require('../config');
const { runTextRewriterAgent } = require('./agents/textRewriterAgent');
const { runVoiceClassifierAgent } = require('./agents/voiceClassifierAgent');
const { runPerformanceDesignerAgent } = require('./agents/performanceDesignerAgent');
const { runQualityReviewerAgent } = require('./agents/qualityReviewerAgent');
const { runDeliveryPackagerAgent } = require('./agents/deliveryPackagerAgent');

const REAL_AGENTS_FLAG = 'SCRIPT_ADAPTER_REAL_AGENTS';

/** 与 `config.js` 中 `scriptAdapter` 合并对象一致：嵌套 `config.json` 与顶层 env 均已并入 */
function getScriptAdapterRealAgentsRaw() {
  const fromMerged = config.scriptAdapter && typeof config.scriptAdapter === 'object'
    ? String(config.scriptAdapter.realAgents ?? '').trim()
    : '';
  if (fromMerged) return fromMerged;
  return String(config.getEnvOrConfig?.(REAL_AGENTS_FLAG) || '').trim();
}

function matchAgentFlag(flagRaw, agentId) {
  const flag = String(flagRaw || '').trim().toLowerCase();
  if (!flag || flag === 'off' || flag === 'false' || flag === '0') return false;
  if (flag === '1' || flag === 'true' || flag === 'on' || flag === 'all') return true;
  return flag.split(',').map((s) => s.trim()).includes(agentId);
}

function isRealAgentEnabled(agentId, ctx = {}) {
  const override = ctx?.realAgentsOverride;
  if (override != null) return matchAgentFlag(override, agentId);
  return matchAgentFlag(getScriptAdapterRealAgentsRaw(), agentId);
}

async function createArtifactForAgent(agentId, displayName, ctx = {}) {
  const sourceText = String(ctx?.sourceText || '').trim();

  if (
    agentId === 'adapter.audiobook_text_rewriter@1.0'
    && isRealAgentEnabled(agentId, ctx)
    && sourceText
  ) {
    try {
      const { payload, latencyMs, model } = await runTextRewriterAgent({ ...ctx, sourceText });
      return envelope(
        'adapted_script',
        agentId,
        displayName,
        '多人演播样章台本',
        `已用 ${model} 改编完成,耗时 ${latencyMs}ms`,
        payload,
        { segments: payload.segments.length, chars: payload.totalCharCount, latencyMs },
      );
    } catch (error) {
      return envelope(
        'adapted_script',
        agentId,
        displayName,
        '改编失败',
        `真实 LLM 调用失败,已回退占位:${String(error?.message || error).slice(0, 80)}`,
        {
          chapterTitle: '改编失败',
          totalCharCount: 0,
          segments: [
            {
              segmentId: 'seg-001',
              type: 'narration',
              text: '[改编失败,请检查模型配置后重试]',
              rewriteNote: String(error?.message || 'unknown').slice(0, 200),
            },
          ],
        },
        { error: 1 },
      );
    }
  }

  if (agentId === 'classifier.voice_role_marker@1.0' && isRealAgentEnabled(agentId, ctx)) {
    try {
      const { payload, latencyMs, model } = await runVoiceClassifierAgent(ctx);
      return envelope(
        'voice_registry',
        agentId,
        displayName,
        '角色音标注表',
        `已用 ${model} 分类完成,${payload.registry.length} 个角色,耗时 ${latencyMs}ms`,
        payload,
        {
          roles: payload.registry.length,
          unresolved: (payload.unresolved || []).length,
          latencyMs,
        },
      );
    } catch (error) {
      return envelope(
        'voice_registry',
        agentId,
        displayName,
        '分类失败',
        `角色音真实分类失败,已回退占位:${String(error?.message || error).slice(0, 80)}`,
        { registry: [], unresolved: [] },
        { error: 1 },
      );
    }
  }

  if (agentId === 'designer.performance_audio@1.0' && isRealAgentEnabled(agentId, ctx)) {
    try {
      const { payload, latencyMs, model } = await runPerformanceDesignerAgent(ctx);
      const filteredPayload = filterPerformancePayload(payload, ctx?.deliveryOptions || {});
      return envelope(
        'performance_design',
        agentId,
        displayName,
        '演播设计提示',
        `${model} 完成 BGM/${filteredPayload.sfxList.length} 条 SFX/${filteredPayload.cvDirections.length} 条 CV,耗时 ${latencyMs}ms`,
        filteredPayload,
        { sfx: filteredPayload.sfxList.length, cv: filteredPayload.cvDirections.length, latencyMs },
      );
    } catch (error) {
      return envelope(
        'performance_design',
        agentId,
        displayName,
        '设计失败',
        `演播设计真实调用失败,已回退占位:${String(error?.message || error).slice(0, 80)}`,
        {
          bgmTrack: { mood: '未设计', suggestion: '真实演播设计失败,请人工补充。' },
          sfxList: [],
          cvDirections: [],
        },
        { error: 1 },
      );
    }
  }

  if (agentId === 'reviewer.production_quality@1.0' && isRealAgentEnabled(agentId, ctx)) {
    try {
      const { payload, latencyMs, model } = await runQualityReviewerAgent(ctx);
      return envelope(
        'review_report',
        agentId,
        displayName,
        '质检问题清单',
        `${model} 给出结论:${payload.conclusion}(${payload.issues.length} 条问题),耗时 ${latencyMs}ms`,
        payload,
        { issues: payload.issues.length, latencyMs },
      );
    } catch (error) {
      return envelope(
        'review_report',
        agentId,
        displayName,
        '质检失败',
        `质检真实调用失败,已回退占位:${String(error?.message || error).slice(0, 80)}`,
        {
          conclusion: 'pass_with_changes',
          issues: [
            {
              severity: 'P1',
              category: '系统',
              location: '全局',
              description: '质检 Agent 失败,本轮使用占位报告继续流转。',
              suggestion: '交付前请人工补充质检。',
            },
          ],
        },
        { error: 1 },
      );
    }
  }

  if (agentId === 'packager.content_delivery@1.0' && isRealAgentEnabled(agentId, ctx)) {
    try {
      const { payload, latencyMs, model } = await runDeliveryPackagerAgent(ctx);
      return envelope(
        'final_package',
        agentId,
        displayName,
        '制作交付包',
        `${model} 已打包 ${payload.manifest.length} 个产物文件,耗时 ${latencyMs}ms`,
        payload,
        { files: payload.manifest.length, latencyMs },
      );
    } catch (error) {
      return envelope(
        'final_package',
        agentId,
        displayName,
        '打包失败',
        `打包失败,已回退占位:${String(error?.message || error).slice(0, 80)}`,
        { manifest: [], versionTag: 'failed', notes: '打包失败,请检查上游台本产物。' },
        { error: 1 },
      );
    }
  }

  return createMockArtifact(agentId, displayName, ctx);
}

function findAdaptedScriptPayload(artifacts) {
  if (!artifacts || typeof artifacts !== 'object') return null;
  for (const art of Object.values(artifacts)) {
    if (!art || art.artifactType !== 'adapted_script') continue;
    const payload = art.payload;
    if (payload && Array.isArray(payload.segments) && payload.segments.length > 0) return payload;
  }
  return null;
}

function filterPerformancePayload(payload, deliveryOptions = {}) {
  const includeCv = deliveryOptions.cvDirections !== false;
  const includeBgmSfx = deliveryOptions.bgmSfx !== false;
  return {
    bgmTrack: includeBgmSfx
      ? payload.bgmTrack
      : { mood: '', suggestion: '' },
    sfxList: includeBgmSfx ? payload.sfxList || [] : [],
    cvDirections: includeCv ? payload.cvDirections || [] : [],
  };
}

function buildVoiceRegistryFromAdapted(adapted, agentId, displayName) {
  const segments = adapted.segments;
  const narratorCount = segments.filter((s) => s.type === 'narration').length;
  const registry = [
    {
      roleName: '旁白',
      category: 'narrator',
      voiceHint: '冷静克制，随场景收紧或放松',
      appearanceCount: Math.max(1, narratorCount || 1),
    },
  ];
  const speakerCounts = new Map();
  for (const seg of segments) {
    if (seg.type !== 'dialogue' && seg.type !== 'inner_monologue') continue;
    const name = String(seg.speaker || '').trim();
    if (!name) continue;
    speakerCounts.set(name, (speakerCounts.get(name) || 0) + 1);
  }
  const sorted = [...speakerCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [roleName, appearanceCount] of sorted) {
    registry.push({
      roleName,
      category: 'main',
      voiceHint: '按对白密度与情绪起伏分配',
      appearanceCount,
    });
  }
  const unresolved = sorted.filter(([, c]) => c === 1).map(([n]) => n).slice(0, 2);
  return envelope(
    'voice_registry',
    agentId,
    displayName,
    '角色音标注表',
    `已根据上游台本 ${segments.length} 段提取 ${registry.length - 1} 个对白/独白声线（旁白单独统计）。`,
    { registry, unresolved },
    { roles: registry.length, unresolved: unresolved.length },
  );
}

function buildPerformanceDesignFromAdapted(adapted, agentId, displayName) {
  const segs = adapted.segments;
  const first = segs[0];
  const second = segs[1] || segs[0];
  const dialogueSeg = segs.find((s) => s.type === 'dialogue') || segs[0];
  const id0 = String(first?.segmentId || 'seg-001');
  const id1 = String(second?.segmentId || id0);
  const idCv = String(dialogueSeg?.segmentId || id0);
  return envelope(
    'performance_design',
    agentId,
    displayName,
    '演播设计提示',
    '已按上游 segmentId 绑定底噪、音效与对白情绪占位。',
    {
      bgmTrack: { mood: '随样章场景', suggestion: '保持人声清晰，底噪随段切换微调。' },
      sfxList: [
        { atSegmentId: id0, sfxType: 'AMB', description: '环境铺底（绑定当前段）。' },
        { atSegmentId: id1, sfxType: 'SFX', description: '动作/细节音效占位。' },
      ],
      cvDirections: [
        { atSegmentId: idCv, emotion: '随段调整', pace: dialogueSeg?.type === 'dialogue' ? '对白节奏跟读' : '旁白平稳推进' },
      ],
    },
    { sfx: 2, directions: 1 },
  );
}

function buildReviewFromAdapted(adapted, agentId, displayName) {
  const segs = adapted.segments;
  const speakers = [...new Set(
    segs.filter((s) => s.type === 'dialogue' || s.type === 'inner_monologue').map((s) => String(s.speaker || '').trim()).filter(Boolean),
  )];
  const loc = speakers.length ? speakers.slice(0, 3).join('、') : '当前样章';
  return envelope(
    'review_report',
    agentId,
    displayName,
    '质检问题清单',
    `已对照上游 ${segs.length} 段、约 ${adapted.totalCharCount ?? 0} 字台本做占位质检。`,
    {
      conclusion: 'pass_with_changes',
      issues: [
        {
          severity: 'P1',
          category: '一致性',
          location: loc,
          description: `样章共 ${segs.length} 段，涉及说话人：${speakers.length ? speakers.join('、') : '（以旁白为主）'}，交付前请与角色音表再对一遍。`,
          suggestion: '锁定 CV 后再进入打包。',
        },
      ],
    },
    { issues: 1, p1: 1 },
  );
}

function buildFinalPackageFromAdapted(adapted, agentId, displayName) {
  const segs = adapted.segments;
  const rawTitle = String(adapted.chapterTitle || '样章').trim() || '样章';
  const safe = rawTitle.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 36);
  const tag = `segments-${segs.length}`;
  return envelope(
    'final_package',
    agentId,
    displayName,
    '制作交付包',
    `已按「${rawTitle}」${segs.length} 段台本整理 mock 交付清单。`,
    {
      manifest: [
        { name: `${safe}_多人演播样章.md`, type: '台本', size: `${Math.max(1, Math.ceil((adapted.totalCharCount || 0) / 512))} KB` },
        { name: `${safe}_角色音标注表.json`, type: '角色音', size: '—' },
        { name: `${safe}_演播设计稿.md`, type: '演播设计', size: '—' },
        { name: `${safe}_质检报告.md`, type: '质检', size: '—' },
      ],
      versionTag: `audiobook-mvp-${tag}`,
      notes: `本包为 Gateway mock 预览；头部台本共 ${segs.length} 段，与上游 adapted_script 对齐。`,
    },
    { files: 4, segments: segs.length },
  );
}

function createMockArtifact(agentId, displayName, ctx = {}) {
  const adapted = findAdaptedScriptPayload(ctx.artifacts);

  if (agentId === 'adapter.audiobook_text_rewriter@1.0') {
    return envelope('adapted_script', agentId, displayName, '多人演播样章台本', '已完成第1章前半段的听感改编样稿。', {
      chapterTitle: '第1章 · 樟木箱',
      totalCharCount: 286,
      segments: [
        {
          segmentId: 'seg-001',
          type: 'narration',
          text: '三月的风从楼道窗缝里灌进来，带着一股灰尘和旧木头的味道。周佳宁站在门口，看着周婉云把钥匙插进那把发涩的锁里。',
          rewriteNote: '保留原场景信息，拆短句并增加可听化停顿。',
        },
        {
          segmentId: 'seg-002',
          type: 'dialogue',
          speaker: '周婉云',
          text: '东西都搬得差不多了。就剩阁楼上那些旧东西，你自己上去收拾一下。',
          rewriteNote: '对白改得更自然，保留人物冷淡的交代感。',
        },
      ],
    }, { segments: 2, chars: 286 });
  }

  if (agentId === 'classifier.voice_role_marker@1.0') {
    if (adapted) return buildVoiceRegistryFromAdapted(adapted, agentId, displayName);
    return envelope('voice_registry', agentId, displayName, '角色音标注表', '已标出旁白、主要角色和一个待确认来源声音。', {
      registry: [
        { roleName: '旁白', category: 'narrator', voiceHint: '冷静克制，悬疑感轻压', appearanceCount: 2 },
        { roleName: '周佳宁', category: 'main', voiceHint: '年轻女性，压抑、少话，反应慢半拍', appearanceCount: 2 },
        { roleName: '周婉云', category: 'main', voiceHint: '中年女性，语气利落，情绪不外露', appearanceCount: 1 },
        { roleName: '未定记录者A', category: 'unresolved', voiceHint: '文件或回忆中出现，暂不绑定正式角色', appearanceCount: 1 },
      ],
      unresolved: ['未定记录者A'],
    }, { roles: 4, unresolved: 1 });
  }

  if (agentId === 'designer.performance_audio@1.0') {
    if (adapted) {
      const artifact = buildPerformanceDesignFromAdapted(adapted, agentId, displayName);
      return {
        ...artifact,
        payload: filterPerformancePayload(artifact.payload, ctx?.deliveryOptions || {}),
      };
    }
    const payload = filterPerformancePayload({
      bgmTrack: { mood: '空屋静场', suggestion: '低频稀疏铺底，保持人声清楚，进入阁楼前轻微收紧。' },
      sfxList: [
        { atSegmentId: 'seg-001', sfxType: 'AMB', description: '老楼道空旷底噪，轻微风声，持续但弱。' },
        { atSegmentId: 'seg-001', sfxType: 'SFX', description: '钥匙插入旧锁，近景，一次性。' },
      ],
      cvDirections: [
        { atSegmentId: 'seg-002', emotion: '克制/2级', pace: '平稳偏快，句尾收住。' },
      ],
    }, ctx?.deliveryOptions || {});
    return envelope('performance_design', agentId, displayName, '演播设计提示', '已补充场景底噪、关键音效和 CV 情绪方向。', payload, {
      sfx: payload.sfxList.length,
      directions: payload.cvDirections.length,
    });
  }

  if (agentId === 'reviewer.production_quality@1.0') {
    if (adapted) return buildReviewFromAdapted(adapted, agentId, displayName);
    return envelope('review_report', agentId, displayName, '质检问题清单', '未发现 P0，建议带一条角色音复核进入交付。', {
      conclusion: 'pass_with_changes',
      issues: [
        {
          severity: 'P1',
          category: '角色音',
          location: '未定记录者A',
          description: '该声音暂未在当前片段确认来源，需要后续统筹复核。',
          suggestion: '保持独立占位，不进入旁白池。',
        },
      ],
    }, { issues: 1, p1: 1 });
  }

  if (adapted) return buildFinalPackageFromAdapted(adapted, agentId, displayName);
  return envelope('final_package', agentId, displayName, '制作交付包', '样章台本、角色音表、演播设计和质检报告已整理完成。', {
    manifest: [
      { name: '第1章前半段_多人演播样章.md', type: '台本', size: '3.2 KB' },
      { name: '第1章前半段_角色音标注表.json', type: '角色音', size: '1.1 KB' },
      { name: '第1章前半段_演播设计稿.md', type: '演播设计', size: '2.4 KB' },
      { name: '第1章前半段_质检报告.md', type: '质检', size: '1.5 KB' },
    ],
    versionTag: 'audiobook-mvp-sample-v0.1',
    notes: '本包为 Gateway mock 交付预览，用于验证执行链路和 UI 行为。',
  }, { files: 4 });
}

function envelope(artifactType, producedBy, displayName, title, summary, payload, metrics) {
  return {
    artifactId: `artifact-${artifactType}-${Date.now()}`,
    artifactType,
    producedBy,
    producedAt: new Date().toISOString(),
    title,
    summary: `${displayName}：${summary}`,
    payload,
    metrics,
  };
}

module.exports = {
  createArtifactForAgent,
  findAdaptedScriptPayload,
};
