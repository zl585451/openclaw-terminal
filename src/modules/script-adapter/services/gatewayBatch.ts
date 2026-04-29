import type { BatchEstimate, BatchJob, ChapterRunRecord, DeliveryOptions, TrialExecutionMode } from '../types/batch';

export type ScriptAdapterBatchEvent =
  | { event: 'batch_created'; batchId: string; batch: BatchJob; chapterRuns: ChapterRunRecord[] }
  | { event: 'chapter_started'; batchId: string; chapterIndex: number; runId: string; chapterTitle?: string }
  | { event: 'chapter_progress'; batchId: string; chapterIndex: number; runId: string; agentId: string; progressSummary: string; progressPercent: number }
  | { event: 'chapter_completed'; batchId: string; chapterIndex: number; runId: string; sheet: unknown }
  | { event: 'gate_reached'; batchId: string; chapterIndex: number; runId: string; gate: unknown }
  | { event: 'chapter_failed'; batchId: string; chapterIndex: number; runId: string; error: string }
  | { event: 'batch_completed'; batchId: string; batch?: BatchJob }
  | { event: 'batch_cancelled'; batchId: string; batch?: BatchJob }
  | { event: 'batch_failed'; batchId: string; error: string };

export async function startGatewayBatch(payload: {
  bookId: string;
  bookTitle: string;
  chapterIndices: number[];
  estimate: BatchEstimate;
  config: {
    executionMode: TrialExecutionMode;
    realAgents: 'off' | 'all' | string[];
    includePerformanceDesign: boolean;
    deliveryOptions: DeliveryOptions;
  };
}) {
  if (!window.electronAPI?.scriptAdapterBatch?.start) {
    return { success: false, error: '当前环境未暴露批次执行入口' };
  }
  return window.electronAPI.scriptAdapterBatch.start(payload);
}

export async function getGatewayBatchStatus(batchId: string): Promise<{ success: boolean; batch?: BatchJob; chapterRuns?: ChapterRunRecord[]; error?: string }> {
  if (!window.electronAPI?.scriptAdapterBatch?.status) {
    return { success: false, error: '当前环境未暴露批次状态入口' };
  }
  return window.electronAPI.scriptAdapterBatch.status(batchId) as Promise<{ success: boolean; batch?: BatchJob; chapterRuns?: ChapterRunRecord[]; error?: string }>;
}

export async function listGatewayBatches(limit = 20) {
  if (!window.electronAPI?.scriptAdapterBatch?.list) {
    return { success: false, error: '当前环境未暴露批次历史入口', batches: [] as BatchJob[] };
  }
  return window.electronAPI.scriptAdapterBatch.list({ limit }) as Promise<{ success: boolean; batches?: BatchJob[]; error?: string }>;
}

export async function cancelGatewayBatch(batchId: string) {
  if (!window.electronAPI?.scriptAdapterBatch?.cancel) {
    return { success: false, error: '当前环境未暴露批次取消入口' };
  }
  return window.electronAPI.scriptAdapterBatch.cancel(batchId);
}

export async function subscribeGatewayBatch(batchId: string) {
  if (!window.electronAPI?.scriptAdapterBatch?.subscribe) {
    return { success: false, error: '当前环境未暴露批次订阅入口' };
  }
  try {
    return await window.electronAPI.scriptAdapterBatch.subscribe(batchId);
  } catch {
    return { success: false, error: 'batch_subscribe_failed' };
  }
}

export async function rerunGatewayBatchChapter(batchId: string, chapterIndex: number) {
  if (!window.electronAPI?.scriptAdapterBatch?.rerunChapter) {
    return { success: false, error: '当前环境未暴露批次重跑入口' };
  }
  return window.electronAPI.scriptAdapterBatch.rerunChapter(batchId, chapterIndex);
}

export async function approveGatewayGate(batchId: string, gateId: string, reviewerNote?: string) {
  if (!window.electronAPI?.scriptAdapterBatch?.approveGate) {
    return { success: false, error: '当前环境未暴露批准入口' };
  }
  return window.electronAPI.scriptAdapterBatch.approveGate(batchId, gateId, reviewerNote);
}

export async function rejectGatewayGate(batchId: string, gateId: string, reviewerNote?: string) {
  if (!window.electronAPI?.scriptAdapterBatch?.rejectGate) {
    return { success: false, error: '当前环境未暴露拒绝入口' };
  }
  return window.electronAPI.scriptAdapterBatch.rejectGate(batchId, gateId, reviewerNote);
}

export async function deleteGatewayBatch(batchId: string) {
  if (!window.electronAPI?.scriptAdapterBatch?.remove) {
    return { success: false, error: '当前环境未暴露批次删除入口' };
  }
  return window.electronAPI.scriptAdapterBatch.remove(batchId);
}

export function subscribeGatewayBatchEvents(callback: (event: ScriptAdapterBatchEvent) => void) {
  if (!window.electronAPI?.onScriptAdapterEvent) return () => {};
  return window.electronAPI.onScriptAdapterEvent((payload) => {
    if (!isBatchEvent(payload)) return;
    callback(payload);
  });
}

function isBatchEvent(payload: unknown): payload is ScriptAdapterBatchEvent {
  if (!payload || typeof payload !== 'object') return false;
  const event = (payload as { event?: unknown }).event;
  const batchId = (payload as { batchId?: unknown }).batchId;
  return typeof event === 'string' && typeof batchId === 'string';
}
