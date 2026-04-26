const { runMockAgentPipeline } = require('./agentRunner');
const { createScriptAdapterEmitter } = require('./eventEmitter');
const runRegistry = require('./runRegistry');

const AGENTS = [
  {
    agentId: 'adapter.audiobook_text_rewriter@1.0',
    displayName: '文本改编师',
    roleSummary: '把原文改成更适合多人演播的口语化样章。',
    inputArtifactTypes: ['source_document', 'analysis_report', 'modification_strategy'],
    outputArtifactTypes: ['adapted_script'],
  },
  {
    agentId: 'classifier.voice_role_marker@1.0',
    displayName: '角色音统筹',
    roleSummary: '标出旁白、明确角色音、未定来源声音和占位。',
    inputArtifactTypes: ['adapted_script'],
    outputArtifactTypes: ['voice_registry'],
  },
  {
    agentId: 'designer.performance_audio@1.0',
    displayName: '演播设计师',
    roleSummary: '补充 BGM、音效、CV 情绪、气息和动作提示。',
    inputArtifactTypes: ['adapted_script', 'voice_registry'],
    outputArtifactTypes: ['performance_design'],
  },
  {
    agentId: 'reviewer.production_quality@1.0',
    displayName: '质检审校',
    roleSummary: '检查剧情忠实度、角色音合理性和演播提示可执行性。',
    inputArtifactTypes: ['adapted_script', 'voice_registry', 'performance_design'],
    outputArtifactTypes: ['review_report'],
  },
  {
    agentId: 'packager.content_delivery@1.0',
    displayName: '交付打包员',
    roleSummary: '把样章台本、角色音表、演播设计和质检报告整理成交付包。',
    inputArtifactTypes: ['adapted_script', 'voice_registry', 'performance_design', 'review_report'],
    outputArtifactTypes: ['final_package'],
  },
];

function createExecutionPlan(taskId, taskTitle) {
  const createdAt = new Date().toISOString();
  const plan = {
    planId: `plan-${taskId}`,
    taskId,
    agents: AGENTS.map((agent, index) => ({
      ...agent,
      order: index + 1,
      parallelizable: false,
    })),
    reviewGates: [
      {
        gateId: `gate-strategy-${taskId}`,
        afterAgentId: 'adapter.audiobook_text_rewriter@1.0',
        gateType: 'strategy_confirmation',
        description: '修改策略已在开工前确认，MVP 演示中自动通过。',
        status: 'pending',
      },
      {
        gateId: `gate-quality-${taskId}`,
        afterAgentId: 'reviewer.production_quality@1.0',
        gateType: 'quality_review',
        description: '质检结果需要复核，MVP 演示中自动通过。',
        status: 'pending',
      },
    ],
    createdAt,
  };

  return {
    taskId,
    taskTitle,
    plan,
    runs: plan.agents.map((agent) => ({
      runId: `run-${taskId}-${agent.order}`,
      planId: plan.planId,
      agentId: agent.agentId,
      status: 'pending',
      progressSummary: '等待开工',
      progressPercent: 0,
      outputArtifactIds: [],
    })),
    artifacts: {},
    gates: plan.reviewGates,
    overallStatus: 'pending',
    createdAt,
    updatedAt: createdAt,
  };
}

function startMockScriptAdapterRun(params, connection, logger) {
  const taskId = String(params?.taskId || `script-adapter-${Date.now()}`);
  const taskTitle = String(params?.taskTitle || '多人演播有声书样章');
  let sheet = createExecutionPlan(taskId, taskTitle);
  const abortController = new AbortController();
  const emit = createScriptAdapterEmitter(connection, taskId);

  runRegistry.registerRun({
    taskId,
    taskTitle,
    planId: sheet.plan.planId,
    status: 'running',
    sheet,
    abortController,
  });

  setTimeout(() => {
    runMockAgentPipeline({
      sheet,
      emit,
      signal: abortController.signal,
      onSheetUpdate: (nextSheet) => {
        sheet = nextSheet;
        runRegistry.updateRun(taskId, { sheet, status: sheet.overallStatus });
      },
    })
      .then((completedSheet) => {
        runRegistry.updateRun(taskId, {
          sheet: completedSheet,
          status: 'completed',
          completedAt: new Date().toISOString(),
        });
      })
      .catch((error) => {
        const reason = error?.message || String(error);
        const cancelled = error?.name === 'AbortError' || abortController.signal.aborted;
        const failedSheet = markRunningRunsFailed(sheet, cancelled ? 'cancelled_by_user' : reason);
        sheet = {
          ...failedSheet,
          overallStatus: 'failed',
          updatedAt: new Date().toISOString(),
        };
        const status = cancelled ? 'cancelled' : 'failed';
        runRegistry.updateRun(taskId, {
          sheet,
          status,
          error: cancelled ? 'cancelled_by_user' : reason,
          completedAt: new Date().toISOString(),
        });
        if (!cancelled) {
          logger?.error?.('script adapter mock run failed', { taskId, error: reason });
        }
        emit(cancelled ? 'run_cancelled' : 'run_failed', {
          error: cancelled ? 'cancelled_by_user' : reason,
          sheet,
        });
      });
  }, 0);

  return {
    taskId,
    planId: sheet.plan.planId,
  };
}

function cancelMockScriptAdapterRun(taskId, reason = 'cancelled_by_user') {
  return runRegistry.cancelRun(taskId, reason);
}

function listMockScriptAdapterRuns() {
  return runRegistry.listRuns();
}

function markRunningRunsFailed(sheet, error) {
  return {
    ...sheet,
    runs: sheet.runs.map((run) => {
      if (run.status !== 'running') return run;
      return {
        ...run,
        status: 'failed',
        completedAt: new Date().toISOString(),
        progressSummary: '已取消',
        error,
      };
    }),
  };
}

module.exports = {
  startMockScriptAdapterRun,
  cancelMockScriptAdapterRun,
  listMockScriptAdapterRuns,
  createExecutionPlan,
};
