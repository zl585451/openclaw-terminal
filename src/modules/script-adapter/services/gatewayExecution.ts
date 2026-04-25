import type { AgentRun, ArtifactEnvelope, ReviewGate, TaskExecutionSheet } from '../types/execution';

export type ScriptAdapterGatewayEvent =
  | { event: 'sheet_created'; taskId: string; sheet: TaskExecutionSheet }
  | { event: 'agent_started'; taskId: string; agentId: string; run: AgentRun }
  | { event: 'agent_progress'; taskId: string; agentId: string; progressSummary: string; progressPercent: number }
  | { event: 'artifact_created'; taskId: string; agentId: string; artifact: ArtifactEnvelope; run: AgentRun }
  | { event: 'gate_reached'; taskId: string; gate: ReviewGate }
  | { event: 'gate_updated'; taskId: string; gate: ReviewGate }
  | { event: 'all_completed'; taskId: string; sheet: TaskExecutionSheet }
  | { event: 'run_failed'; taskId: string; error: string };

export interface StartGatewayExecutionPayload {
  taskId: string;
  taskTitle: string;
  source?: string;
}

export async function startGatewayExecution(payload: StartGatewayExecutionPayload) {
  if (!window.electronAPI?.startScriptAdapterRun) {
    return { success: false, error: '当前环境未暴露 Gateway 执行入口' };
  }

  try {
    return await window.electronAPI.startScriptAdapterRun({
      ...payload,
      useMock: true,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gateway 执行入口调用失败',
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
