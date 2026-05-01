const { createArtifactForAgent } = require('./mockArtifactFactory');
const runRegistry = require('./runRegistry');

async function runChapterAgentPipeline({ sheet, emit, signal, onSheetUpdate, ctx = {} }) {
  let currentSheet = { ...sheet, overallStatus: 'running', updatedAt: new Date().toISOString() };
  onSheetUpdate?.(currentSheet);
  emit('sheet_created', { sheet: currentSheet });

  for (const agent of currentSheet.plan.agents) {
    assertNotAborted(signal);
    const runIndex = currentSheet.runs.findIndex((run) => run.agentId === agent.agentId);
    if (runIndex < 0) continue;
    const existingRun = currentSheet.runs[runIndex];
    if (existingRun?.status === 'completed') {
      continue;
    }
    let run = {
      ...existingRun,
      status: 'running',
      startedAt: new Date().toISOString(),
      progressSummary: '开始执行',
      progressPercent: 5,
    };
    currentSheet = updateAgentRun(currentSheet, runIndex, run);
    onSheetUpdate?.(currentSheet);
    emit('agent_started', { agentId: agent.agentId, run });

    const reportAgentProgress = (progress = {}) => {
      const summary = String(progress.progressSummary || progress.summary || run.progressSummary || '执行中');
      const percent = Number.isFinite(Number(progress.progressPercent))
        ? Number(progress.progressPercent)
        : run.progressPercent;
      run = {
        ...run,
        progressSummary: summary,
        progressPercent: Math.max(run.progressPercent || 0, Math.min(99, percent || 0)),
      };
      currentSheet = updateAgentRun(currentSheet, runIndex, run);
      onSheetUpdate?.(currentSheet);
      emit('agent_progress', {
        agentId: agent.agentId,
        progressSummary: run.progressSummary,
        progressPercent: run.progressPercent,
        phase: progress.phase,
        detail: progress.detail,
        model: progress.model,
      });
    };

    for (const step of [
      ['开始读取上游产物', 8],
      ['正在生成结构化产物', 48],
      ['正在整理交付摘要', 88],
    ]) {
      await wait(520, signal);
      run = {
        ...run,
        progressSummary: step[0],
        progressPercent: step[1],
      };
      currentSheet = updateAgentRun(currentSheet, runIndex, run);
      onSheetUpdate?.(currentSheet);
      emit('agent_progress', {
        agentId: agent.agentId,
        progressSummary: step[0],
        progressPercent: step[1],
      });
    }

    await wait(360, signal);
    let artifact;
    try {
      artifact = await createArtifactForAgent(agent.agentId, agent.displayName, {
        ...ctx,
        sourceText: ctx.sourceText,
        agent,
        artifacts: currentSheet.artifacts || {},
        onProgress: reportAgentProgress,
      });
    } catch (error) {
      const reason = error?.message || String(error);
      run = {
        ...run,
        status: 'failed',
        completedAt: new Date().toISOString(),
        durationMs: run.startedAt ? Date.now() - new Date(run.startedAt).getTime() : undefined,
        progressSummary: reason,
        progressPercent: run.progressPercent || 88,
        error: reason,
      };
      currentSheet = {
        ...updateAgentRun(currentSheet, runIndex, run),
        overallStatus: 'failed',
        updatedAt: new Date().toISOString(),
      };
      onSheetUpdate?.(currentSheet);
      emit('agent_failed', { agentId: agent.agentId, run, error: reason });
      error.sheet = currentSheet;
      throw error;
    }
    const completedAt = new Date().toISOString();
    run = {
      ...run,
      status: 'completed',
      completedAt,
      durationMs: run.startedAt ? new Date(completedAt).getTime() - new Date(run.startedAt).getTime() : undefined,
      progressSummary: '已生成产物',
      progressPercent: 100,
      outputArtifactIds: [artifact.artifactId],
    };
    currentSheet = {
      ...updateAgentRun(currentSheet, runIndex, run),
      artifacts: {
        ...currentSheet.artifacts,
        [artifact.artifactId]: artifact,
      },
      updatedAt: completedAt,
    };
    onSheetUpdate?.(currentSheet);
    emit('artifact_created', { agentId: agent.agentId, artifact, run });
    if (currentSheet.taskId) {
      try {
        runRegistry.updateRun(currentSheet.taskId, { sheet: currentSheet });
      } catch {}
    }

    const gate = currentSheet.gates.find((item) => item.afterAgentId === agent.agentId && item.status === 'pending');
    if (gate) {
      emit('gate_reached', { gate });
      await wait(500, signal);
      const approvedGate = { ...gate, status: 'approved', relatedArtifactId: artifact.artifactId };
      currentSheet = {
        ...currentSheet,
        gates: currentSheet.gates.map((item) => (item.gateId === gate.gateId ? approvedGate : item)),
        updatedAt: new Date().toISOString(),
      };
      onSheetUpdate?.(currentSheet);
      emit('gate_updated', { gate: approvedGate });
    }
  }

  assertNotAborted(signal);
  currentSheet = { ...currentSheet, overallStatus: 'completed', updatedAt: new Date().toISOString() };
  onSheetUpdate?.(currentSheet);
  emit('all_completed', { sheet: currentSheet });
  return currentSheet;
}

function updateAgentRun(sheet, runIndex, run) {
  return {
    ...sheet,
    runs: sheet.runs.map((item, index) => (index === runIndex ? run : item)),
    updatedAt: new Date().toISOString(),
  };
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError(signal.reason));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(timer);
      reject(createAbortError(signal.reason));
    }, { once: true });
  });
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw createAbortError(signal.reason);
}

function createAbortError(reason) {
  const error = new Error(String(reason || 'cancelled_by_user'));
  error.name = 'AbortError';
  return error;
}

module.exports = {
  runChapterAgentPipeline,
};
