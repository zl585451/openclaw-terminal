import { ipcMain } from 'electron';
import type { IpcDeps } from '../types';

export function registerScriptAdapterHandlers(_deps: IpcDeps) {
  const sendRequest = (method: string, params: Record<string, unknown>) => {
    const fn = (globalThis as any).sendScriptAdapterRunRequest;
    return typeof fn === 'function' ? fn(method, params) : Promise.resolve({ success: false, error: 'sendScriptAdapterRunRequest not available' });
  };

  ipcMain.handle('script-adapter-run-start', (_event: unknown, payload: {
    taskId?: string;
    taskTitle?: string;
    source?: string;
    useMock?: boolean;
    sourceText?: string;
    config?: Record<string, unknown>;
  }) => {
    const taskId = String(payload?.taskId || `script-adapter-${Date.now()}`);
    return sendRequest('scriptAdapter.run.start', {
      taskId,
      taskTitle: String(payload?.taskTitle || '多人演播有声书样章'),
      source: String(payload?.source || 'content-workbench'),
      useMock: payload?.useMock !== false,
      sourceText: String(payload?.sourceText || ''),
      config: payload?.config || {},
    });
  });

  ipcMain.handle('script-adapter-run-cancel', (_event: unknown, payload: { taskId: string; reason?: string }) => {
    return sendRequest('scriptAdapter.run.cancel', {
      taskId: String(payload?.taskId || ''),
      reason: String(payload?.reason || 'cancelled_by_user'),
    });
  });

  ipcMain.handle('script-adapter-run-list', () => {
    return sendRequest('scriptAdapter.run.list', {});
  });

  ipcMain.handle('script-adapter-intake-start', (_event: unknown, payload: Record<string, unknown>) => {
    return sendRequest('scriptAdapter.intake.start', payload || {});
  });

  ipcMain.handle('script-adapter-analysis-start', (_event: unknown, payload: Record<string, unknown>) => {
    return sendRequest('scriptAdapter.analysis.start', payload || {});
  });

  ipcMain.handle('script-adapter-production-handoff', (_event: unknown, payload: Record<string, unknown>) => {
    return sendRequest('scriptAdapter.production.handoff', payload || {});
  });

  ipcMain.handle('script-adapter-batch-start', (_event: unknown, payload: {
    bookId: string;
    chapterIndices: number[];
    bookTitle?: string;
    config?: Record<string, unknown>;
    estimate?: Record<string, unknown>;
  }) => {
    return sendRequest('scriptAdapter.batch.start', {
      bookId: String(payload?.bookId || ''),
      chapterIndices: Array.isArray(payload?.chapterIndices) ? payload.chapterIndices : [],
      bookTitle: payload?.bookTitle ? String(payload.bookTitle) : undefined,
      config: payload?.config || {},
      estimate: payload?.estimate || {},
    });
  });

  ipcMain.handle('script-adapter-batch-status', (_event: unknown, payload: { batchId: string }) => {
    return sendRequest('scriptAdapter.batch.status', {
      batchId: String(payload?.batchId || ''),
    });
  });

  ipcMain.handle('script-adapter-batch-list', (_event: unknown, payload: { limit?: number; offset?: number } | undefined) => {
    return sendRequest('scriptAdapter.batch.list', {
      limit: Number(payload?.limit) > 0 ? Math.floor(Number(payload?.limit)) : 20,
      offset: Number(payload?.offset) >= 0 ? Math.floor(Number(payload?.offset)) : 0,
    });
  });

  ipcMain.handle('script-adapter-batch-cancel', (_event: unknown, payload: { batchId: string }) => {
    return sendRequest('scriptAdapter.batch.cancel', {
      batchId: String(payload?.batchId || ''),
    });
  });

  ipcMain.handle('script-adapter-batch-subscribe', (_event: unknown, batchId: string) => {
    return sendRequest('scriptAdapter.batch.subscribe', {
      batchId: String(batchId || ''),
    });
  });

  ipcMain.handle('script-adapter-batch-approve-gate', (_event: unknown, payload: { batchId: string; gateId: string; reviewerNote?: string }) => {
    return sendRequest('scriptAdapter.batch.approveGate', payload || {});
  });

  ipcMain.handle('script-adapter-batch-reject-gate', (_event: unknown, payload: { batchId: string; gateId: string; reviewerNote?: string }) => {
    return sendRequest('scriptAdapter.batch.rejectGate', payload || {});
  });

  ipcMain.handle('script-adapter-batch-apply-review-decision', (_event: unknown, payload: {
    batchId: string;
    gateId: string;
    segmentId: string;
    decision: { type: string; speaker?: string; note?: string };
  }) => {
    return sendRequest('scriptAdapter.batch.applyReviewDecision', payload || {});
  });

  ipcMain.handle('script-adapter-batch-rerun', (_event: unknown, payload: { batchId: string; chapterIndex: number }) => {
    return sendRequest('scriptAdapter.batch.rerunChapter', {
      batchId: String(payload?.batchId || ''),
      chapterIndex: Number(payload?.chapterIndex),
    });
  });

  ipcMain.handle('script-adapter-batch-delete', (_event: unknown, payload: { batchId: string }) => {
    return sendRequest('scriptAdapter.batch.delete', {
      batchId: String(payload?.batchId || ''),
    });
  });
}
