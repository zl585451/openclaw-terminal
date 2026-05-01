'use strict';

const config = require('../config');
const persistence = require('./persistence');
const connectionRegistry = require('./connectionRegistry');
const { createBatchScriptAdapterEmitter } = require('./eventEmitter');
const { createExecutionPlan, runSingleScriptAdapterChapter } = require('./chapterPipeline');

const activeBatches = new Map();

persistence.ensureSchema();
persistence.recoverInterruptedRuns();
const recoveredChapterRuns = persistence.recoverInterruptedChapterRuns();
if (recoveredChapterRuns.recovered > 0) {
  // Startup recovery: no active AbortController survives a Gateway restart.
  // Mark stale running chapters as failed so the UI can offer rerun instead of spinning forever.
  console.warn('[script_adapter] recovered interrupted chapter runs', recoveredChapterRuns);
}
recoverInterruptedBatches();
recoverLegacyAwaitingReviewBatches();
recoverCompletedBatchesWithFailures();

async function startBatch(params = {}, connection, logger) {
  const bookId = String(params.bookId || '').trim();
  const chapterIndices = Array.isArray(params.chapterIndices)
    ? [...new Set(params.chapterIndices.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0))].sort((a, b) => a - b)
    : [];
  if (!bookId) return { success: false, error: 'bookId required' };
  if (chapterIndices.length === 0) return { success: false, error: 'chapterIndices required' };

  const book = await fetchBook(bookId, params);
  const chapters = await fetchChapters(bookId, params);
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
      // 内联章节文本缓存：当 params.chapters[i].text 存在时，跳过 ai_library 章节内容请求
      inlineChapterTexts: Array.isArray(params?.chapters)
        ? Object.fromEntries(
            params.chapters
              .filter((chapter) => chapter.text)
              .map((chapter) => [
                typeof chapter.chapter_index === 'number' ? chapter.chapter_index : 0,
                String(chapter.text),
              ]),
          )
        : null,
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
      const nextChapterIndex = persistence.findNextPendingChapter(batchId);
      if (nextChapterIndex == null) break;
      await executeChapter(snapshot.batch, nextChapterIndex, emit, controller.signal, logger);
      await sleep(isRealAgentsEnabled(snapshot.batch) ? 1200 : 150, controller.signal).catch(() => {});
    }

    const finalSnapshot = persistence.getBatch(batchId);
    if (finalSnapshot) {
      const pendingLeft = finalSnapshot.chapterRuns.some((run) => run.status === 'pending');
      const failedLeft = finalSnapshot.chapterRuns.some((run) => run.status === 'failed');
      const nextStatus = controller.signal.aborted
        ? 'cancelled'
        : failedLeft
          ? 'failed'
          : pendingLeft
            ? 'paused'
            : 'completed';
      persistence.updateBatch(batchId, {
        status: nextStatus,
        completedAt: controller.signal.aborted || failedLeft || !pendingLeft ? new Date().toISOString() : null,
      });
      emit(nextStatus === 'cancelled' ? 'batch_cancelled' : nextStatus === 'failed' ? 'batch_failed' : 'batch_completed', {
        batch: persistence.getBatch(batchId)?.batch,
        error: failedLeft ? 'one_or_more_chapters_failed' : undefined,
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
  // 优先使用内联章节文本（绕过 ai_library 依赖）
  const inlineText = batch.config?.inlineChapterTexts?.[chapterIndex];
  const chapterData = inlineText
    ? { chapter: null, text: inlineText }
    : await fetchChapter(batch.bookId, chapterIndex);
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
      },
      onProgress: (payload) => {
        emit('chapter_progress', {
          chapterIndex,
          runId: chapterRun.id,
          ...payload,
        });
      },
    });
    assertNoMockArtifactsInRealBatch(completedSheet, batch);
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
    updateSharedContext(batch.id, chapterIndex, normalizedSheet);
    emit('chapter_completed', {
      chapterIndex,
      runId: chapterRun.id,
      sheet: normalizedSheet,
    });
  } catch (error) {
    const failedSheet = error?.sheet || null;
    logger?.warn?.('script adapter chapter failed', {
      batchId: batch.id,
      chapterIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    persistence.updateChapterRun(chapterRun.id, {
      status: 'failed',
      sheet: failedSheet || chapterRun.sheet || null,
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

function recoverLegacyAwaitingReviewBatches() {
  const runs = persistence.listAwaitingReviewRuns();
  const touchedBatchIds = new Set();
  for (const run of runs) {
    persistence.updateChapterRun(run.id, {
      status: 'completed',
      sheet: autoApproveQualityGates(run.sheet),
      pendingGateId: null,
      pendingGateType: null,
      errorMessage: null,
      completedAt: run.completedAt || new Date().toISOString(),
    });
    if (run.pendingGateId) {
      persistence.resolveGateDecision(run.pendingGateId, {
        status: 'approved',
        reviewerNote: 'auto_migrated_non_blocking_review',
      });
    }
    touchedBatchIds.add(run.batchId);
  }
  for (const batchId of touchedBatchIds) {
    const snapshot = persistence.getBatch(batchId);
    if (!snapshot) continue;
    const pendingLeft = snapshot.chapterRuns.some((item) => item.status === 'pending');
    persistence.updateBatch(batchId, {
      status: pendingLeft ? 'paused' : 'completed',
      completedAt: pendingLeft ? null : new Date().toISOString(),
    });
  }
}

function recoverCompletedBatchesWithFailures() {
  for (const batch of persistence.listCompletedBatchesWithFailures()) {
    persistence.updateBatch(batch.id, {
      status: 'failed',
      completedAt: batch.completedAt || new Date().toISOString(),
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

async function fetchBook(bookId, params) {
  // 内联降级路径：调用方直接提供 bookTitle，跳过 HTTP 请求
  if (params?.bookTitle) {
    return { id: bookId, title: String(params.bookTitle) };
  }
  try {
    const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}`);
    return payload?.book || payload || null;
  } catch (error) {
    throw new Error(`AI_LIBRARY_UNAVAILABLE: 无法获取书籍信息（${error?.message || error}）。请确认 ai_library 服务在 ${getAiLibraryBase()} 上运行，或在批次请求中直接传入 bookTitle。`);
  }
}

async function fetchChapters(bookId, params) {
  // 内联降级路径：调用方直接提供 chapters 数组，跳过 HTTP 请求
  if (Array.isArray(params?.chapters) && params.chapters.length > 0) {
    return params.chapters.map((chapter, idx) => ({
      id: chapter.id || `${bookId}-${idx}`,
      book_id: bookId,
      chapter_index: typeof chapter.chapter_index === 'number' ? chapter.chapter_index : idx,
      title: chapter.title || `第 ${idx + 1} 章`,
      char_count: chapter.char_count || (chapter.text ? String(chapter.text).length : null),
    }));
  }
  try {
    const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}/chapters`);
    return Array.isArray(payload?.chapters) ? payload.chapters : [];
  } catch (error) {
    throw new Error(`AI_LIBRARY_UNAVAILABLE: 无法获取章节列表（${error?.message || error}）。请确认 ai_library 服务在 ${getAiLibraryBase()} 上运行，或在批次请求中直接传入 chapters 数组。`);
  }
}

async function fetchChapter(bookId, chapterIndex) {
  try {
    const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}/chapter/${chapterIndex}`);
    return {
      chapter: payload?.chapter || null,
      text: String(payload?.text || ''),
    };
  } catch (error) {
    throw new Error(`AI_LIBRARY_CHAPTER_UNAVAILABLE: 无法获取第 ${chapterIndex} 章内容（${error?.message || error}）。请确认 ai_library 服务在 ${getAiLibraryBase()} 上运行。`);
  }
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

function assertNoMockArtifactsInRealBatch(sheet, batch) {
  const realMode = batch?.config?.executionMode === 'real'
    || String(batch?.config?.realAgents || '').trim().toLowerCase() === 'all';
  if (!realMode || !sheet?.artifacts) return;
  const mockArtifact = Object.values(sheet.artifacts).find((artifact) => {
    const text = `${artifact?.title || ''}\n${artifact?.summary || ''}`.toLowerCase();
    return text.includes('mock') || text.includes('[mock]');
  });
  if (!mockArtifact) return;
  throw new Error(`REAL_BATCH_CONTAINS_MOCK_ARTIFACT: ${mockArtifact.artifactType || mockArtifact.title || 'unknown'}`);
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

function autoApproveQualityGates(sheet) {
  if (!sheet || !Array.isArray(sheet.gates)) return sheet;
  return {
    ...sheet,
    overallStatus: sheet.overallStatus === 'awaiting_review' ? 'completed' : sheet.overallStatus,
    gates: sheet.gates.map((gate) => (
      gate.gateType === 'quality_review' && gate.status === 'pending'
        ? {
          ...gate,
          status: 'approved',
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
