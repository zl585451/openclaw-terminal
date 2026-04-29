'use strict';

const { createScriptAdapterEmitter } = require('./eventEmitter');

const PRODUCTION_HANDOFF_STEPS = [
  {
    id: 'validate_strategy',
    title: '修改策略校验',
    desc: '确认已选择修改策略、处理范围和交付物。',
    mode: 'system',
    executor: 'oct-gateway.production-handoff',
  },
  {
    id: 'build_execution_contract',
    title: '生成制作执行合同',
    desc: '把目标、范围、策略和交付物固化为工作台合同。',
    mode: 'rule',
    executor: 'oct-gateway.execution-contract',
  },
  {
    id: 'resolve_production_queue',
    title: '解析制作队列',
    desc: '按交付物开关计算将要启用的制作 Agent 和模块。',
    mode: 'rule',
    executor: 'oct-gateway.production-queue',
  },
  {
    id: 'handoff_workbench',
    title: '交接到制作工作台',
    desc: '把执行合同交给工作台，等待用户在开工页启动批次。',
    mode: 'system',
    executor: 'oct-gateway.workbench-handoff',
  },
];

async function startProductionHandoff(params = {}, connection, logger) {
  const runId = params.runId || `production-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emit = createScriptAdapterEmitter(connection, runId);
  const now = new Date().toISOString();
  const run = {
    id: runId,
    status: 'running',
    steps: PRODUCTION_HANDOFF_STEPS.map((step) => ({
      ...step,
      status: 'pending',
      startedAt: null,
      completedAt: null,
      durationMs: null,
      error: null,
    })),
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  const context = {};

  const publish = (event = 'production.updated') => {
    run.updatedAt = new Date().toISOString();
    emit(event, { productionRun: clone(run) });
  };

  publish('production.started');

  try {
    for (const step of run.steps) {
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      publish('production.step.running');
      const started = Date.now();
      await executeStep(step.id, params, context);
      step.status = 'succeeded';
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - started;
      publish('production.step.succeeded');
    }
    run.status = 'succeeded';
    run.result = {
      contract: context.contract,
      productionQueue: context.productionQueue,
    };
    run.completedAt = new Date().toISOString();
    publish('production.succeeded');
    return { success: true, productionRun: clone(run), result: run.result };
  } catch (error) {
    const running = run.steps.find((step) => step.status === 'running');
    if (running) {
      running.status = 'failed';
      running.completedAt = new Date().toISOString();
      running.durationMs = running.startedAt ? Date.now() - Date.parse(running.startedAt) : null;
      running.error = error?.message || String(error);
    }
    run.status = 'failed';
    run.error = error?.message || String(error);
    run.completedAt = new Date().toISOString();
    logger?.warn?.('script_adapter_production_handoff_failed', { runId, error: run.error });
    publish('production.failed');
    return { success: false, productionRun: clone(run), error: run.error };
  }
}

async function executeStep(stepId, params, context) {
  await wait(90);
  if (stepId === 'validate_strategy') {
    if (!params.bookId) throw new Error('PRODUCTION_BOOK_ID_REQUIRED');
    if (!Array.isArray(params.chapterIndices) || params.chapterIndices.length === 0) {
      throw new Error('PRODUCTION_CHAPTERS_REQUIRED');
    }
    if (!String(params.strategyTitle || '').trim()) throw new Error('PRODUCTION_STRATEGY_REQUIRED');
    if (!params.deliveryOptions?.adaptedScript) throw new Error('PRODUCTION_ADAPTED_SCRIPT_REQUIRED');
    return;
  }
  if (stepId === 'build_execution_contract') {
    context.contract = {
      bookId: String(params.bookId),
      bookTitle: String(params.bookTitle || ''),
      chapterIndices: params.chapterIndices.map((index) => Number(index)),
      rangeLabel: String(params.rangeLabel || ''),
      totalChars: Number(params.totalChars || 0),
      chapterCount: Number(params.chapterCount || params.chapterIndices.length),
      workGoal: String(params.workGoal || ''),
      strategyTitle: String(params.strategyTitle || ''),
      strategyDesc: params.strategyDesc ? String(params.strategyDesc) : undefined,
      deliveryOptions: normalizeDeliveryOptions(params.deliveryOptions),
    };
    return;
  }
  if (stepId === 'resolve_production_queue') {
    context.productionQueue = resolveProductionQueue(context.contract.deliveryOptions);
    return;
  }
  if (stepId === 'handoff_workbench') {
    if (!context.contract || !Array.isArray(context.productionQueue)) {
      throw new Error('PRODUCTION_HANDOFF_CONTEXT_MISSING');
    }
  }
}

function normalizeDeliveryOptions(options = {}) {
  return {
    adaptedScript: true,
    voiceRegistry: options.voiceRegistry !== false,
    qualityReview: options.qualityReview !== false,
    cvDirections: options.cvDirections === true,
    bgmSfx: options.bgmSfx === true,
    finalPackage: options.finalPackage !== false,
  };
}

function resolveProductionQueue(deliveryOptions) {
  const queue = [
    {
      id: 'adapter.audiobook_text_rewriter@1.0',
      label: '文本改编 Agent',
      enabled: true,
      reason: '生成多人演播台本',
    },
    {
      id: 'classifier.voice_role_marker@1.0',
      label: '角色音标注 Agent',
      enabled: deliveryOptions.voiceRegistry,
      reason: deliveryOptions.voiceRegistry ? '生成角色音表' : '角色音表未开启',
    },
    {
      id: 'designer.performance_audio@1.0',
      label: '演播设计 Agent',
      enabled: deliveryOptions.cvDirections || deliveryOptions.bgmSfx,
      reason: deliveryOptions.cvDirections || deliveryOptions.bgmSfx ? '生成 CV/BGM/SFX 指导' : 'CV 与 BGM/SFX 未开启',
    },
    {
      id: 'reviewer.production_quality@1.0',
      label: '质检 Agent',
      enabled: deliveryOptions.qualityReview,
      reason: deliveryOptions.qualityReview ? '生成质检报告' : '质检报告未开启',
    },
    {
      id: 'packager.content_delivery@1.0',
      label: '交付打包模块',
      enabled: deliveryOptions.finalPackage,
      reason: deliveryOptions.finalPackage ? '生成最终交付包' : '最终打包未开启',
    },
  ];
  return queue.filter((item) => item.enabled);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  PRODUCTION_HANDOFF_STEPS,
  startProductionHandoff,
};
