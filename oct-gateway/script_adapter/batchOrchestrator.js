'use strict';

const config = require('../config');
const persistence = require('./persistence');
const connectionRegistry = require('./connectionRegistry');
const { createBatchScriptAdapterEmitter } = require('./eventEmitter');
const { createExecutionPlan, runSingleScriptAdapterChapter } = require('./chapterPipeline');

const activeBatches = new Map();

persistence.ensureSchema();
persistence.recoverInterruptedRuns();
recoverInterruptedBatches();

async function startBatch(params = {}, connection, logger) {
  const bookId = String(params.bookId || '').trim();
  const chapterIndices = Array.isArray(params.chapterIndices)
    ? [...new Set(params.chapterIndices.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0))].sort((a, b) => a - b)
    : [];
  if (!bookId) return { success: false, error: 'bookId required' };
  if (chapterIndices.length === 0) return { success: false, error: 'chapterIndices required' };

  const book = await fetchBook(bookId);
  const chapters = await fetchChapters(bookId);
  const selectedChapters = chapterIndices.map((index) => chapters.find((chapter) => chapter.chapter_index === index)).filter(Boolean);
  if (selectedChapters.length === 0) {
    return { success: false, error: '未找到可执行章节' };
  }

  const now = new Date().toISOString();
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  connectionRegistry.subscribe(batchId, connection);
  const deliveryOptions = {
    adaptedScript: true,
    voiceRegistry: params?.config?.deliveryOptions?.voiceRegistry !== false,
    qualityReview: params?.config?.deliveryOptions?.qualityReview !== false,
    cvDirections: params?.config?.deliveryOptions?.cvDirections === true,
    bgmSfx: params?.config?.deliveryOptions?.bgmSfx === true,
    finalPackage: true,
  };
  const includePerformanceDesign = deliveryOptions.cvDirections || deliveryOptions.bgmSfx;
  const batchRecord = persistence.createBatch({
    id: batchId,
    bookId,
    bookTitle: String(book?.title || params?.bookTitle || bookId),
    selectedChapterIndices: chapterIndices,
    status: 'pending',
    totalChapters: chapterIndices.length,
    createdAt: now,
    updatedAt: now,
    estimatedCost: Number(params?.estimate?.estimatedCostCny || params?.config?.estimatedCost || 0) || 0,
    actualCost: 0,
    config: {
      executionMode: params?.config?.executionMode === 'real' ? 'real' : 'mock',
      realAgents: params?.config?.realAgents || 'off',
      includePerformanceDesign,
      deliveryOptions,
      budget: params?.estimate || null,
      sharedContext: { voiceRegistry: [], lastUpdatedAtChapter: null },
    },
    chapterRuns: selectedChapters.map((chapter) => ({
      id: `run-${batchId}-${chapter.chapter_index}-a1`,
      chapterIndex: chapter.chapter_index,
      chapterTitle: chapter.title || `第 ${chapter.chapter_index + 1} 章`,
      sourceChars: chapter.char_count || null,
      status: 'pending',
      attempt: 1,
    })),
  });

  const emit = createBatchScriptAdapterEmitter(batchId);
  emit('batch_created', batchRecord);
  void runBatchLoop(batchId, connection, logger);
  return { success: true, batchId };
}

async function runBatchLoop(batchId, connection, logger) {
  if (activeBatches.has(batchId)) return;
  const controller = new AbortController();
  activeBatches.set(batchId, { abortController: controller });
  const emit = createBatchScriptAdapterEmitter(batchId);

  try {
    let snapshot = persistence.getBatch(batchId);
    if (!snapshot) throw new Error('batch_not_found');
    persistence.updateBatch(batchId, {
      status: 'running',
      startedAt: snapshot.batch.startedAt || new Date().toISOString(),
      completedAt: null,
    });

    while (!controller.signal.aborted) {
      snapshot = persistence.getBatch(batchId);
      if (!snapshot) break;
      if (snapshot.chapterRuns.some((run) => run.status === 'awaiting_review')) break;
      const nextChapterIndex = persistence.findNextPendingChapter(batchId);
      if (nextChapterIndex == null) break;
      await executeChapter(snapshot.batch, nextChapterIndex, emit, controller.signal, logger);
      await sleep(isRealAgentsEnabled(snapshot.batch) ? 1200 : 150, controller.signal).catch(() => {});
    }

      const finalSnapshot = persistence.getBatch(batchId);
      if (finalSnapshot) {
        const pendingLeft = finalSnapshot.chapterRuns.some((run) => run.status === 'pending');
        const awaitingReview = finalSnapshot.chapterRuns.some((run) => run.status === 'awaiting_review');
        const nextStatus = controller.signal.aborted
          ? 'cancelled'
          : awaitingReview || pendingLeft
          ? 'paused'
          : finalSnapshot.batch.failedChapters > 0
            ? 'completed'
            : 'completed';
      persistence.updateBatch(batchId, {
        status: nextStatus,
        completedAt: controller.signal.aborted || !pendingLeft ? new Date().toISOString() : null,
      });
      emit(nextStatus === 'cancelled' ? 'batch_cancelled' : 'batch_completed', {
        batch: persistence.getBatch(batchId)?.batch,
      });
    }
  } catch (error) {
    logger?.error?.('script adapter batch failed', {
      batchId,
      error: error instanceof Error ? error.message : String(error),
    });
    persistence.updateBatch(batchId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
    });
    emit('batch_failed', { error: error instanceof Error ? error.message : String(error) });
  } finally {
    activeBatches.delete(batchId);
  }
}

async function executeChapter(batch, chapterIndex, emit, signal, logger) {
  const chapterRun = persistence.getChapterRun(batch.id, chapterIndex);
  if (!chapterRun) throw new Error(`chapter_run_missing:${chapterIndex}`);
  const chapterData = await fetchChapter(batch.bookId, chapterIndex);
  const startedAt = new Date().toISOString();
  persistence.updateChapterRun(chapterRun.id, {
    status: 'running',
    startedAt,
    chapterTitle: chapterData?.chapter?.title || chapterRun.chapterTitle,
    sourceChars: chapterData?.text?.length || chapterRun.sourceChars || null,
    errorMessage: null,
  });
  emit('chapter_started', {
    chapterIndex,
    runId: chapterRun.id,
    chapterTitle: chapterData?.chapter?.title || chapterRun.chapterTitle,
  });

  try {
    const sheet = chapterRun.sheet || createExecutionPlan(
      chapterRun.id,
      `《${batch.bookTitle}》第 ${chapterIndex + 1} 章`,
      {
        includePerformanceDesign: batch.config?.includePerformanceDesign !== false,
        deliveryOptions: batch.config?.deliveryOptions || {},
      },
    );
    const completedSheet = await runSingleScriptAdapterChapter({
      sheet,
      sourceText: chapterData.text,
      signal,
      ctx: {
        sourceText: chapterData.text,
        realAgentsOverride: batch.config?.realAgents || 'off',
        deliveryOptions: batch.config?.deliveryOptions || {},
        sharedVoiceRegistry: batch.config?.sharedContext?.voiceRegistry || [],
        haltOnPendingQualityGate: true,
      },
      onProgress: (payload) => {
        emit('chapter_progress', {
          chapterIndex,
          runId: chapterRun.id,
          ...payload,
        });
      },
    });
    const normalizedSheet = applyLockedVoiceRegistry(completedSheet, batch);
    const durationMs = Date.now() - new Date(startedAt).getTime();
    const chapterCost = estimateChapterCost(batch);
    persistence.updateChapterRun(chapterRun.id, {
      status: 'completed',
      sheet: normalizedSheet,
      completedAt: new Date().toISOString(),
      durationMs,
      cost: chapterCost,
      pendingGateId: null,
      pendingGateType: null,
    });
    const pendingGate = findPendingGateAfterAgent(normalizedSheet);
    if (pendingGate) {
      persistence.createGateDecision({
        gateId: pendingGate.gateId,
        batchId: batch.id,
        chapterRunId: chapterRun.id,
        gateType: pendingGate.gateType,
      });
      persistence.updateChapterRun(chapterRun.id, {
        status: 'awaiting_review',
        sheet: normalizedSheet,
        pendingGateId: pendingGate.gateId,
        pendingGateType: pendingGate.gateType,
        completedAt: null,
      });
      persistence.updateBatch(batch.id, {
        status: 'paused',
        completedAt: null,
      });
      emit('gate_reached', {
        chapterIndex,
        runId: chapterRun.id,
        gate: pendingGate,
      });
      return;
    }
    updateSharedContext(batch.id, chapterIndex, normalizedSheet);
    emit('chapter_completed', {
      chapterIndex,
      runId: chapterRun.id,
      sheet: normalizedSheet,
    });
  } catch (error) {
    logger?.warn?.('script adapter chapter failed', {
      batchId: batch.id,
      chapterIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    persistence.updateChapterRun(chapterRun.id, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - new Date(startedAt).getTime(),
    });
    emit('chapter_failed', {
      chapterIndex,
      runId: chapterRun.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function getBatchStatus(batchId) {
  const snapshot = persistence.getBatch(batchId);
  if (!snapshot) return { success: false, error: 'batch_not_found' };
  return { success: true, ...snapshot };
}

function listBatches(params = {}) {
  return {
    success: true,
    batches: persistence.listBatches(Number(params.limit) || 20, Number(params.offset) || 0),
  };
}

function cancelBatch(batchId) {
  const active = activeBatches.get(String(batchId || ''));
  if (active?.abortController) {
    active.abortController.abort('cancelled_by_user');
  }
  persistence.updateBatch(String(batchId || ''), {
    status: 'cancelled',
    completedAt: new Date().toISOString(),
  });
  return { success: true };
}

function rerunChapter(params = {}, connection, logger) {
  const batchId = String(params.batchId || '').trim();
  const chapterIndex = Number(params.chapterIndex);
  if (!batchId || !Number.isInteger(chapterIndex)) {
    return { success: false, error: 'batchId and chapterIndex required' };
  }
  const run = persistence.rerunChapter(batchId, chapterIndex);
  if (!run) return { success: false, error: 'chapter_run_not_found' };
  const snapshot = persistence.getBatch(batchId);
  if (!snapshot) return { success: false, error: 'batch_not_found' };
  persistence.updateBatch(batchId, {
    status: activeBatches.has(batchId) ? 'running' : snapshot.batch.completedChapters > 0 ? 'paused' : 'pending',
    completedAt: null,
  });
  if (!activeBatches.has(batchId)) {
    void runBatchLoop(batchId, connection, logger);
  }
  return { success: true, chapterRun: run };
}

function deleteBatch(batchId) {
  if (activeBatches.has(String(batchId || ''))) {
    return { success: false, error: 'batch_running' };
  }
  return persistence.deleteBatch(batchId);
}

function recoverInterruptedBatches() {
  for (const batch of persistence.listRunningBatches()) {
    persistence.updateBatch(batch.id, {
      status: 'paused',
      completedAt: null,
    });
  }
}

function approveGate(params = {}, connection, logger) {
  const batchId = String(params.batchId || '').trim();
  const gateId = String(params.gateId || '').trim();
  const reviewerNote = String(params.reviewerNote || '').trim();
  if (!batchId || !gateId) {
    return { success: false, error: 'batchId and gateId required' };
  }

  persistence.resolveGateDecision(gateId, { status: 'approved', reviewerNote });
  const snapshot = persistence.getBatch(batchId);
  const run = snapshot?.chapterRuns?.find((item) => item.pendingGateId === gateId);
  if (!snapshot || !run) {
    return { success: false, error: 'gate_not_found' };
  }

  persistence.updateChapterRun(run.id, {
    status: 'pending',
    sheet: updateGateStatus(run.sheet, gateId, 'approved', reviewerNote),
    pendingGateId: null,
    pendingGateType: null,
    errorMessage: null,
    completedAt: null,
  });
  persistence.updateBatch(batchId, {
    status: activeBatches.has(batchId) ? 'running' : 'paused',
    completedAt: null,
  });
  if (!activeBatches.has(batchId)) {
    void runBatchLoop(batchId, connection, logger);
  }
  return { success: true, approved: true, gateId };
}

function rejectGate(params = {}) {
  const batchId = String(params.batchId || '').trim();
  const gateId = String(params.gateId || '').trim();
  const reviewerNote = String(params.reviewerNote || '').trim();
  if (!batchId || !gateId) {
    return { success: false, error: 'batchId and gateId required' };
  }

  persistence.resolveGateDecision(gateId, { status: 'rejected', reviewerNote });
  const snapshot = persistence.getBatch(batchId);
  const run = snapshot?.chapterRuns?.find((item) => item.pendingGateId === gateId);
  if (!snapshot || !run) {
    return { success: false, error: 'gate_not_found' };
  }

  persistence.updateChapterRun(run.id, {
    status: 'failed',
    sheet: updateGateStatus(run.sheet, gateId, 'rejected', reviewerNote),
    errorMessage: `Gate rejected: ${reviewerNote || '人工拒绝'}`,
    pendingGateId: null,
    pendingGateType: null,
    completedAt: new Date().toISOString(),
  });
  return { success: true, rejected: true, gateId };
}

async function fetchBook(bookId) {
  const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}`);
  return payload?.book || payload || null;
}

async function fetchChapters(bookId) {
  const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}/chapters`);
  return Array.isArray(payload?.chapters) ? payload.chapters : [];
}

async function fetchChapter(bookId, chapterIndex) {
  const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}/chapter/${chapterIndex}`);
  return {
    chapter: payload?.chapter || null,
    text: String(payload?.text || ''),
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI_LIBRARY_HTTP_${response.status}:${body.slice(0, 120)}`);
  }
  return response.json();
}

function getAiLibraryBase() {
  return String((config.ai_library && config.ai_library.url) || config.AI_LIBRARY_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
}

function applyLockedVoiceRegistry(sheet, batch) {
  const voiceArtifact = Object.values(sheet.artifacts || {}).find((item) => item?.artifactType === 'voice_registry');
  if (!voiceArtifact || !Array.isArray(voiceArtifact.payload?.registry)) return sheet;
  const locked = Array.isArray(batch.config?.sharedContext?.voiceRegistry)
    ? batch.config.sharedContext.voiceRegistry
    : [];
  if (locked.length === 0) return sheet;
  const lockedMap = new Map(locked.map((item) => [String(item.roleName || '').trim(), item]));
  const nextRegistry = voiceArtifact.payload.registry.map((item) => {
    const key = String(item.roleName || '').trim();
    const matched = lockedMap.get(key);
    if (!matched) return item;
    return {
      ...item,
      category: matched.category || item.category,
      voiceHint: matched.voiceHint || item.voiceHint,
    };
  });
  return {
    ...sheet,
    artifacts: {
      ...sheet.artifacts,
      [voiceArtifact.artifactId]: {
        ...voiceArtifact,
        payload: {
          ...voiceArtifact.payload,
          registry: nextRegistry,
          unresolved: nextRegistry.filter((item) => item.category === 'unresolved').map((item) => item.roleName),
        },
      },
    },
  };
}

function updateSharedContext(batchId, chapterIndex, sheet) {
  const snapshot = persistence.getBatch(batchId);
  if (!snapshot) return;
  const voiceArtifact = Object.values(sheet.artifacts || {}).find((item) => item?.artifactType === 'voice_registry');
  const registry = Array.isArray(voiceArtifact?.payload?.registry) ? voiceArtifact.payload.registry : [];
  const merged = mergeVoiceRegistry(snapshot.batch.config?.sharedContext?.voiceRegistry || [], registry);
  persistence.updateBatch(batchId, {
    config: {
      ...snapshot.batch.config,
      sharedContext: {
        voiceRegistry: merged,
        lastUpdatedAtChapter: chapterIndex,
      },
    },
  });
}

function mergeVoiceRegistry(existing, incoming) {
  const map = new Map();
  for (const item of existing || []) {
    const key = String(item.roleName || '').trim();
    if (!key) continue;
    map.set(key, { ...item, appearanceCount: Number(item.appearanceCount || 0) });
  }
  for (const item of incoming || []) {
    const key = String(item.roleName || '').trim();
    if (!key) continue;
    const prev = map.get(key);
    if (prev) {
      prev.appearanceCount += Number(item.appearanceCount || 0);
    } else {
      map.set(key, {
        roleName: key,
        category: item.category,
        voiceHint: item.voiceHint,
        appearanceCount: Number(item.appearanceCount || 0),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => Number(b.appearanceCount || 0) - Number(a.appearanceCount || 0));
}

function estimateChapterCost(batch) {
  const total = Number(batch.estimatedCost || 0);
  const count = Math.max(1, Number(batch.totalChapters || 1));
  return Number((total / count).toFixed(4));
}

function findPendingGateAfterAgent(sheet) {
  if (!sheet || !Array.isArray(sheet.gates)) return null;
  return sheet.gates.find(
    (gate) => gate.status === 'pending' && gate.gateType === 'quality_review',
  ) || null;
}

function updateGateStatus(sheet, gateId, status, reviewerNote) {
  if (!sheet || !Array.isArray(sheet.gates)) return sheet;
  return {
    ...sheet,
    gates: sheet.gates.map((gate) => (
      gate.gateId === gateId
        ? {
          ...gate,
          status,
          reviewerNote: reviewerNote || gate.reviewerNote || '',
        }
        : gate
    )),
    updatedAt: new Date().toISOString(),
  };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  });
}

function isRealAgentsEnabled(batch) {
  const raw = String(batch?.config?.realAgents || config.getEnvOrConfig?.('SCRIPT_ADAPTER_REAL_AGENTS') || config.scriptAdapter?.realAgents || '').trim().toLowerCase();
  return Boolean(raw && !['0', 'false', 'off'].includes(raw));
}

module.exports = {
  startBatch,
  getBatchStatus,
  listBatches,
  cancelBatch,
  approveGate,
  rejectGate,
  rerunChapter,
  deleteBatch,
};
