import { useEffect, useRef, useState } from 'react';
import {
  getGatewayBatchStatus,
  listGatewayBatches,
  subscribeGatewayBatch,
  subscribeGatewayBatchEvents,
  type ScriptAdapterBatchEvent,
} from '../../services/gatewayBatch';
import type { BatchActivityEntry, BatchJob, ChapterRunRecord } from '../../types/batch';

interface UseWorkbenchBatchStateOptions {
  autoResumeActiveBatch?: boolean;
  preferredBatchId?: string | null;
  onCurrentBatchIdChange?: (batchId: string | null) => void;
}

export function useWorkbenchBatchState(options: UseWorkbenchBatchStateOptions = {}) {
  const {
    autoResumeActiveBatch = true,
    preferredBatchId = null,
    onCurrentBatchIdChange,
  } = options;
  const [batchHistory, setBatchHistory] = useState<BatchJob[]>([]);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(() => preferredBatchId);
  const [currentBatch, setCurrentBatch] = useState<BatchJob | null>(null);
  const [currentBatchRuns, setCurrentBatchRuns] = useState<ChapterRunRecord[]>([]);
  const [batchActivity, setBatchActivity] = useState<BatchActivityEntry[]>([]);
  const [lastBatchEventAt, setLastBatchEventAt] = useState<string | null>(null);
  const currentBatchIdRef = useRef<string | null>(currentBatchId);
  currentBatchIdRef.current = currentBatchId;

  const refreshBatchHistory = async (preferBatchId?: string | null) => {
    const result = await listGatewayBatches(12);
    if (!result.success) return;
    const nextBatches = result.batches || [];
    setBatchHistory(nextBatches);
    const runningBatch = autoResumeActiveBatch
      ? nextBatches.find((item) => item.status === 'running' || item.status === 'paused') ?? null
      : null;
    const rememberedBatchId = preferBatchId || currentBatchIdRef.current || preferredBatchId || null;
    const rememberedExists = rememberedBatchId
      ? nextBatches.some((item) => item.id === rememberedBatchId)
      : false;
    setCurrentBatchId(rememberedExists ? rememberedBatchId : runningBatch?.id || null);
  };

  const loadBatchStatus = async (batchId: string) => {
    const result = await getGatewayBatchStatus(batchId);
    if (!result.success) return;
    setCurrentBatch(result.batch || null);
    setCurrentBatchRuns(result.chapterRuns || []);
  };

  useEffect(() => {
    void refreshBatchHistory();
  }, [autoResumeActiveBatch, preferredBatchId]);

  useEffect(() => {
    if (!preferredBatchId || currentBatchIdRef.current) return;
    setCurrentBatchId(preferredBatchId);
  }, [preferredBatchId]);

  useEffect(() => {
    onCurrentBatchIdChange?.(currentBatchId);
  }, [currentBatchId, onCurrentBatchIdChange]);

  useEffect(() => {
    if (!currentBatchId) {
      setCurrentBatch(null);
      setCurrentBatchRuns([]);
      setBatchActivity([]);
      setLastBatchEventAt(null);
      return;
    }
    void subscribeGatewayBatch(currentBatchId);
    void loadBatchStatus(currentBatchId);
  }, [currentBatchId]);

  useEffect(() => {
    const unsubscribe = subscribeGatewayBatchEvents((event) => {
      appendBatchActivity(event);
      if (event.event === 'batch_created') {
        void refreshBatchHistory(event.batchId);
      }
      if (currentBatchIdRef.current === event.batchId) {
        void loadBatchStatus(event.batchId);
      }
      if (event.event === 'batch_completed' || event.event === 'batch_cancelled' || event.event === 'batch_failed' || event.event === 'batch_paused') {
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
    batchActivity,
    lastBatchEventAt,
  };

  function appendBatchActivity(event: ScriptAdapterBatchEvent) {
    const entry = toActivityEntry(event);
    if (!entry) return;
    setLastBatchEventAt(entry.createdAt);
    setBatchActivity((current) => [entry, ...current].slice(0, 30));
  }
}

function toActivityEntry(event: ScriptAdapterBatchEvent): BatchActivityEntry | null {
  const createdAt = new Date().toISOString();
  const chapterIndex = 'chapterIndex' in event ? event.chapterIndex : undefined;
  const chapter = typeof chapterIndex === 'number' ? `第 ${chapterIndex + 1} 章` : '';
  const base = {
    id: `${event.batchId}-${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
    batchId: event.batchId,
    event: event.event,
    chapterIndex,
    runId: 'runId' in event ? event.runId : undefined,
    agentId: 'agentId' in event ? event.agentId : undefined,
    createdAt,
  };

  if (event.event === 'batch_created') return { ...base, title: '批次已创建', detail: event.batch.bookTitle };
  if (event.event === 'chapter_started') return { ...base, title: `${chapter} 开始制作`, detail: event.chapterTitle };
  if (event.event === 'agent_started') return { ...base, title: `${chapter} Agent 启动`, detail: labelAgent(event.agentId) };
  if (event.event === 'chapter_progress') {
    return {
      ...base,
      title: event.progressSummary || `${chapter} 正在推进`,
      detail: [labelAgent(event.agentId), event.phase, event.detail, event.model].filter(Boolean).join(' · '),
      progressPercent: event.progressPercent,
    };
  }
  if (event.event === 'artifact_created') return { ...base, title: `${chapter} 已生成产物`, detail: labelAgent(event.agentId) };
  if (event.event === 'gate_reached') return { ...base, title: `${chapter} 到达确认点`, detail: '等待人工确认' };
  if (event.event === 'gate_updated') return { ...base, title: `${chapter} 确认点已通过` };
  if (event.event === 'chapter_awaiting_review') return { ...base, title: `${chapter} 等待人工审核`, detail: '请展开章节产物并选择通过或退回' };
  if (event.event === 'chapter_completed') return { ...base, title: `${chapter} 制作完成` };
  if (event.event === 'chapter_failed') return { ...base, title: `${chapter} 制作失败`, detail: event.error };
  if (event.event === 'batch_paused') return { ...base, title: '批次已暂停', detail: event.error === 'one_or_more_chapters_failed' ? '有章节失败，等待修复后重跑' : event.error };
  if (event.event === 'agent_failed') return { ...base, title: `${chapter} Agent 失败`, detail: event.error };
  if (event.event === 'batch_completed') return { ...base, title: '批次完成' };
  if (event.event === 'batch_cancelled') return { ...base, title: '批次已取消' };
  if (event.event === 'batch_failed') return { ...base, title: '批次失败', detail: event.error };
  return null;
}

function labelAgent(agentId?: string) {
  if (!agentId) return '';
  if (agentId.includes('text_rewriter')) return '文本改编师';
  if (agentId.includes('voice_role_marker')) return '角色音统筹';
  if (agentId.includes('performance_audio')) return '演播设计师';
  if (agentId.includes('production_quality')) return '质检审校';
  if (agentId.includes('content_delivery')) return '交付打包员';
  return agentId;
}
