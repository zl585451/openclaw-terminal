import { useEffect, useMemo, useState } from 'react';
import { listBooks, listChapters, type LibraryBook, type LibraryChapter } from '../../services/aiLibraryClient';
import { estimateBatchCost } from '../../services/batchBudget';
import { startGatewayBatch } from '../../services/gatewayBatch';
import { scriptAdapterActions } from '../../store/actions';
import type { DeliveryOptions, TaskCreationContract } from '../../types/batch';
import { StartConfirmDialog } from './StartConfirmDialog';
import styles from '../../styles/scriptAdapter.module.css';

interface BatchSetupPanelProps {
  taskContract?: TaskCreationContract | null;
  onBatchStarted: (batchId: string) => void | Promise<void>;
}

export function BatchSetupPanel({ taskContract, onBatchStarted }: BatchSetupPanelProps) {
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [batchChapters, setBatchChapters] = useState<LibraryChapter[]>([]);
  const [selectedBatchBookId, setSelectedBatchBookId] = useState('');
  const [selectedBatchChapterIndices, setSelectedBatchChapterIndices] = useState<number[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOptions>({
    adaptedScript: true,
    voiceRegistry: true,
    qualityReview: true,
    cvDirections: false,
    bgmSfx: false,
    finalPackage: true,
  });
  const [loading, setLoading] = useState<'books' | 'chapters' | 'start' | null>(null);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!taskContract) return;
    setSelectedBatchBookId(taskContract.bookId);
    setSelectedBatchChapterIndices(taskContract.chapterIndices);
    setDeliveryOptions(taskContract.deliveryOptions);
  }, [taskContract]);

  useEffect(() => {
    let cancelled = false;
    setLoading('books');
    setError('');
    listBooks()
      .then((books) => {
        if (cancelled) return;
        setLibraryBooks(books);
        if (!selectedBatchBookId && books[0]) setSelectedBatchBookId(books[0].id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '书库加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBatchBookId]);

  useEffect(() => {
    if (!selectedBatchBookId) {
      setBatchChapters([]);
      setSelectedBatchChapterIndices([]);
      return;
    }
    let cancelled = false;
    setLoading('chapters');
    setError('');
    listChapters(selectedBatchBookId)
      .then((chapters) => {
        if (cancelled) return;
        setBatchChapters(chapters);
        setSelectedBatchChapterIndices((current) => {
          if (current.length > 0 && current.every((index) => chapters.some((chapter) => chapter.chapter_index === index))) {
            return current;
          }
          if (taskContract?.bookId === selectedBatchBookId) {
            const lockedIndices = taskContract.chapterIndices.filter((index) =>
              chapters.some((chapter) => chapter.chapter_index === index),
            );
            return lockedIndices;
          }
          return chapters[0] ? [chapters[0].chapter_index] : [];
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '批次章节加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBatchBookId, taskContract]);

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
    if (batchEstimate.chapterCount > 5) {
      warnings.push('真实 Agent 制作超过 5 章，建议先跑 1 章或 3-5 章。');
    }
    if (deliveryOptions.bgmSfx && batchEstimate.chapterCount > 5) {
      warnings.push('已开启 BGM/SFX 建议，批量成本会明显上升。');
    }
    return warnings;
  }, [batchEstimate.chapterCount, deliveryOptions.bgmSfx]);

  const contractRangeLabel = taskContract?.rangeLabel
    || (batchEstimate.chapterCount === 1 ? '单章试产' : `${batchEstimate.chapterCount} 章小批量试产`);
  const chapterSummary = useMemo(() => {
    const selected = effectiveBatchChapters.filter((chapter) => selectedBatchChapterIndices.includes(chapter.chapter_index));
    if (selected.length === 0) return '未锁定具体章节';
    if (selected.length === 1) {
      const chapter = selected[0];
      return `${chapter.title || `第 ${chapter.chapter_index + 1} 章`} · 索引 ${chapter.chapter_index}`;
    }
    const first = selected[0];
    const last = selected[selected.length - 1];
    return `${first.title || `第 ${first.chapter_index + 1} 章`} -> ${last.title || `第 ${last.chapter_index + 1} 章`}（共 ${selected.length} 章）`;
  }, [effectiveBatchChapters, selectedBatchChapterIndices]);
  const lockedSelectionMismatch = useMemo(() => {
    if (!taskContract) return false;
    const current = [...selectedBatchChapterIndices].sort((a, b) => a - b);
    const locked = [...taskContract.chapterIndices].sort((a, b) => a - b);
    if (current.length !== locked.length) return true;
    return current.some((value, index) => value !== locked[index]);
  }, [selectedBatchChapterIndices, taskContract]);

  const startBatchButtonText = batchEstimate.chapterCount <= 1
    ? '确认开工，启动真实单章制作'
    : batchEstimate.chapterCount <= 5
      ? '确认开工，启动真实小批量制作'
      : '确认高成本预算，启动真实批次';

  const deliverySummary = [
    'Word DOCX',
    '多人演播台本',
    deliveryOptions.voiceRegistry ? '角色音表' : null,
    deliveryOptions.qualityReview ? '质检报告' : null,
    deliveryOptions.cvDirections ? 'CV 演播指导' : null,
    deliveryOptions.bgmSfx ? 'BGM/SFX 建议' : null,
  ].filter(Boolean).join(' / ');

  const requestStart = () => {
    if (!selectedBatchBook || batchEstimate.chapterCount === 0) {
      setError('请先选择一本书和至少一个章节。');
      return;
    }
    if (lockedSelectionMismatch) {
      setError('当前开工页拿到的章节范围与任务锁定范围不一致，已阻止默认回退到第 1 章。请返回重新选章后再开工。');
      return;
    }
    if (taskContract?.rangeLabel.includes('全书')) {
      setError('首次真实制作不建议直接跑全书，请先选择 1 章或 3-5 章。');
      return;
    }
    setError('');
    setConfirmOpen(true);
  };

  const confirmStart = async () => {
    if (!selectedBatchBook || batchEstimate.chapterCount === 0) return;
    setConfirmOpen(false);
    setLoading('start');
    setError('');
    try {
      const result = await startGatewayBatch({
        bookId: selectedBatchBook.id,
        bookTitle: selectedBatchBook.title,
        chapterIndices: selectedBatchChapterIndices,
        estimate: batchEstimate,
        config: {
          executionMode: 'real',
          realAgents: 'all',
          includePerformanceDesign: deliveryOptions.cvDirections || deliveryOptions.bgmSfx,
          deliveryOptions,
        },
      });
      if (!result.success || !result.batchId) {
        setError(result.error || '批次启动失败');
        return;
      }
      await onBatchStarted(result.batchId);
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <section className={`${styles.card} ${styles.workOrderHeroCard}`}>
        <div className={styles.workOrderHeroMain}>
          <div className={styles.workOrderHeroCopy}>
            <div className={styles.workOrderKicker}>开工确认书</div>
            <h2>请最后确认预算、真实制作队列和交付物。</h2>
            <p>
              你前面确认的素材、章节范围、目标和修改策略已经锁定。这里不再重新选章节，
              只做真实制作开工前拍板；如需改范围，请返回修改方案。
            </p>
            <div className={styles.workOrderSealRow}>
              <span>不改剧情</span>
              <span>{batchEstimate.chapterCount <= 1 ? '单章试产' : '小批量试产'}</span>
              <span>交付 Word DOCX</span>
            </div>
          </div>
          <div className={styles.contractSummaryGrid}>
            <div><span>素材</span><strong>{selectedBatchBook?.title || taskContract?.bookTitle || '待选择素材'}</strong></div>
            <div><span>范围</span><strong>{contractRangeLabel}</strong></div>
            <div><span>修改策略</span><strong>{taskContract?.strategyTitle || '轻度听感改编'}</strong></div>
            <div><span>交付物</span><strong>{deliverySummary}</strong></div>
            <div><span>未启用</span><strong>{deliveryOptions.bgmSfx ? '无' : 'BGM/SFX 建议'}</strong></div>
          </div>
        </div>
        <div className={styles.workOrderHeroActions}>
          <div className={styles.readyStamp}>READY</div>
          <button
            type="button"
            className={styles.confirmStartButton}
            disabled={loading === 'start' || batchEstimate.chapterCount === 0}
            onClick={requestStart}
          >
            {loading === 'start' ? '启动中…' : startBatchButtonText}
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
          <div className={styles.sectionTitle}>最终预算与真实制作队列</div>
          <div className={styles.batchBudgetStats}>
            <div><span>已选章节</span><strong>{batchEstimate.chapterCount}</strong></div>
            <div><span>总字数</span><strong>{batchEstimate.totalChars.toLocaleString('zh-CN')}</strong></div>
            <div><span>预计耗时</span><strong>{batchEstimate.estimatedDurationMinutes} 分钟</strong></div>
            <div><span>预计费用</span><strong>¥{batchEstimate.estimatedCostCny.toFixed(2)}</strong></div>
          </div>
          <div className={styles.batchModeBlock}>
            <strong>真实 Agent 制作</strong>
            <p>本页只支持真实 Agent 制作。点击开工后会调用真实模型并产生费用，失败会在执行页显示具体 Agent 与错误。</p>
          </div>
          <div className={styles.batchModeBlock}>
            <strong>本次交付内容已锁定</strong>
            <p>{deliverySummary}</p>
            <small>交付项在第 3 步确认。最后页只显示摘要，避免开工前重复配置。</small>
          </div>
          <div className={styles.batchCostBreakdown}>
            <div><span>基础台本 / 角色音 / 质检</span><strong>¥{batchEstimate.baseCostCny.toFixed(2)}</strong></div>
            <div><span>CV 演播指导</span><strong>¥{batchEstimate.cvCostCny.toFixed(2)}</strong></div>
            <div><span>BGM/SFX 建议</span><strong>¥{batchEstimate.bgmSfxCostCny.toFixed(2)}</strong></div>
          </div>
          <div className={styles.batchWarningList}>
            {batchEstimate.warnings.length > 0
              ? batchEstimate.warnings.map((warning) => <div key={warning}>{warning}</div>)
              : <div>当前批次规模适合直接试跑。</div>}
          </div>
          {error ? <div className={styles.inlineErrorText}>{error}</div> : null}
        </div>

        <div className={`${styles.card} ${styles.contractGuardCard}`}>
          <div className={styles.sectionTitle}>开工保护条款</div>
          <div className={styles.contractGuardList}>
            <div><strong>范围已锁定</strong><span>{contractRangeLabel}。如需改章节，返回新建任务第 1 步。</span></div>
            <div><strong>不会改核心剧情</strong><span>只优化表达和演播可执行性，不改变人物关系和关键事件。</span></div>
            <div><strong>完成后主交付为 DOCX</strong><span>Markdown 只作为内部留痕，客户优先看 Word 文档。</span></div>
          </div>
        </div>
      </section>

      <StartConfirmDialog
        open={confirmOpen}
        loading={loading === 'start'}
        bookTitle={selectedBatchBook?.title || taskContract?.bookTitle || '待选择素材'}
        rangeLabel={contractRangeLabel}
        estimate={batchEstimate}
        deliveryItemLabels={deliveryItemLabels}
        warnings={startWarnings}
        chapterSummary={chapterSummary}
        confirmButtonText={startBatchButtonText}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void confirmStart()}
      />
    </>
  );
}
