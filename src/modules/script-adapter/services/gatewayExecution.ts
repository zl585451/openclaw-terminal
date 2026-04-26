import type { AgentRun, ArtifactEnvelope, ReviewGate, TaskExecutionSheet } from '../types/execution';

export type ScriptAdapterGatewayEvent =
  | { event: 'sheet_created'; taskId: string; sheet: TaskExecutionSheet }
  | { event: 'agent_started'; taskId: string; agentId: string; run: AgentRun }
  | { event: 'agent_progress'; taskId: string; agentId: string; progressSummary: string; progressPercent: number }
  | { event: 'artifact_created'; taskId: string; agentId: string; artifact: ArtifactEnvelope; run: AgentRun }
  | { event: 'gate_reached'; taskId: string; gate: ReviewGate }
  | { event: 'gate_updated'; taskId: string; gate: ReviewGate }
  | { event: 'all_completed'; taskId: string; sheet: TaskExecutionSheet }
  | { event: 'run_failed'; taskId: string; error: string; sheet?: TaskExecutionSheet }
  | { event: 'run_cancelled'; taskId: string; error: string; sheet?: TaskExecutionSheet };

export interface StartGatewayExecutionPayload {
  taskId: string;
  taskTitle: string;
  source?: string;
  sourceText?: string;
}

export async function startGatewayExecution(payload: StartGatewayExecutionPayload) {
  if (!window.electronAPI?.startScriptAdapterRun) {
    return { success: false, error: '当前环境未暴露 Gateway 执行入口' };
  }

  try {
    return await window.electronAPI.startScriptAdapterRun({
      ...payload,
      useMock: true,
      sourceText: payload.sourceText,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gateway 执行入口调用失败',
    };
  }
}

export async function cancelGatewayExecution(taskId: string) {
  if (!window.electronAPI?.cancelScriptAdapterRun) {
    return { success: false, error: '当前环境未暴露 Gateway 取消入口' };
  }

  try {
    return await window.electronAPI.cancelScriptAdapterRun({
      taskId,
      reason: 'cancelled_by_user',
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gateway 取消入口调用失败',
    };
  }
}

export async function listGatewayExecutions() {
  if (!window.electronAPI?.listScriptAdapterRuns) {
    return { success: false, error: '当前环境未暴露 Gateway 运行列表入口', runs: [] };
  }

  try {
    return await window.electronAPI.listScriptAdapterRuns();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gateway 运行列表调用失败',
      runs: [],
    };
  }
}

export function subscribeGatewayExecutionEvents(callback: (event: ScriptAdapterGatewayEvent) => void) {
  if (!window.electronAPI?.onScriptAdapterEvent) {
    return () => {};
  }

  return window.electronAPI.onScriptAdapterEvent((payload) => {
    if (!isGatewayEvent(payload)) return;
    callback(payload);
  });
}

function isGatewayEvent(payload: unknown): payload is ScriptAdapterGatewayEvent {
  if (!payload || typeof payload !== 'object') return false;
  const event = (payload as { event?: unknown }).event;
  const taskId = (payload as { taskId?: unknown }).taskId;
  return typeof event === 'string' && typeof taskId === 'string';
}
