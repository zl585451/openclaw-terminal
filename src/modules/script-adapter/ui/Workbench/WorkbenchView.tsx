import { useEffect, useMemo, useRef, useState } from 'react';
import { useScriptAdapterStore } from '../../store/scriptAdapterStore';
import { scriptAdapterActions } from '../../store/actions';
import {
  abortPipeline,
  createExecutionPlan,
  runFullPipeline,
} from '../../services/mockAgentExecution';
import {
  startGatewayExecution,
  subscribeGatewayExecutionEvents,
} from '../../services/gatewayExecution';
import {
  listBooks,
  listChapters,
  type LibraryBook,
  type LibraryChapter,
} from '../../services/aiLibraryClient';
import { estimateBatchCost } from '../../services/batchBudget';
import {
  cancelGatewayBatch,
  deleteGatewayBatch,
  getGatewayBatchStatus,
  listGatewayBatches,
  rerunGatewayBatchChapter,
  startGatewayBatch,
  subscribeGatewayBatch,
  subscribeGatewayBatchEvents,
} from '../../services/gatewayBatch';
import { exportBatchDeliveryAsDocx, exportBatchDeliveryAsMarkdown } from '../../services/exportClient';
import type { StageStatus } from '../../types/stage';
import type { BatchJob, ChapterRunRecord, DeliveryOptions, TaskCreationContract, TrialExecutionMode } from '../../types/batch';
import { ExecutionView } from './ExecutionView';
import { BatchProgressView } from './BatchProgressView';
import styles from '../../styles/scriptAdapter.module.css';

const TASK_STEPS = [
  { label: '确认素材', desc: '文本已标准化入库', status: 'done' },
  { label: '确认目标和范围', desc: '多人演播有声书 · 第1章', status: 'done' },
  { label: '确认修改策略', desc: '轻度听感改编已锁定', status: 'done' },
  { label: '执行制作', desc: '按 Agent 队列生成产物', status: 'running' },
  { label: '人工复核', desc: '检查样章、角色音和演播标注', status: 'pending' },
] as const;

const STATUS_LABEL: Record<StageStatus, string> = {
  done: '已完成',
  running: '执行中',
  review: '待复核',
  pending: '待执行',
  failed: '失败',
};

const ARTIFACT_LABELS: Record<string, string> = {
  adapted_script: '多人演播样章台本',
  voice_registry: '角色音标注表',
  performance_design: '演播设计稿',
  review_report: '质检审核报告',
  final_package: '交付包',
};

const TEAM_ROLE_COPY: Record<string, { title: string; shortDesc: string; promise: string }> = {
  'stage-text-adaptation': {
    title: '文本改编师',
    shortDesc: '把原文改成更适合多人演播的口语化样章。',
    promise: '保留剧情，只让旁白和对白更好听。',
  },
  'stage-voice-classification': {
    title: '角色音统筹',
    shortDesc: '标出谁在说话、哪些声音暂时未定、哪些需要后续分配 CV。',
    promise: '不把文件记录、OS、未定声音硬塞给旁白。',
  },
  'stage-performance-design': {
    title: '演播设计师',
    shortDesc: '补充 BGM、音效、CV 情绪、气息和动作提示。',
    promise: '让剧组拿到后能直接理解怎么演。',
  },
  'stage-quality-review': {
    title: '质检审校',
    shortDesc: '检查有没有改剧情、角色音是否混乱、演播提示是否可执行。',
    promise: '发现风险会停下来提醒你确认。',
  },
  'stage-export': {
    title: '交付打包员',
    shortDesc: '整理成剧组能看的台本、角色音表和制作说明。',
    promise: '把零散产物打包成清楚的交付件。',
  },
};

interface WorkbenchViewProps {
  taskContract?: TaskCreationContract | null;
}

export function WorkbenchView({ taskContract }: WorkbenchViewProps) {
  const sourceText = '';
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [batchChapters, setBatchChapters] = useState<LibraryChapter[]>([]);
  const [selectedBatchBookId, setSelectedBatchBookId] = useState('');
  const [selectedBatchChapterIndices, setSelectedBatchChapterIndices] = useState<number[]>([]);
  const [executionMode, setExecutionMode] = useState<TrialExecutionMode>('mock');
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOptions>({
    adaptedScript: true,
    voiceRegistry: true,
    qualityReview: true,
    cvDirections: false,
    bgmSfx: false,
    finalPackage: true,
  });
  const [batchLibraryLoading, setBatchLibraryLoading] = useState<'books' | 'chapters' | 'start' | null>(null);
  const [batchLibraryError, setBatchLibraryError] = useState('');
  const [batchHistory, setBatchHistory] = useState<BatchJob[]>([]);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [currentBatch, setCurrentBatch] = useState<BatchJob | null>(null);
  const [currentBatchRuns, setCurrentBatchRuns] = useState<ChapterRunRecord[]>([]);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const project = useScriptAdapterStore((state) =>
    currentProjectId ? state.projects[currentProjectId] : null,
  );
  const chapters = useScriptAdapterStore((state) =>
    currentProjectId ? state.chapters[currentProjectId] ?? [] : [],
  );
  const stages = useScriptAdapterStore((state) =>
    currentProjectId ? state.stages[currentProjectId] ?? [] : [],
  );
  const executionSheet = useScriptAdapterStore((state) =>
    currentProjectId ? state.executionSheets[currentProjectId] ?? null : null,
  );
  const executionSheetRef = useRef(executionSheet);
  executionSheetRef.current = executionSheet;
  const currentBatchIdRef = useRef<string | null>(currentBatchId);
  currentBatchIdRef.current = currentBatchId;

  useEffect(() => {
    if (!taskContract) return;
    setSelectedBatchBookId(taskContract.bookId);
    setSelectedBatchChapterIndices(taskContract.chapterIndices);
    setDeliveryOptions(taskContract.deliveryOptions);
  }, [taskContract]);

  const currentChapter = chapters.find((chapter) => chapter.id === project?.meta.currentChapterId) ?? chapters[0];
  const productionStages = stages.filter((stage) => stage.idx >= 3);
  const firstRunnableStage = productionStages.find((stage) => stage.status === 'running')
    ?? productionStages.find((stage) => stage.status === 'pending')
    ?? productionStages[0];
  const expectedOutputs = productionStages
    .flatMap((stage) => stage.outputArtifactTypes)
    .filter((type, index, list) => list.indexOf(type) === index);
  const selectedBatchBook = libraryBooks.find((book) => book.id === selectedBatchBookId)
    || (taskContract ? {
      id: taskContract.bookId,
      title: taskContract.bookTitle,
      author: '',
      source_type: 'library',
      chapter_count: taskContract.chapterCount,
      total_chars: taskContract.totalChars,
    } as LibraryBook : null);
  const effectiveBatchChapters = useMemo(() => {
    if (batchChapters.length > 0 || !taskContract) return batchChapters;
    const avgChars = Math.max(0, Math.round(taskContract.totalChars / Math.max(1, taskContract.chapterCount)));
    return taskContract.chapterIndices.map((chapterIndex) => ({
      id: `${taskContract.bookId}-${chapterIndex}`,
      book_id: taskContract.bookId,
      chapter_index: chapterIndex,
      title: `第 ${chapterIndex + 1} 章`,
      char_count: avgChars,
    })) as LibraryChapter[];
  }, [batchChapters, taskContract]);

  const batchEstimate = useMemo(
    () => estimateBatchCost(effectiveBatchChapters, selectedBatchChapterIndices, {
      includeVoiceRegistry: deliveryOptions.voiceRegistry,
      includeQualityReview: deliveryOptions.qualityReview,
      includeCvDirections: deliveryOptions.cvDirections,
      includeBgmSfx: deliveryOptions.bgmSfx,
    }),
    [
      effectiveBatchChapters,
      selectedBatchChapterIndices,
      deliveryOptions.voiceRegistry,
      deliveryOptions.qualityReview,
      deliveryOptions.cvDirections,
      deliveryOptions.bgmSfx,
    ],
  );
  const deliveryItemLabels = useMemo(() => [
    '多人演播台本',
    deliveryOptions.voiceRegistry ? '角色音表' : null,
    deliveryOptions.qualityReview ? '质检报告' : null,
    deliveryOptions.cvDirections ? 'CV 演播指导' : null,
    deliveryOptions.bgmSfx ? 'BGM/SFX 建议' : null,
  ].filter(Boolean) as string[], [
    deliveryOptions.voiceRegistry,
    deliveryOptions.qualityReview,
    deliveryOptions.cvDirections,
    deliveryOptions.bgmSfx,
  ]);
  const startWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (executionMode === 'real' && batchEstimate.chapterCount > 5) {
      warnings.push('真实 Agent 试产超过 5 章，建议先跑 1 章或 3-5 章。');
    }
    if (deliveryOptions.bgmSfx && batchEstimate.chapterCount > 5) {
      warnings.push('已开启 BGM/SFX 建议，批量成本会明显上升。');
    }
    return warnings;
  }, [batchEstimate.chapterCount, deliveryOptions.bgmSfx, executionMode]);

  const teamStages = productionStages.map((stage) => ({
    ...stage,
    friendly: TEAM_ROLE_COPY[stage.id] ?? {
      title: stage.name,
      shortDesc: stage.description,
      promise: '按确认策略完成对应制作任务。',
    },
  }));

  const openRunnableStage = () => {
    scriptAdapterActions.openStageInWorkbench(firstRunnableStage?.idx ?? 3);
  };

  const refreshBatchHistory = async (preferBatchId?: string | null) => {
    const result = await listGatewayBatches(12);
    if (!result.success) return;
    const nextBatches = result.batches || [];
    setBatchHistory(nextBatches);
    const runningBatch = nextBatches.find((item) => item.status === 'running' || item.status === 'paused') ?? null;
    const preferred = preferBatchId
      || currentBatchIdRef.current
      || runningBatch?.id
      || null;
    if (preferred) {
      setCurrentBatchId(preferred);
    } else {
      setCurrentBatchId(null);
    }
  };

  const loadBatchStatus = async (batchId: string) => {
    const result = await getGatewayBatchStatus(batchId);
    if (!result.success) return;
    setCurrentBatch(result.batch || null);
    setCurrentBatchRuns(result.chapterRuns || []);
  };

  const requestStartBatchExecution = () => {
    if (!selectedBatchBook || batchEstimate.chapterCount === 0) {
      setBatchLibraryError('请先选择一本书和至少一个章节。');
      return;
    }
    if (executionMode === 'real' && taskContract?.rangeLabel.includes('全书')) {
      setBatchLibraryError('首次真实试产不建议直接跑全书，请先选择 1 章或 3-5 章。');
      return;
    }
    setBatchLibraryError('');
    setStartConfirmOpen(true);
  };

  const startBatchExecution = async () => {
    if (!selectedBatchBook || batchEstimate.chapterCount === 0) return;
    setStartConfirmOpen(false);
    setBatchLibraryLoading('start');
    setBatchLibraryError('');
    try {
      const result = await startGatewayBatch({
        bookId: selectedBatchBook.id,
        bookTitle: selectedBatchBook.title,
        chapterIndices: selectedBatchChapterIndices,
        estimate: batchEstimate,
        config: {
          executionMode,
          realAgents: executionMode === 'real' ? 'all' : 'off',
          includePerformanceDesign: deliveryOptions.cvDirections || deliveryOptions.bgmSfx,
          deliveryOptions,
        },
      });
      if (!result.success || !result.batchId) {
        setBatchLibraryError(result.error || '批次启动失败');
        return;
      }
      setCurrentBatchId(result.batchId);
      await refreshBatchHistory(result.batchId);
      await loadBatchStatus(result.batchId);
    } finally {
      setBatchLibraryLoading(null);
    }
  };

  const handleBatchExport = async () => {
    if (!currentBatch) return;
    await exportBatchDeliveryAsMarkdown(currentBatch, currentBatchRuns);
  };

  const handleBatchExportDocx = async () => {
    if (!currentBatch) return;
    await exportBatchDeliveryAsDocx(currentBatch, currentBatchRuns);
  };

  const contractRangeLabel = taskContract?.rangeLabel
    || (batchEstimate.chapterCount === 1 ? '单章试产' : `${batchEstimate.chapterCount} 章小批量试产`);
  const startBatchButtonText = batchEstimate.chapterCount <= 1
    ? '确认开工，开始单章试产'
    : batchEstimate.chapterCount <= 5
      ? '确认开工，开始小批量试产'
      : '确认高成本预算，开始批次';
  const deliverySummary = [
    'Word DOCX',
    '多人演播台本',
    deliveryOptions.voiceRegistry ? '角色音表' : null,
    deliveryOptions.qualityReview ? '质检报告' : null,
    deliveryOptions.cvDirections ? 'CV 演播指导' : null,
    deliveryOptions.bgmSfx ? 'BGM/SFX 建议' : null,
  ].filter(Boolean).join(' / ');
  const currentBatchCompleted = currentBatch?.status === 'completed';
  const currentBatchRunning = Boolean(currentBatch && currentBatch.status !== 'completed');
  const activeTeamMember = teamStages.find((stage) => stage.status === 'running')
    ?? teamStages.find((stage) => stage.status === 'pending')
    ?? teamStages[0];
  const completedTeamCount = teamStages.filter((stage) => stage.status === 'done').length;

  const startMockExecution = () => {
    const taskId = project?.id ?? 'demo-content-task';
    const taskTitle = `${project?.name ?? '长夜未瞑'} · 多人演播样章`;
    const sheet = createExecutionPlan(taskId, taskTitle);
    scriptAdapterActions.setExecutionSheet(taskId, sheet);

    void runFullPipeline(sheet, {
      onSheetCreated: (createdSheet) => scriptAdapterActions.setExecutionSheet(taskId, createdSheet),
      onAgentStart: (_agentId, run) => {
        scriptAdapterActions.updateExecutionRun(taskId, run);
      },
      onAgentProgress: (agentId, stage, percent) => {
        scriptAdapterActions.updateExecutionProgress(taskId, agentId, stage, percent);
      },
      onAgentComplete: (_agentId, artifact, run) => {
        scriptAdapterActions.updateExecutionRun(taskId, run);
        scriptAdapterActions.addExecutionArtifact(taskId, artifact);
      },
      onGateReached: (gate) => {
        scriptAdapterActions.updateExecutionGate(taskId, gate.gateId, { status: 'pending' });
      },
      onAllComplete: (completedSheet) => scriptAdapterActions.setExecutionSheet(taskId, completedSheet),
      onAgentFailed: (agentId, error) => {
        scriptAdapterActions.failExecutionRun(taskId, agentId, error);
      },
    });
  };

  const startExecution = async () => {
    const taskId = project?.id ?? 'demo-content-task';
    const taskTitle = `${project?.name ?? '长夜未瞑'} · 多人演播样章`;
    scriptAdapterActions.setExecutionSheet(taskId, createExecutionPlan(taskId, taskTitle));

    const result = await startGatewayExecution({
      taskId,
      taskTitle,
      source: 'content-workbench',
      sourceText,
      config: {
        realAgents: executionMode === 'real' ? 'all' : 'off',
        includePerformanceDesign: deliveryOptions.cvDirections || deliveryOptions.bgmSfx,
        deliveryOptions,
      },
    });

    if (!result?.success) {
      console.warn('[ScriptAdapter] Gateway execution unavailable, fallback to frontend mock:', result?.error);
      startMockExecution();
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeGatewayExecutionEvents((event) => {
      if (currentProjectId && event.taskId !== currentProjectId) return;

      if (event.event === 'sheet_created' || event.event === 'all_completed') {
        scriptAdapterActions.setExecutionSheet(event.taskId, event.sheet);
        return;
      }

      if (event.event === 'agent_started') {
        scriptAdapterActions.updateExecutionRun(event.taskId, event.run);
        return;
      }

      if (event.event === 'agent_progress') {
        scriptAdapterActions.updateExecutionProgress(
          event.taskId,
          event.agentId,
          event.progressSummary,
          event.progressPercent,
        );
        return;
      }

      if (event.event === 'artifact_created') {
        scriptAdapterActions.updateExecutionRun(event.taskId, event.run);
        scriptAdapterActions.addExecutionArtifact(event.taskId, event.artifact);
        return;
      }

      if (event.event === 'gate_reached' || event.event === 'gate_updated') {
        scriptAdapterActions.updateExecutionGate(event.taskId, event.gate.gateId, event.gate);
        return;
      }

      if (event.event === 'run_failed') {
        const firstRunning = executionSheetRef.current?.runs.find((run) => run.status === 'running');
        if (firstRunning) {
          scriptAdapterActions.failExecutionRun(event.taskId, firstRunning.agentId, event.error);
        }
      }
    });

    return () => {
      unsubscribe();
      abortPipeline();
    };
  }, [currentProjectId]);

  useEffect(() => {
    let cancelled = false;
    setBatchLibraryLoading('books');
    setBatchLibraryError('');
    listBooks()
      .then((books) => {
        if (cancelled) return;
        setLibraryBooks(books);
        if (!selectedBatchBookId && books[0]) setSelectedBatchBookId(books[0].id);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBatchLibraryError(error instanceof Error ? error.message : '批次书库加载失败');
      })
      .finally(() => {
        if (!cancelled) setBatchLibraryLoading(null);
      });
    void refreshBatchHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedBatchBookId) {
      setBatchChapters([]);
      setSelectedBatchChapterIndices([]);
      return;
    }
    let cancelled = false;
    setBatchLibraryLoading('chapters');
    setBatchLibraryError('');
    listChapters(selectedBatchBookId)
      .then((chapters) => {
        if (cancelled) return;
        setBatchChapters(chapters);
        setSelectedBatchChapterIndices((current) => {
          if (current.length > 0 && current.every((index) => chapters.some((chapter) => chapter.chapter_index === index))) {
            return current;
          }
          return chapters[0] ? [chapters[0].chapter_index] : [];
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBatchLibraryError(error instanceof Error ? error.message : '批次章节加载失败');
      })
      .finally(() => {
        if (!cancelled) setBatchLibraryLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBatchBookId]);

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

  if (executionSheet) {
    return (
      <div className={styles.taskWorkbench}>
        <aside className={styles.taskRail}>
          <div className={`${styles.card} ${styles.taskProjectCard}`}>
            <div className={styles.sidebarSectionLabel}>正在制作</div>
            <div className={styles.projectCardTitle}>{project?.name ?? '未命名项目'}</div>
            <div className={styles.taskProjectMeta}>
              <span>{currentChapter ? `第${currentChapter.index}章：${currentChapter.title}` : '未选择章节'}</span>
              <span>多人演播样章</span>
              <span>{executionSheet.overallStatus === 'completed' ? '已完成' : '执行中'}</span>
            </div>
          </div>

          <div className={styles.taskStepList}>
            {TASK_STEPS.map((step, index) => {
              const isDone = index < 4 || executionSheet.overallStatus === 'completed';
              const isRunning = index === 3 && executionSheet.overallStatus === 'running';
              return (
                <div
                  key={step.label}
                  className={`${styles.taskStep} ${
                    isRunning ? styles.taskStepActive : ''
                  } ${isDone ? styles.taskStepDone : ''}`}
                >
                  <span className={styles.taskStepIndex}>{index + 1}</span>
                  <div className={styles.taskStepText}>
                    <strong>{step.label}</strong>
                    <span>
                      {index === 3
                        ? `${executionSheet.runs.filter((run) => run.status === 'completed').length}/${executionSheet.runs.length} 已完成`
                        : step.desc}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <ExecutionView
          sheet={executionSheet}
          onBackToContract={() => {
            if (currentProjectId) scriptAdapterActions.clearExecutionSheet(currentProjectId);
          }}
          onRetry={() => {
            if (currentProjectId) {
              scriptAdapterActions.clearExecutionSheet(currentProjectId);
            }
            window.setTimeout(() => {
              void startExecution();
            }, 0);
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.taskWorkbench}>
      <aside className={styles.taskRail}>
        <div className={`${styles.card} ${styles.taskProjectCard}`}>
          <div className={styles.sidebarSectionLabel}>已锁定任务</div>
          <div className={styles.projectCardTitle}>{project?.name ?? '未命名项目'}</div>
          <div className={styles.taskProjectMeta}>
            <span>{currentChapter ? `第${currentChapter.index}章：${currentChapter.title}` : '未选择章节'}</span>
            <span>{project?.meta.genre ?? '题材待确认'}</span>
            <span>开工前确认</span>
          </div>
        </div>

        <div className={styles.taskStepList}>
          {TASK_STEPS.map((step, index) => (
            <div
              key={step.label}
              className={`${styles.taskStep} ${
                step.status === 'running' ? styles.taskStepActive : ''
              } ${step.status === 'done' ? styles.taskStepDone : ''}`}
            >
              <span className={styles.taskStepIndex}>{index + 1}</span>
              <div className={styles.taskStepText}>
                <strong>{step.label}</strong>
                <span>{step.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className={styles.secondaryWideButton}
          onClick={() => scriptAdapterActions.setViewMode('pipeline')}
        >
          返回修改方案
        </button>
      </aside>

      <main className={styles.taskMain}>
        {!currentBatch ? (
        <>
        <section className={`${styles.card} ${styles.workOrderHeroCard}`}>
          <div className={styles.workOrderHeroMain}>
            <div className={styles.workOrderHeroCopy}>
              <div className={styles.workOrderKicker}>开工确认书</div>
              <h2>请最后确认预算、试产模式和交付物。</h2>
              <p>
                你前面确认的素材、章节范围、目标和修改策略已经锁定。这里不再重新选章节，
                只做开工前拍板；如需改范围，请返回修改方案。
              </p>
              <div className={styles.workOrderSealRow}>
                <span>不改剧情</span>
                <span>{batchEstimate.chapterCount <= 1 ? '单章试产' : '小批量试产'}</span>
                <span>交付 Word DOCX</span>
              </div>
            </div>
            <div className={styles.contractSummaryGrid}>
              <div>
                <span>素材</span>
                <strong>{selectedBatchBook?.title || taskContract?.bookTitle || '待选择素材'}</strong>
              </div>
              <div>
                <span>范围</span>
                <strong>{contractRangeLabel}</strong>
              </div>
              <div>
                <span>修改策略</span>
                <strong>{taskContract?.strategyTitle || '轻度听感改编'}</strong>
              </div>
              <div>
                <span>交付物</span>
                <strong>{deliverySummary}</strong>
              </div>
              <div>
                <span>未启用</span>
                <strong>{deliveryOptions.bgmSfx ? '无' : 'BGM/SFX 建议'}</strong>
              </div>
            </div>
          </div>
          <div className={styles.workOrderHeroActions}>
            <div className={styles.readyStamp}>READY</div>
            <button
              type="button"
              className={styles.confirmStartButton}
              disabled={batchLibraryLoading === 'start' || batchEstimate.chapterCount === 0}
              onClick={requestStartBatchExecution}
            >
              {batchLibraryLoading === 'start' ? '启动中…' : startBatchButtonText}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => scriptAdapterActions.setViewMode('pipeline')}
            >
              返回修改方案
            </button>
          </div>
        </section>

        <section className={styles.contractApprovalGrid}>
          <div className={`${styles.card} ${styles.batchBudgetCard}`}>
            <div className={styles.sectionTitle}>最终预算与试产模式</div>
            <div className={styles.batchBudgetStats}>
              <div><span>已选章节</span><strong>{batchEstimate.chapterCount}</strong></div>
              <div><span>总字数</span><strong>{batchEstimate.totalChars.toLocaleString('zh-CN')}</strong></div>
              <div><span>预计耗时</span><strong>{batchEstimate.estimatedDurationMinutes} 分钟</strong></div>
              <div><span>预计费用</span><strong>¥{batchEstimate.estimatedCostCny.toFixed(2)}</strong></div>
            </div>
            <div className={styles.batchModeBlock}>
              <strong>试产模式</strong>
              <label className={styles.batchOptionToggle}>
                <input
                  type="radio"
                  checked={executionMode === 'mock'}
                  onChange={() => setExecutionMode('mock')}
                />
                <span>模拟演示：不调用真实模型，适合看流程</span>
              </label>
              <label className={styles.batchOptionToggle}>
                <input
                  type="radio"
                  checked={executionMode === 'real'}
                  onChange={() => setExecutionMode('real')}
                />
                <span>真实 Agent 试产：会调用模型并产生费用，建议先跑 1 章或 3-5 章</span>
              </label>
            </div>
            <div className={styles.batchModeBlock}>
              <strong>本次交付内容已锁定</strong>
              <p>{deliverySummary}</p>
              <small>交付项在第 3 步确认。最后页只显示摘要,避免开工前重复配置。</small>
            </div>
            <div className={styles.batchCostBreakdown}>
              <div><span>基础台本 / 角色音 / 质检</span><strong>¥{batchEstimate.baseCostCny.toFixed(2)}</strong></div>
              <div><span>CV 演播指导</span><strong>¥{batchEstimate.cvCostCny.toFixed(2)}</strong></div>
              <div><span>BGM/SFX 建议</span><strong>¥{batchEstimate.bgmSfxCostCny.toFixed(2)}</strong></div>
            </div>
            <div className={styles.batchWarningList}>
              {batchEstimate.warnings.length > 0 ? batchEstimate.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              )) : <div>当前批次规模适合直接试跑。</div>}
            </div>
            {batchLibraryError ? <div className={styles.inlineErrorText}>{batchLibraryError}</div> : null}
          </div>

          <div className={`${styles.card} ${styles.contractGuardCard}`}>
            <div className={styles.sectionTitle}>开工保护条款</div>
            <div className={styles.contractGuardList}>
              <div>
                <strong>范围已锁定</strong>
                <span>{contractRangeLabel}。如需改章节,返回新建任务第 1 步。</span>
              </div>
              <div>
                <strong>不会改核心剧情</strong>
                <span>只优化表达和演播可执行性,不改变人物关系和关键事件。</span>
              </div>
              <div>
                <strong>完成后主交付为 DOCX</strong>
                <span>Markdown 只作为内部留痕,客户优先看 Word 文档。</span>
              </div>
            </div>
          </div>
        </section>
        </>
        ) : null}

        {currentBatchRunning ? (
          <section className={`${styles.card} ${styles.lifecycleStatusCard}`}>
            <div>
              <div className={styles.workOrderKicker}>开工中</div>
              <h2>正在试产，当前由{activeTeamMember?.friendly.title || '制作 Agent'}处理。</h2>
              <p>
                {completedTeamCount}/{teamStages.length} 个制作角色已完成。这里先看真实进度；
                详细 Agent 队列和历史记录已折叠，避免干扰当前状态。
              </p>
            </div>
            <button type="button" className={styles.ghostButton} onClick={openRunnableStage}>
              查看当前制作阶段
            </button>
          </section>
        ) : null}

        {currentBatch ? (
          <BatchProgressView
            batch={currentBatch}
            chapterRuns={currentBatchRuns}
            onRefresh={() => void loadBatchStatus(currentBatch.id)}
            onRerun={(chapterIndex) => {
              void rerunGatewayBatchChapter(currentBatch.id, chapterIndex).then(() => loadBatchStatus(currentBatch.id));
            }}
            onExport={() => void handleBatchExport()}
            onExportDocx={() => void handleBatchExportDocx()}
            onCancel={() => {
              void cancelGatewayBatch(currentBatch.id).then(() => {
                void refreshBatchHistory(currentBatch.id);
                void loadBatchStatus(currentBatch.id);
              });
            }}
          />
        ) : null}

        {currentBatchCompleted ? (
        <details className={`${styles.card} ${styles.collapsibleWorkbenchSection}`}>
          <summary>查看批次历史</summary>
          <section className={styles.batchHistoryCard}>
          <div className={styles.productionTeamHeader}>
            <div>
              <div className={styles.sectionTitle}>批次历史</div>
              <p>这里会保留已完成、失败和中断批次。重启后状态由 Gateway 持久化恢复。</p>
            </div>
            <button type="button" className={styles.ghostButton} onClick={() => void refreshBatchHistory()}>
              刷新历史
            </button>
          </div>
          <div className={styles.batchHistoryList}>
            {batchHistory.length === 0 ? (
              <div className={styles.batchHistoryEmpty}>还没有批次记录。</div>
            ) : batchHistory.map((batch) => (
              <div key={batch.id} className={batch.id === currentBatchId ? styles.batchHistoryItemActive : styles.batchHistoryItem}>
                <button type="button" className={styles.batchHistoryMain} onClick={() => setCurrentBatchId(batch.id)}>
                  <strong>{batch.bookTitle}</strong>
                  <span>{batch.completedChapters}/{batch.totalChapters} · {batch.status}</span>
                  <em>{new Date(batch.createdAt).toLocaleString('zh-CN')}</em>
                </button>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => {
                    void deleteGatewayBatch(batch.id).then(() => refreshBatchHistory(currentBatchIdRef.current));
                  }}
                  disabled={batch.status === 'running'}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
          </section>
        </details>
        ) : null}

        {currentBatchRunning ? (
        <>
        <section className={styles.contractReviewNotice}>
          <strong>需要你之后确认的地方</strong>
          <span>未定角色音是否独立锁 CV、演播提示是否继续扩到全章、质检结果是否允许进入打包。</span>
        </section>
        </>
        ) : null}

        {currentBatch ? (
        <details className={`${styles.card} ${styles.collapsibleWorkbenchSection}`}>
          <summary>查看制作角色和保护条款</summary>
          <section className={styles.productionTeamCard}>
          <div className={styles.productionTeamHeader}>
            <div>
              <div className={styles.sectionTitle}>谁在为你干活</div>
              <p>不用理解技术队列。你只需要知道，这几位“制作角色”会按顺序帮你完成样章。</p>
            </div>
            <button type="button" className={styles.ghostButton} onClick={openRunnableStage}>
              打开当前制作阶段
            </button>
          </div>

          <div className={styles.productionTeamGrid}>
            {teamStages.map((stage) => (
              <div key={stage.id} className={styles.productionTeamMember}>
                <div className={styles.productionMemberTop}>
                  <span>{stage.idx}</span>
                  <em>{STATUS_LABEL[stage.status]}</em>
                </div>
                <strong>{stage.friendly.title}</strong>
                <p>{stage.friendly.shortDesc}</p>
                <small>{stage.friendly.promise}</small>
                {stage.requiresHumanReview ? <b>需要你复核</b> : null}
              </div>
            ))}
          </div>
          </section>

        <section className={styles.contractDeliveryGrid}>
          <div className={`${styles.card} ${styles.deliveryChecklistCard}`}>
            <div className={styles.sectionTitle}>开工后你会拿到什么</div>
            <div className={styles.deliveryChecklist}>
              {expectedOutputs.map((type, index) => (
                <div key={type}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{ARTIFACT_LABELS[type] ?? type}</strong>
                    <em>{type === 'final_package' ? '最后统一整理给你' : '制作过程中逐步生成'}</em>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.card} ${styles.contractGuardCard}`}>
            <div className={styles.sectionTitle}>保护条款</div>
            <div className={styles.contractGuardList}>
              <div>
                <strong>不会改核心剧情</strong>
                <span>只优化表达和演播可执行性，不改变人物关系和关键事件。</span>
              </div>
              <div>
                <strong>不会提前解释悬疑</strong>
                <span>旧物、对讲机和关键线索仍按原来的信息顺序出现。</span>
              </div>
              <div>
                <strong>不会乱归角色音</strong>
                <span>未定来源声音会保留为候选，交给你或统筹后续确认。</span>
              </div>
            </div>
          </div>
        </section>
        </details>
        ) : null}

      </main>
      {startConfirmOpen ? (
        <div className={styles.workbenchModalOverlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setStartConfirmOpen(false);
        }}>
          <section className={styles.startConfirmDialog} role="dialog" aria-modal="true" aria-labelledby="start-confirm-title">
            <div className={styles.startConfirmHeader}>
              <div>
                <span>开工确认</span>
                <h3 id="start-confirm-title">确认启动这次试产？</h3>
              </div>
              <button type="button" aria-label="关闭开工确认" onClick={() => setStartConfirmOpen(false)}>
                ×
              </button>
            </div>

            <div className={styles.startConfirmProject}>
              <span>素材</span>
              <strong>《{selectedBatchBook?.title || taskContract?.bookTitle || '待选择素材'}》</strong>
              <em>{contractRangeLabel}</em>
            </div>

            <div className={styles.startConfirmStats}>
              <div><span>章节</span><strong>{batchEstimate.chapterCount}</strong></div>
              <div><span>字数</span><strong>{batchEstimate.totalChars.toLocaleString('zh-CN')}</strong></div>
              <div><span>耗时</span><strong>{batchEstimate.estimatedDurationMinutes} 分钟</strong></div>
              <div><span>费用</span><strong>¥{batchEstimate.estimatedCostCny.toFixed(2)}</strong></div>
            </div>

            <div className={styles.startConfirmInfoGrid}>
              <div>
                <span>试产模式</span>
                <strong>{executionMode === 'real' ? '真实 Agent 试产' : '模拟演示'}</strong>
              </div>
              <div>
                <span>交付项</span>
                <strong>{deliveryItemLabels.join(' / ')}</strong>
              </div>
            </div>

            {startWarnings.length > 0 ? (
              <div className={styles.startConfirmWarnings}>
                {startWarnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            ) : (
              <div className={styles.startConfirmSafeNote}>当前批次规模适合直接试跑。</div>
            )}

            <div className={styles.startConfirmActions}>
              <button type="button" className={styles.ghostButton} onClick={() => setStartConfirmOpen(false)}>
                再检查一下
              </button>
              <button
                type="button"
                className={styles.confirmStartButton}
                disabled={batchLibraryLoading === 'start'}
                onClick={() => void startBatchExecution()}
              >
                {batchLibraryLoading === 'start' ? '启动中…' : startBatchButtonText}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
