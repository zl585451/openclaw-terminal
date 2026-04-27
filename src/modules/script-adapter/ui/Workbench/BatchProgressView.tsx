import { useMemo, useState } from 'react';
import type { BatchJob, ChapterRunRecord } from '../../types/batch';
import { DeliveryPreview } from './DeliveryPreview';
import styles from '../../styles/scriptAdapter.module.css';

interface BatchProgressViewProps {
  batch: BatchJob;
  chapterRuns: ChapterRunRecord[];
  onRefresh: () => void;
  onRerun: (chapterIndex: number) => void;
  onExport: () => void;
  onExportDocx: () => void;
  onCancel: () => void;
}

const ROW_HEIGHT = 52;
const VIEWPORT_HEIGHT = 280;

export function BatchProgressView({
  batch,
  chapterRuns,
  onRefresh,
  onRerun,
  onExport,
  onExportDocx,
  onCancel,
}: BatchProgressViewProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [expandedChapterIndex, setExpandedChapterIndex] = useState<number | null>(null);
  const sortedRuns = useMemo(
    () => [...chapterRuns].sort((a, b) => a.chapterIndex - b.chapterIndex),
    [chapterRuns],
  );
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const visible = sortedRuns.slice(start, Math.min(sortedRuns.length, start + Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 8));
  const currentRun = sortedRuns.find((run) => run.chapterIndex === expandedChapterIndex && run.sheet);
  const batchVoiceRegistry = batch.config?.sharedContext?.voiceRegistry || [];

  return (
    <section className={`${styles.card} ${styles.batchProgressCard}`}>
      <div className={styles.batchProgressHeader}>
        <div>
          <div className={styles.workOrderKicker}>批次进度面板</div>
          <h2>{batch.bookTitle}</h2>
          <p>
            已完成 {batch.completedChapters}/{batch.totalChapters} 章，失败 {batch.failedChapters} 章，
            累计 ¥{Number(batch.actualCost || 0).toFixed(2)}
          </p>
        </div>
        <div className={styles.batchProgressActions}>
          <button type="button" className={styles.ghostButton} onClick={onRefresh}>刷新状态</button>
          <button type="button" className={styles.confirmStartButton} onClick={onExportDocx} disabled={batch.completedChapters === 0}>导出 Word DOCX</button>
          <button type="button" className={styles.ghostButton} onClick={onExport} disabled={batch.completedChapters === 0}>导出 Markdown 留痕</button>
          <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={batch.status !== 'running'}>取消批次</button>
        </div>
      </div>

      <div
        className={styles.batchChapterViewport}
        style={{ height: VIEWPORT_HEIGHT }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: sortedRuns.length * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
            {visible.map((run) => {
              const checked = run.status === 'completed';
              const failed = run.status === 'failed';
              const symbol = checked ? '✓' : failed ? '✗' : run.status === 'running' ? '⟳' : '○';
              return (
                <div
                  key={`${run.chapterIndex}-${run.attempt || 1}`}
                  className={failed ? styles.batchRunRowFailed : styles.batchRunRow}
                  style={{ height: ROW_HEIGHT }}
                >
                  <button
                    type="button"
                    className={styles.batchRunRowMain}
                    onClick={() => setExpandedChapterIndex((prev) => (prev === run.chapterIndex ? null : run.chapterIndex))}
                  >
                    <span>{symbol}</span>
                    <strong>{run.chapterTitle || `第 ${run.chapterIndex + 1} 章`}</strong>
                    <em>{run.status}</em>
                    <small>{run.cost ? `¥${Number(run.cost).toFixed(2)}` : ''}</small>
                  </button>
                  {failed ? (
                    <button type="button" className={styles.ghostButton} onClick={() => onRerun(run.chapterIndex)}>
                      重跑
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {batchVoiceRegistry.length > 0 ? (
        <div className={styles.batchVoiceRegistrySummary}>
          <strong>跨章角色音已锁定 {batchVoiceRegistry.length} 个角色</strong>
          <span>{batchVoiceRegistry.slice(0, 8).map((item) => item.roleName).join(' / ')}</span>
        </div>
      ) : null}

      {currentRun?.sheet ? (
        <div className={styles.batchExpandedSheet}>
          <div className={styles.sectionTitle}>展开产物预览</div>
          <DeliveryPreview sheet={currentRun.sheet} />
        </div>
      ) : null}
    </section>
  );
}
