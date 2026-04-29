import { useMemo, useState } from 'react';
import type { BatchJob, ChapterRunRecord } from '../../types/batch';
import { approveGatewayGate, rejectGatewayGate } from '../../services/gatewayBatch';
import { ReviewGatePreview } from './ReviewGatePreview';
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

const VOICE_CATEGORY_LABEL: Record<string, string> = {
  narrator: '旁白',
  main: '主角',
  support: '配角',
  unresolved: '待定',
  sfx: '音效',
};

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
  const completed = batch.status === 'completed';
  const progressPercent = batch.totalChapters > 0
    ? Math.round(((batch.completedChapters + batch.failedChapters) / batch.totalChapters) * 100)
    : 0;

  return (
    <section className={`${styles.card} ${styles.batchProgressCard}`}>
      {completed ? (
        <div className={styles.deliveryCompleteCard}>
          <div>
            <div className={styles.workOrderKicker}>交付窗口</div>
            <h2>试产已完成，交付物可以导出了。</h2>
            <p>
              本次已完成 {batch.completedChapters}/{batch.totalChapters} 章，
              累计费用 ¥{Number(batch.actualCost || 0).toFixed(2)}。
            </p>
          </div>
          <div className={styles.deliveryCompleteActions}>
            <button type="button" className={styles.confirmStartButton} onClick={onExportDocx}>
              导出 Word DOCX
            </button>
            <button type="button" className={styles.ghostButton} onClick={onExport}>
              导出 Markdown 留痕
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.batchProgressHeader}>
        <div>
          <div className={styles.workOrderKicker}>批次进度</div>
          <h2>{completed ? '已完成' : batch.status === 'running' ? '正在试产' : '批次状态'}</h2>
          <p>{batch.bookTitle}</p>
        </div>
        <div className={styles.batchProgressActions}>
          <button type="button" className={styles.ghostButton} onClick={onRefresh}>刷新状态</button>
          <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={batch.status !== 'running'}>取消批次</button>
        </div>
      </div>

      <div className={styles.batchProgressMeter}>
        <div className={styles.batchProgressStats}>
          <div><span>进度</span><strong>{batch.completedChapters}/{batch.totalChapters}</strong></div>
          <div><span>失败</span><strong>{batch.failedChapters}</strong></div>
          <div><span>费用</span><strong>¥{Number(batch.actualCost || 0).toFixed(2)}</strong></div>
          <div><span>状态</span><strong>{batch.status}</strong></div>
        </div>
        <div className={styles.batchProgressTrack}>
          <span style={{ width: `${Math.min(100, progressPercent)}%` }} />
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
              const awaitingReview = run.status === 'awaiting_review';
              const symbol = checked ? '✓' : failed ? '✗' : awaitingReview ? '⏸' : run.status === 'running' ? '⟳' : '○';
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

      {sortedRuns.some((run) => run.status === 'awaiting_review') ? (
        <div className={styles.gateReviewBlock}>
          {sortedRuns
            .filter((run) => run.status === 'awaiting_review' && run.pendingGateId)
            .map((run) => (
              <div key={run.id}>
                <div className={styles.gateReviewActions}>
                  <div>
                    <strong>质检完成，等待你复核</strong>
                    <p>
                      {run.chapterTitle || `第 ${run.chapterIndex + 1} 章`}{' '}
                      的质检节点已暂停，确认后继续打包；拒绝则重跑；跳过则标记此章待人工处理。
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.confirmStartButton}
                    onClick={() => void approveGatewayGate(batch.id, run.pendingGateId!, '').then(onRefresh)}
                  >
                    ✓ 批准，继续制作
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => void rejectGatewayGate(batch.id, run.pendingGateId!, 'rerun').then(onRefresh)}
                  >
                    🔁 重跑此章
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => void rejectGatewayGate(batch.id, run.pendingGateId!, 'skip_flag').then(onRefresh)}
                  >
                    ⏭ 跳过，标记待处理
                  </button>
                </div>
                <ReviewGatePreview run={run} bookId={batch.bookId} />
              </div>
            ))}
        </div>
      ) : null}

      {batchVoiceRegistry.length > 0 ? (
        <details className={styles.voiceRegistryPanel}>
          <summary>
            <strong>跨章角色音</strong>
            <span>{batchVoiceRegistry.length} 个角色已锁定</span>
          </summary>
          <div className={styles.voiceRegistryTable}>
            <div className={styles.voiceRegistryHeader}>
              <span>角色名</span>
              <span>分类</span>
              <span>声音提示</span>
              <span>出现次数</span>
            </div>
            {batchVoiceRegistry.map((entry) => (
              <div key={entry.roleName} className={styles.voiceRegistryRow}>
                <span>{entry.roleName}</span>
                <span className={styles[`voiceCategory--${entry.category}`]}>
                  {VOICE_CATEGORY_LABEL[entry.category] ?? entry.category}
                </span>
                <span>{entry.voiceHint || '—'}</span>
                <span>{entry.appearanceCount ?? '—'}</span>
              </div>
            ))}
          </div>
          <small className={styles.voiceRegistryNote}>
            此列表由各章质检阶段累积生成，仅供参考。角色音编辑功能将在后续版本开放。
          </small>
        </details>
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
