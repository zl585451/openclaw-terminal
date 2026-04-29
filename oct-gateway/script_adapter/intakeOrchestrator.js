'use strict';

const { createScriptAdapterEmitter } = require('./eventEmitter');

const INTAKE_STEPS = [
  {
    id: 'raw_asset',
    title: 'RawAsset 原始文件留存',
    desc: '记录本次素材来源、书籍、章节和输入方式。',
    mode: 'system',
    executor: 'oct-gateway.intake',
  },
  {
    id: 'text_extract',
    title: '文本抽取 / 清洗 / 编码统一',
    desc: '把章节文本或粘贴文本规整成后续链路可读的纯文本。',
    mode: 'rule',
    executor: 'oct-gateway.text-normalizer',
  },
  {
    id: 'source_document',
    title: 'SourceDocument 标准化入库',
    desc: '生成标准文档草案，后续步骤不再依赖上传方式。',
    mode: 'rule',
    executor: 'oct-gateway.source-document',
  },
  {
    id: 'source_profile',
    title: 'SourceProfile 建索引和轻量画像',
    desc: '基于真实文本统计章节、字数、正文类型和处理风险。',
    mode: 'rule',
    executor: 'oct-gateway.source-profiler',
  },
  {
    id: 'task_draft',
    title: 'TaskDraft 任务草案生成',
    desc: '生成下一步需要人工确认的目标、范围和候选执行方向。',
    mode: 'rule',
    executor: 'oct-gateway.task-draft',
  },
];

function createStepRuns() {
  return INTAKE_STEPS.map((step) => ({
    ...step,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  }));
}

async function startIntake(params = {}, connection, logger) {
  const runId = params.runId || `intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const emit = createScriptAdapterEmitter(connection, runId);
  const run = {
    id: runId,
    status: 'running',
    source: normalizeSource(params),
    steps: createStepRuns(),
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  const context = {};

  const publish = (event = 'intake.updated') => {
    run.updatedAt = new Date().toISOString();
    emit(event, { intakeRun: clone(run) });
  };

  publish('intake.started');

  try {
    for (let index = 0; index < run.steps.length; index += 1) {
      const step = run.steps[index];
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      publish('intake.step.running');

      const stepStart = Date.now();
      await executeStep(step.id, params, context);
      step.status = 'succeeded';
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - stepStart;
      publish('intake.step.succeeded');
    }

    run.status = 'succeeded';
    run.result = buildIntakeResult(params, context);
    run.completedAt = new Date().toISOString();
    publish('intake.succeeded');
    return { success: true, intakeRun: clone(run), result: run.result };
  } catch (error) {
    const current = run.steps.find((step) => step.status === 'running');
    if (current) {
      current.status = 'failed';
      current.completedAt = new Date().toISOString();
      current.error = error?.message || String(error);
      current.durationMs = current.startedAt ? Date.now() - Date.parse(current.startedAt) : null;
    }
    run.status = 'failed';
    run.error = error?.message || String(error);
    run.completedAt = new Date().toISOString();
    logger?.warn?.('script_adapter_intake_failed', { runId, error: run.error });
    publish('intake.failed');
    return { success: false, intakeRun: clone(run), error: run.error };
  }
}

async function executeStep(stepId, params, context) {
  await wait(80);
  if (stepId === 'raw_asset') {
    if (!params.sourceMode) throw new Error('INTAKE_SOURCE_MODE_REQUIRED');
    if (params.sourceMode === 'library' && !params.bookId) throw new Error('INTAKE_BOOK_ID_REQUIRED');
    if (params.sourceMode === 'paste' && !String(params.pastedText || '').trim()) {
      throw new Error('INTAKE_PASTED_TEXT_REQUIRED');
    }
    context.rawAssetId = `raw_asset_${Date.now().toString(36)}`;
    return;
  }

  if (stepId === 'text_extract') {
    const chapters = Array.isArray(params.chapters) ? params.chapters : [];
    const parts = params.sourceMode === 'paste'
      ? [{ title: '临时粘贴文本', text: params.pastedText || '' }]
      : chapters.map((chapter, index) => ({
          title: chapter.title || `第 ${index + 1} 章`,
          text: chapter.text || chapter.preview || '',
        }));
    const normalizedParts = parts.map((part) => ({
      title: String(part.title || '').trim(),
      text: normalizeText(part.text),
    })).filter((part) => part.text);
    if (normalizedParts.length === 0) throw new Error('INTAKE_TEXT_EMPTY');
    context.normalizedParts = normalizedParts;
    context.combinedText = normalizedParts.map((part) => part.text).join('\n\n');
    context.totalChars = context.combinedText.length;
    return;
  }

  if (stepId === 'source_document') {
    context.sourceDocument = {
      fileName: buildFileName(params, context),
      sourceType: params.sourceTypeLabel || 'novel',
      chapterHint: params.rangeLabel || inferRangeLabel(params),
      wordCountLabel: formatChars(context.totalChars),
    };
    return;
  }

  if (stepId === 'source_profile') {
    const text = context.combinedText || '';
    const dialogueCount = (text.match(/[“"][^”"]{1,120}[”"]/g) || []).length;
    context.sourceProfile = {
      contentCategory: inferContentCategory(params, text),
      structureSummary: `已读取 ${context.normalizedParts.length} 个文本片段，约 ${context.totalChars.toLocaleString('zh-CN')} 字，检测到约 ${dialogueCount} 处引号对白候选。`,
      confidenceLabel: context.totalChars > 200 ? '规则校验通过' : '文本较短，需人工确认',
      recommendedDirections: [
        { name: '多人演播有声书', reason: '当前链路可继续做台本、角色音表和质检交付物。', level: 'recommended' },
        { name: '广播剧样章', reason: '可进入更强场景化改造，但需要后续确认改写深度。', level: 'available' },
        { name: '小说润色稿', reason: '可保持小说形态，仅做语言和节奏优化。', level: 'available' },
        { name: '作品分析报告', reason: '可只输出诊断与建议，不进入制作。', level: 'available' },
      ],
      unsupportedDirections: [
        { name: '论文润色', reason: '当前素材未识别为论文结构。' },
        { name: '演讲稿优化', reason: '当前文本不是演讲或口播稿。' },
      ],
    };
    return;
  }

  if (stepId === 'task_draft') return;
}

function buildIntakeResult(params, context) {
  const rangeDesc = params.rangeLabel || inferRangeLabel(params);
  return {
    rawAssetId: context.rawAssetId,
    sourceDocument: context.sourceDocument,
    sourceProfile: context.sourceProfile,
    intakeSummary: `真实摄入完成：${context.sourceDocument.sourceType} / ${rangeDesc} / ${context.sourceDocument.wordCountLabel} / ${context.sourceProfile.confidenceLabel}`,
    recommendedAction: `把本轮工作目标锁定为“多人演播有声书”，处理范围锁定为${rangeDesc}。`,
    recommendedReason: '当前阶段只做素材确认和任务草案，不执行改稿；后续第 2、3 步再确认目标、策略和制作队列。',
    plannerAgent: 'oct-gateway.task-draft@rule',
    taskDraft: {
      confirmItems: [
        {
          id: 'work_goal',
          label: '工作目标',
          value: '多人演播有声书',
          desc: '这里只确认最终要做成什么产品，不决定改稿深度。',
          customHint: '如果目标不准确，可以补一句你真正想要的产品，例如“只想做小说润色稿”或“只要作品分析报告”。',
          options: [
            { value: '多人演播有声书', desc: '最终交付多人演播台本、角色音表和质检报告。', source: 'recommended' },
            { value: '广播剧样章', desc: '最终交付更强场景化的广播剧试作方案。', source: 'preset' },
            { value: '小说润色稿', desc: '最终交付保留小说形态的润色文本。', source: 'preset' },
            { value: '作品分析报告', desc: '最终只交付问题清单和修改建议，不进入改稿。', source: 'preset' },
          ],
        },
        {
          id: 'scope',
          label: '处理范围',
          value: rangeDesc,
          desc: '第 1 步已经锁定真实输入范围，后续不会自动改到别的章节。',
          customHint: '如需修改章节，请回到第 1 步重新选择范围。',
          options: [
            { value: rangeDesc, desc: '当前已确认范围。', source: 'recommended' },
            { value: '自定义范围', desc: '由用户指定章节、段落或文件片段。', source: 'preset' },
          ],
        },
      ],
    },
    agentPreAllocation: {
      assignedCount: 0,
      nextAgent: '第 2 步确认后再启动业务分析 Agent',
      candidateCount: 0,
      requiresHumanConfirm: true,
    },
  };
}

function normalizeSource(params) {
  return {
    mode: params.sourceMode || 'unknown',
    bookId: params.bookId || null,
    bookTitle: params.sourceTitle || params.bookTitle || '',
    rangeLabel: params.rangeLabel || inferRangeLabel(params),
    chapterIndices: Array.isArray(params.chapterIndices) ? params.chapterIndices : [],
  };
}

function inferRangeLabel(params) {
  const indices = Array.isArray(params.chapterIndices) ? params.chapterIndices : [];
  if (indices.length === 0) return params.sourceMode === 'paste' ? '临时文本' : '待确认范围';
  if (indices.length === 1) return `第 ${Number(indices[0]) + 1} 章`;
  return `第 ${Number(indices[0]) + 1} - ${Number(indices[indices.length - 1]) + 1} 章`;
}

function inferContentCategory(params, text) {
  if (params.sourceMode === 'paste') return '临时文本';
  if ((params.sourceTypeLabel || '').includes('novel')) return '小说正文';
  if (/[“"][^”"]+[”"]/.test(text)) return '小说正文';
  return params.sourceTypeLabel || '文本素材';
}

function buildFileName(params, context) {
  const sourceTitle = params.sourceTitle || params.bookTitle || 'source';
  const range = params.rangeLabel || inferRangeLabel(params);
  return `${sourceTitle}_${range}_${context.rawAssetId}.txt`;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatChars(chars) {
  return `约 ${Number(chars || 0).toLocaleString('zh-CN')} 字`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  INTAKE_STEPS,
  startIntake,
};
