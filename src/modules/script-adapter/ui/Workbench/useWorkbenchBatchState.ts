import { useEffect, useRef, useState } from 'react';
import {
  getGatewayBatchStatus,
  listGatewayBatches,
  subscribeGatewayBatch,
  subscribeGatewayBatchEvents,
} from '../../services/gatewayBatch';
import type { BatchJob, ChapterRunRecord } from '../../types/batch';

export function useWorkbenchBatchState() {
  const [batchHistory, setBatchHistory] = useState<BatchJob[]>([]);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [currentBatch, setCurrentBatch] = useState<BatchJob | null>(null);
  const [currentBatchRuns, setCurrentBatchRuns] = useState<ChapterRunRecord[]>([]);
  const currentBatchIdRef = useRef<string | null>(currentBatchId);
  currentBatchIdRef.current = currentBatchId;

  const refreshBatchHistory = async (preferBatchId?: string | null) => {
    const result = await listGatewayBatches(12);
    if (!result.success) return;
    const nextBatches = result.batches || [];
    setBatchHistory(nextBatches);
    const runningBatch = nextBatches.find((item) => item.status === 'running' || item.status === 'paused') ?? null;
    setCurrentBatchId(preferBatchId || currentBatchIdRef.current || runningBatch?.id || null);
  };

  const loadBatchStatus = async (batchId: string) => {
    const result = await getGatewayBatchStatus(batchId);
    if (!result.success) return;
    setCurrentBatch(result.batch || null);
    setCurrentBatchRuns(result.chapterRuns || []);
  };

  useEffect(() => {
    void refreshBatchHistory();
  }, []);

  useEffect(() => {
    if (!currentBatchId) {
      setCurrentBatch(null);
      setCurrentBatchRuns([]);
      return;
    }
    void subscribeGatewayBatch(currentBatchId);
    void loadBatchStatus(currentBatchId);
  }, [currentBatchId]);

  useEffect(() => {
    const unsubscribe = subscribeGatewayBatchEvents((event) => {
      if (event.event === 'batch_created') {
        void refreshBatchHistory(event.batchId);
      }
      if (currentBatchIdRef.current === event.batchId) {
        void loadBatchStatus(event.batchId);
      }
      if (event.event === 'batch_completed' || event.event === 'batch_cancelled' || event.event === 'batch_failed') {
        void refreshBatchHistory(event.batchId);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!currentBatchId) return;
    const timer = window.setInterval(() => {
      void loadBatchStatus(currentBatchId);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [currentBatchId]);

  return {
    batchHistory,
    currentBatchId,
    setCurrentBatchId,
    currentBatch,
    currentBatchRuns,
    currentBatchIdRef,
    refreshBatchHistory,
    loadBatchStatus,
  };
}
