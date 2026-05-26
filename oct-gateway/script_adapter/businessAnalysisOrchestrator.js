'use strict';

const { chatCompletion, resolveProviderFor } = require('../services/llmClient');
const config = require('../config');
const { createScriptAdapterEmitter } = require('./eventEmitter');

const ANALYSIS_STEPS = [
  {
    id: 'validate_order',
    title: '目标订单校验',
    desc: '确认工作目标、处理范围和输入文本完整。',
    mode: 'system',
    executor: 'oct-gateway.analysis-order',
  },
  {
    id: 'prepare_context',
    title: '分析上下文整理',
    desc: '整理章节正文、字数、预览和用户确认项。',
    mode: 'rule',
    executor: 'oct-gateway.analysis-context',
  },
  {
    id: 'business_analysis',
    title: '业务分析 Agent 初读',
    desc: '调用真实模型生成问题诊断、证据、策略选项和执行影响。',
    mode: 'agent',
    executor: 'agent.business_analysis@1.0',
  },
];

const ANALYSIS_FALLBACK_STEP = {
  id: 'rule_strategy_fallback',
  title: '规则兜底策略生成',
  desc: '当业务分析 Agent 因额度、超时或服务异常失败时，基于已确认目标和范围生成保守制作策略。',
  mode: 'rule',
  executor: 'oct-gateway.analysis-fallback',
};

const SYSTEM_PROMPT = `你是内容制作业务分析 Agent。你只做开工前分析，不改写正文。

目标:
1. 判断当前素材是否适合用户选择的工作目标
2. 找出会影响后续制作的文本问题
3. 给出可选择的修改策略
4. 明确下一步制作 Agent 和预计产物

输出必须是严格 JSON，不要 Markdown，不要解释。结构:
{
  "agentName": "业务分析 Agent",
  "summary": "一句总判断",
  "diagnosis": [
    { "title": "问题标题", "detail": "问题说明", "severity": "轻|中|高" }
  ],
  "evidence": [
    { "location": "章节/段落", "issue": "问题", "quote": "不超过80字原文证据" }
  ],
  "strategyOptions": [
    { "id": "light|standard|deep", "title": "策略名", "desc": "怎么做", "editDepth": "轻|中|深", "impact": "对后续制作影响", "recommended": true }
  ],
  "recommendedStrategyId": "standard",
  "executionImpact": {
    "nextAgents": ["场景拆分 Agent", "文本改编 Agent", "角色音标注 Agent"],
    "outputs": ["多人演播台本", "角色音表", "质检报告"],
    "requiresReview": true
  }
}`;

const ANALYSIS_TIMEOUT_MS = readPositiveInt(
  config.scriptAdapter?.analysisTimeoutMs || config.getEnvOrConfig?.('SCRIPT_ADAPTER_ANALYSIS_TIMEOUT_MS'),
  120000,
  30000,
  300000,
);
const ANALYSIS_INPUT_CHAR_BUDGET = readPositiveInt(
  config.scriptAdapter?.analysisInputCharBudget || config.getEnvOrConfig?.('SCRIPT_ADAPTER_ANALYSIS_INPUT_CHARS'),
  7000,
  2000,
  12000,
);
const ANALYSIS_RETRY_INPUT_CHAR_BUDGET = readPositiveInt(
  config.scriptAdapter?.analysisRetryInputCharBudget || config.getEnvOrConfig?.('SCRIPT_ADAPTER_ANALYSIS_RETRY_INPUT_CHARS'),
  3500,
  1200,
  ANALYSIS_INPUT_CHAR_BUDGET,
);

function startAnalysis(params = {}, connection, logger) {
  const runId = params.runId || `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const emit = createScriptAdapterEmitter(connection, runId);
  const run = {
    id: runId,
    status: 'running',
    steps: ANALYSIS_STEPS.map((step) => ({
      ...step,
      status: 'pending',
      startedAt: null,
      completedAt: null,
      durationMs: null,
      error: null,
      model: null,
    })),
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  const context = {};

  const publish = (event = 'analysis.updated') => {
    run.updatedAt = new Date().toISOString();
    emit(event, { analysisRun: clone(run) });
  };

  publish('analysis.started');
  runAnalysisToCompletion({ run, params, context, publish, logger, runId }).catch((error) => {
    const errMsg = error?.message || String(error);
    logger?.warn?.('script_adapter_analysis_unhandled_failed', { runId, error: errMsg });
    // 兜底：外部 catch 触发说明 runAnalysisToCompletion 内部 catch 也抛了，
    // 此时 UI 可能仍在等待事件，必须 emit failure 让前端从 loading 状态恢复。
    if (run.status === 'running') {
      run.status = 'failed';
      run.error = errMsg;
    }
    publish('analysis.failed');
  });

  return { success: true, analysisRun: clone(run) };
}

async function runAnalysisToCompletion({ run, params, context, publish, logger, runId }) {
  try {
    for (const step of run.steps) {
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      publish('analysis.step.running');
      const started = Date.now();
      const output = await executeStep(step.id, params, context);
      if (output?.model) step.model = output.model;
      step.status = 'succeeded';
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - started;
      publish('analysis.step.succeeded');
    }

    run.status = 'succeeded';
    run.result = context.analysisReport;
    run.completedAt = new Date().toISOString();
    publish('analysis.succeeded');
    return;
  } catch (error) {
    const running = run.steps.find((step) => step.status === 'running');
    if (running) {
      running.status = 'failed';
      running.completedAt = new Date().toISOString();
      running.durationMs = running.startedAt ? Date.now() - Date.parse(running.startedAt) : null;
      running.error = error?.message || String(error);
    }
    if (running?.id === 'business_analysis' && canFallbackToRuleAnalysis(error)) {
      const fallbackStarted = Date.now();
      const fallbackStep = {
        ...ANALYSIS_FALLBACK_STEP,
        status: 'running',
        startedAt: new Date().toISOString(),
        completedAt: null,
        durationMs: null,
        error: null,
        model: null,
      };
      run.steps.push(fallbackStep);
      publish('analysis.step.running');
      run.result = buildRuleFallbackAnalysisReport(params, context, error);
      fallbackStep.status = 'succeeded';
      fallbackStep.completedAt = new Date().toISOString();
      fallbackStep.durationMs = Date.now() - fallbackStarted;
      run.status = 'succeeded';
      run.error = null;
      run.completedAt = new Date().toISOString();
      logger?.warn?.('script_adapter_analysis_degraded_to_rule', {
        runId,
        reason: error?.message || String(error),
      });
      publish('analysis.succeeded');
      return;
    }
    run.status = 'failed';
    run.error = error?.message || String(error);
    run.completedAt = new Date().toISOString();
    logger?.warn?.('script_adapter_analysis_failed', { runId, error: run.error });
    publish('analysis.failed');
  }
}

async function executeStep(stepId, params, context) {
  await wait(80);
  if (stepId === 'validate_order') {
    if (!String(params.workGoal || '').trim()) throw new Error('ANALYSIS_WORK_GOAL_REQUIRED');
    if (!String(params.rangeLabel || '').trim()) throw new Error('ANALYSIS_RANGE_REQUIRED');
    const chapters = Array.isArray(params.chapters) ? params.chapters : [];
    if (chapters.length === 0) throw new Error('ANALYSIS_CHAPTERS_REQUIRED');
    return null;
  }

  if (stepId === 'prepare_context') {
    const chapters = params.chapters.map((chapter, index) => ({
      title: chapter.title || `第 ${index + 1} 章`,
      text: normalizeText(chapter.text || chapter.preview || ''),
      charCount: Number(chapter.char_count || String(chapter.text || '').length || 0),
    })).filter((chapter) => chapter.text);
    if (chapters.length === 0) throw new Error('ANALYSIS_TEXT_EMPTY');
    context.chapters = chapters;
    context.sourceText = chapters.map((chapter) => `【${chapter.title}】\n${chapter.text}`).join('\n\n');
    context.totalChars = context.sourceText.length;
    return null;
  }

  if (stepId === 'business_analysis') {
    const provider = resolveProviderFor('script_adapter');
    const result = await runBusinessAnalysisCompletion({ provider, params, context });
    context.analysisReport = normalizeAnalysisReport(result.payload, params);
    return { model: formatProviderLabel(result.model, provider) };
  }
}

async function runBusinessAnalysisCompletion({ provider, params, context, request = requestBusinessAnalysis }) {
  try {
    const result = await request({
      provider,
      params,
      context,
      charBudget: ANALYSIS_INPUT_CHAR_BUDGET,
      maxTokens: 2000,
      temperature: 0.3,
    });
    return {
      ...result,
      payload: parseJsonObject(result.content),
    };
  } catch (error) {
    if (!isRetryableAnalysisError(error)) throw error;
    const retry = await request({
      provider,
      params,
      context,
      charBudget: ANALYSIS_RETRY_INPUT_CHAR_BUDGET,
      maxTokens: 1500,
      temperature: 0.2,
      compact: true,
    });
    return {
      ...retry,
      payload: parseJsonObject(retry.content),
      model: `${retry.model} (compact retry)`,
    };
  }
}

async function requestBusinessAnalysis({ provider, params, context, charBudget, maxTokens, temperature, compact = false }) {
  return chatCompletion({
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildAnalysisPrompt({ params, context, charBudget, compact }),
      },
    ],
    maxTokens,
    temperature,
    responseJson: true,
    timeoutMs: ANALYSIS_TIMEOUT_MS,
  });
}

function buildAnalysisPrompt({ params, context, charBudget, compact }) {
  return [
    `工作目标：${params.workGoal}`,
    `处理范围：${params.rangeLabel}`,
    `总字数：约 ${context.totalChars.toLocaleString('zh-CN')} 字`,
    `用户补充：${params.customNotes || '无'}`,
    compact ? '请基于下列紧凑样本输出最小但完整的业务分析 JSON。' : '请基于下列样本输出业务分析 JSON，重点判断制作风险和策略选择。',
    '正文样本：',
    sampleAnalysisText(context.sourceText, charBudget),
  ].join('\n');
}

function sampleAnalysisText(text, charBudget) {
  const source = String(text || '').trim();
  if (source.length <= charBudget) return source;
  const headSize = Math.floor(charBudget * 0.45);
  const middleSize = Math.floor(charBudget * 0.25);
  const tailSize = Math.max(800, charBudget - headSize - middleSize);
  const middleStart = Math.max(0, Math.floor(source.length / 2) - Math.floor(middleSize / 2));
  return [
    source.slice(0, headSize),
    '\n\n【中段抽样】\n',
    source.slice(middleStart, middleStart + middleSize),
    '\n\n【尾段抽样】\n',
    source.slice(Math.max(0, source.length - tailSize)),
  ].join('');
}

function isRetryableAnalysisError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return error?.code === 'BUSINESS_ANALYSIS_JSON_PARSE_FAILED'
    || error?.name === 'LlmClientTimeoutError'
    || message.includes('timeout')
    || message.includes('超时')
    || message.includes('json_parse')
    || message.includes('unexpected end')
    || message.includes('expected')
    || message.includes('after array element');
}

function canFallbackToRuleAnalysis(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return error?.code === 'BUSINESS_ANALYSIS_JSON_PARSE_FAILED'
    || error?.name === 'LlmClientTimeoutError'
    || error?.status === 402
    || error?.status === 403
    || message.includes('business_analysis_json_parse_failed')
    || message.includes('timeout')
    || message.includes('超时')
    || message.includes('json_parse')
    || message.includes('unexpected end')
    || message.includes('after array element')
    || message.includes('quota')
    || message.includes('insufficient_user_quota')
    || message.includes('llm_http_402')
    || message.includes('llm_http_403')
    || message.includes('rate_limit')
    || message.includes('429')
    || message.includes('fetch failed')
    || message.includes('network');
}

function buildRuleFallbackAnalysisReport(params, context, error) {
  const chapters = Array.isArray(context.chapters) && context.chapters.length > 0
    ? context.chapters
    : [{ title: params.rangeLabel || '当前范围', text: '', charCount: 0 }];
  const workGoal = String(params.workGoal || '多人演播有声书');
  const rangeLabel = String(params.rangeLabel || '当前范围');
  const isDramaGoal = workGoal.includes('广播剧');
  const isPolishGoal = workGoal.includes('润色');
  const isAnalysisGoal = workGoal.includes('分析');
  const isMultiChapter = chapters.length > 1;
  const totalChars = Number(context.totalChars || chapters.reduce((sum, chapter) => sum + Number(chapter.charCount || chapter.text?.length || 0), 0));
  const firstChapter = chapters[0];
  const middleChapter = chapters[Math.floor((chapters.length - 1) / 2)] || firstChapter;
  const lastChapter = chapters[chapters.length - 1] || firstChapter;
  const reason = simplifyLlmFailure(error);
  const recommendedStrategyId = isDramaGoal ? 'drama_feasibility' : isAnalysisGoal ? 'analysis_only' : 'audiobook_sample';

  return {
    agentName: '规则兜底分析',
    summary: `业务分析 Agent 未完成（${reason}）。系统已基于已确认目标和范围生成保守策略：${workGoal} · ${rangeLabel}，约 ${totalChars.toLocaleString('zh-CN')} 字，建议先小范围试产，不直接扩大到全书。`,
    diagnosis: [
      {
        title: 'LLM 初读不可用',
        detail: `本次没有拿到业务分析 Agent 的模型判断，原因：${reason}。后续策略应保持保守，不自动扩大改写深度。`,
        severity: '中',
      },
      {
        title: isDramaGoal ? '广播剧改造成本需人工确认' : isPolishGoal ? '润色深度需人工确认' : '多人演播改编深度需人工确认',
        detail: isDramaGoal
          ? '广播剧方向会显著增加场景拆分、对白重写和音效设计成本，建议先做可行性拆解。'
          : '当前目标可以进入样章制作，但旁白听感、对白归属和角色音仍应在制作结果中复核。',
        severity: isDramaGoal ? '高' : '中',
      },
      {
        title: isMultiChapter ? '多章范围建议分批验证' : '单章范围适合试产验证',
        detail: isMultiChapter
          ? '所选范围覆盖多章，建议先确认输出样式，再继续批量执行。'
          : '当前范围较适合进入开工页试产，用实际产物验证模型表现。',
        severity: '轻',
      },
    ],
    evidence: [
      {
        location: `${firstChapter.title || rangeLabel} · 开头样本`,
        issue: '需要制作 Agent 进一步拆分旁白和对白',
        quote: pickEvidenceQuote(firstChapter.text, '当前范围已确认，但没有可用的开头文本样本。'),
      },
      {
        location: `${middleChapter.title || rangeLabel} · 中段样本`,
        issue: '需要在制作阶段确认声音主体',
        quote: pickEvidenceQuote(sampleMiddleText(middleChapter.text), '中段样本不足，建议制作后重点复核角色音归属。'),
      },
      {
        location: `${lastChapter.title || rangeLabel} · 结尾样本`,
        issue: isMultiChapter ? '章间衔接需要听觉提示' : '段落转场需要听觉提示',
        quote: pickEvidenceQuote(sampleTailText(lastChapter.text), '结尾样本不足，建议制作后重点复核转场和停顿。'),
      },
    ],
    strategyOptions: [
      {
        id: 'analysis_only',
        title: '只保留规则分析',
        desc: '不启动制作 Agent，只保留本次目标、范围和风险记录。',
        editDepth: '不改原文',
        impact: '适合等待 LLM 额度恢复后再做 AI 初读。',
        recommended: isAnalysisGoal,
      },
      {
        id: 'light_listening_polish',
        title: '轻度听感润色',
        desc: '只处理明显不顺口的旁白和句式，不改变剧情、人物关系和信息顺序。',
        editDepth: '轻',
        impact: '降低模型自由发挥风险，适合额度不稳定时小范围试产。',
        recommended: isPolishGoal,
      },
      {
        id: 'audiobook_sample',
        title: '多人演播样章制作',
        desc: '进入文本改编、角色音标注和质检，但保持剧情不改、深度保守。',
        editDepth: '中',
        impact: '适合验证真实制作 Agent 是否能拆出对白、旁白和角色音。',
        recommended: !isDramaGoal && !isAnalysisGoal && !isPolishGoal,
      },
      {
        id: 'drama_feasibility',
        title: '广播剧可行性拆解',
        desc: '先不直接重写成广播剧，只评估场景拆分、对白增强和音效成本。',
        editDepth: '分析优先',
        impact: '适合广播剧目标，避免直接产生高成本改写。',
        recommended: isDramaGoal,
      },
    ],
    recommendedStrategyId,
    executionImpact: {
      nextAgents: isDramaGoal
        ? ['场景拆分 Agent', '对白增强 Agent', '音效成本评估 Agent']
        : ['文本改编 Agent', '角色音标注 Agent', '质检 Agent'],
      outputs: isDramaGoal
        ? ['广播剧可行性拆解', '对白增强建议', '音效成本评估']
        : ['多人演播台本', '角色音表', '质检报告'],
      requiresReview: true,
    },
  };
}

function simplifyLlmFailure(error) {
  const message = String(error?.message || error || '');
  if (message.includes('insufficient_user_quota')) return '模型服务额度不足';
  if (message.includes('quota')) return '模型服务额度不足';
  if (message.includes('超时') || message.toLowerCase().includes('timeout')) return '模型请求超时';
  if (message.includes('LLM_HTTP_403')) return '模型服务拒绝请求';
  if (message.includes('LLM_HTTP_402')) return '模型服务余额不足';
  return '模型服务暂不可用';
}

function pickEvidenceQuote(text, fallback) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  const sentence = normalized.split(/[。！？!?]/).find((part) => part.trim().length >= 8)?.trim();
  return sentence ? `${sentence.slice(0, 86)}。` : `${normalized.slice(0, 86)}${normalized.length > 86 ? '...' : ''}`;
}

function sampleMiddleText(text) {
  const source = String(text || '');
  if (source.length <= 240) return source;
  const start = Math.max(0, Math.floor(source.length / 2) - 120);
  return source.slice(start, start + 240);
}

function sampleTailText(text) {
  const source = String(text || '');
  return source.length <= 240 ? source : source.slice(-240);
}

function normalizeAnalysisReport(payload, params) {
  const strategyOptions = Array.isArray(payload.strategyOptions) && payload.strategyOptions.length > 0
    ? payload.strategyOptions
    : [
        {
          id: 'standard',
          title: '标准多人演播改编',
          desc: '保留剧情和信息顺序，优化旁白听感，拆清对白和角色音。',
          editDepth: '中',
          impact: '适合进入文本改编、角色音标注和质检。',
          recommended: true,
        },
      ];
  const recommended = payload.recommendedStrategyId
    || strategyOptions.find((item) => item.recommended)?.id
    || strategyOptions[0].id;
  return {
    agentName: payload.agentName || '业务分析 Agent',
    summary: payload.summary || `${params.workGoal} · ${params.rangeLabel} 已完成初读分析。`,
    diagnosis: normalizeArray(payload.diagnosis).slice(0, 4).map((item, index) => ({
      title: item.title || `问题 ${index + 1}`,
      detail: item.detail || '需要人工复核。',
      severity: ['轻', '中', '高'].includes(item.severity) ? item.severity : '中',
    })),
    evidence: normalizeArray(payload.evidence).slice(0, 4).map((item, index) => ({
      location: item.location || `${params.rangeLabel} · 证据 ${index + 1}`,
      issue: item.issue || '待复核问题',
      quote: String(item.quote || '').slice(0, 90),
    })),
    strategyOptions: strategyOptions.slice(0, 4).map((item, index) => ({
      id: String(item.id || `strategy_${index + 1}`),
      title: item.title || `策略 ${index + 1}`,
      desc: item.desc || '待确认策略说明。',
      editDepth: item.editDepth || '中',
      impact: item.impact || '待评估影响。',
      recommended: Boolean(item.recommended),
    })),
    recommendedStrategyId: String(recommended),
    executionImpact: {
      nextAgents: normalizeArray(payload.executionImpact?.nextAgents).length
        ? payload.executionImpact.nextAgents
        : ['文本改编 Agent', '角色音标注 Agent', '质检 Agent'],
      outputs: normalizeArray(payload.executionImpact?.outputs).length
        ? payload.executionImpact.outputs
        : ['多人演播台本', '角色音表', '质检报告'],
      requiresReview: payload.executionImpact?.requiresReview !== false,
    },
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJsonObject(content) {
  const raw = String(content || '').trim();
  try {
    return JSON.parse(raw);
  } catch (rawError) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw createJsonParseError(rawError, raw);
    try {
      return JSON.parse(match[0]);
    } catch (extractedError) {
      throw createJsonParseError(extractedError, match[0]);
    }
  }
}

function createJsonParseError(cause, raw) {
  const detail = cause?.message ? `: ${cause.message}` : '';
  const error = new Error(`BUSINESS_ANALYSIS_JSON_PARSE_FAILED${detail}`);
  error.code = 'BUSINESS_ANALYSIS_JSON_PARSE_FAILED';
  error.cause = cause;
  error.rawSnippet = String(raw || '').slice(0, 500);
  return error;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readPositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function formatProviderLabel(model, provider) {
  const source = provider?.source ? ` · ${provider.source}` : '';
  const host = safeHost(provider?.baseUrl);
  return `${model || provider?.model || 'unknown'}${source}${host ? ` · ${host}` : ''}`;
}

function safeHost(url) {
  try {
    return new URL(String(url || '')).host;
  } catch {
    return '';
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  ANALYSIS_STEPS,
  startAnalysis,
  _test: {
    canFallbackToRuleAnalysis,
    isRetryableAnalysisError,
    parseJsonObject,
    runBusinessAnalysisCompletion,
  },
};
