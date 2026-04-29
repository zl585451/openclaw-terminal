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
  const realEnabled = isRealAgentEnabled(agentId, ctx);

  if (
    agentId === 'adapter.audiobook_text_rewriter@1.0'
    && realEnabled
  ) {
    if (!sourceText) {
      throw new Error('TEXT_REWRITER_NO_INPUT: 真实 Agent 模式没有拿到章节原文');
    }
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
      throw new Error(`TEXT_REWRITER_REAL_FAILED: ${String(error?.message || error)}`);
    }
  }

  if (agentId === 'classifier.voice_role_marker@1.0' && realEnabled) {
    try {
      const { payload, latencyMs, model } = await runVoiceClassifierAgent(ctx);
      const hasNonNarrator = Array.isArray(payload.registry)
        && payload.registry.some((role) => role.roleName !== '旁白' && role.category !== 'narrator');
      if (!hasNonNarrator) {
        throw new Error('VOICE_CLASSIFIER_ONLY_NARRATOR: 真实角色音阶段只识别到旁白,疑似上游台本没有拆出对白');
      }
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
      throw new Error(`VOICE_CLASSIFIER_REAL_FAILED: ${String(error?.message || error)}`);
    }
  }

  if (agentId === 'designer.performance_audio@1.0' && realEnabled) {
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
      throw new Error(`PERFORMANCE_DESIGN_REAL_FAILED: ${String(error?.message || error)}`);
    }
  }

  if (agentId === 'reviewer.production_quality@1.0' && realEnabled) {
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
      throw new Error(`QUALITY_REVIEW_REAL_FAILED: ${String(error?.message || error)}`);
    }
  }

  if (agentId === 'packager.content_delivery@1.0' && realEnabled) {
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
      throw new Error(`DELIVERY_PACKAGER_REAL_FAILED: ${String(error?.message || error)}`);
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

/**
 * 用真实 sourceText 构建 mock 改编台本。
 * 按段落拆分，通过引号启发式判断旁白 vs 对白，不调用 LLM。
 * 返回值是 envelope() 的结果。
 */
function buildMockAdaptedScriptFromSource(sourceText, agentId, displayName) {
  // 提取章节标题：第一行非空内容
  const lines = sourceText.split('\n');
  let chapterTitle = '';
  for (const line of lines) {
    const t = line.trim();
    if (t) { chapterTitle = t.slice(0, 40); break; }
  }
  if (!chapterTitle) chapterTitle = '本章';

  // 按双换行（段落）或单换行拆分，过滤空行
  const rawParas = sourceText.split(/\n{2,}|\n/).map((p) => p.trim()).filter((p) => p.length > 0);

  // 最多取前 30 段，避免段数过多
  const paras = rawParas.slice(0, 30);

  let segIdx = 0;
  const segments = [];

  for (const para of paras) {
    segIdx += 1;
    const segmentId = `seg-${String(segIdx).padStart(3, '0')}`;

    // 启发式：行内有中文引号 "…" / 「…」 或以说话人格式开头 → 对白
    const hasQuote = /[""「」『』]/.test(para);
    // 检测 "角色：对白" 格式
    const speakerMatch = para.match(/^([^\s：:，,。.…]{1,6})[：:](.+)/);

    if (speakerMatch) {
      segments.push({
        segmentId,
        type: 'dialogue',
        speaker: speakerMatch[1].trim(),
        text: speakerMatch[2].trim(),
        rewriteNote: '[mock] 对白段，演播时注意角色口吻与情绪。',
      });
    } else if (hasQuote) {
      // 提取引号前面可能是旁白，引号部分是对白——简化为 dialogue
      segments.push({
        segmentId,
        type: 'dialogue',
        speaker: '',
        text: para,
        rewriteNote: '[mock] 含引号段，暂归对白，确认说话人后修正。',
      });
    } else {
      segments.push({
        segmentId,
        type: 'narration',
        text: para,
        rewriteNote: '[mock] 旁白段，注意节奏与停顿。',
      });
    }
  }

  const totalCharCount = segments.reduce((sum, s) => sum + (s.text ? s.text.length : 0), 0);

  return envelope(
    'adapted_script',
    agentId,
    displayName,
    '多人演播样章台本（Mock 预处理）',
    `[mock] 已将原文 ${rawParas.length} 段（取前 ${segments.length} 段）按启发式规则拆分，共 ${totalCharCount} 字。切换真实 Agent 可获得 LLM 改编版本。`,
    {
      chapterTitle,
      totalCharCount,
      segments,
    },
    { segments: segments.length, chars: totalCharCount },
  );
}

function createMockArtifact(agentId, displayName, ctx = {}) {
  const adapted = findAdaptedScriptPayload(ctx.artifacts);

  if (agentId === 'adapter.audiobook_text_rewriter@1.0') {
    // 使用实际 sourceText 构建 mock 台本，不再硬编码第1章内容
    const sourceText = String(ctx?.sourceText || '').trim();
    if (sourceText) {
      return buildMockAdaptedScriptFromSource(sourceText, agentId, displayName);
    }
    // 无 sourceText 时才回退到占位内容（明确标注为占位）
    return envelope('adapted_script', agentId, displayName, '多人演播样章台本（占位）', '[mock] 未提供原文，以下为占位台本，不代表实际章节内容。', {
      chapterTitle: '（未提供原文）',
      totalCharCount: 0,
      segments: [
        {
          segmentId: 'seg-001',
          type: 'narration',
          text: '[占位] 请提供原文后重新执行，或切换到真实 Agent 模式。',
          rewriteNote: '无原文，无法生成台本。',
        },
      ],
    }, { segments: 1, chars: 0 });
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
