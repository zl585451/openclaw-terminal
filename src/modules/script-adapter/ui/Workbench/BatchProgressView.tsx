import { useEffect, useMemo, useState } from 'react';
import type { BatchActivityEntry, BatchJob, ChapterRunRecord } from '../../types/batch';
import { ReviewGatePreview } from './ReviewGatePreview';
import { DeliveryPreview } from './DeliveryPreview';
import styles from '../../styles/scriptAdapter.module.css';

interface BatchProgressViewProps {
  batch: BatchJob;
  chapterRuns: ChapterRunRecord[];
  activity: BatchActivityEntry[];
  lastEventAt: string | null;
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
  activity,
  lastEventAt,
  onRefresh,
  onRerun,
  onExport,
  onExportDocx,
  onCancel,
}: BatchProgressViewProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [expandedChapterIndex, setExpandedChapterIndex] = useState<number | null>(null);
  const sortedRuns = useMemo(
    () => [...chapterRuns].sort((a, b) => a.chapterIndex - b.chapterIndex),
    [chapterRuns],
  );
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const visible = sortedRuns.slice(start, Math.min(sortedRuns.length, start + Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 8));
  const currentRun = sortedRuns.find((run) => run.chapterIndex === expandedChapterIndex && run.sheet);
  const batchVoiceRegistry = batch.config?.sharedContext?.voiceRegistry || [];
  const completed = batch.status === 'completed' && batch.failedChapters === 0;
  const failedBatch = batch.status === 'failed' || batch.failedChapters > 0;
  const progressPercent = batch.totalChapters > 0
    ? Math.round(((batch.completedChapters + batch.failedChapters) / batch.totalChapters) * 100)
    : 0;
  const runningRun = sortedRuns.find((run) => run.status === 'running');
  const runningSheetRun = runningRun?.sheet?.runs?.find((run) => run.status === 'running');
  const elapsedMs = runningRun?.startedAt ? Math.max(0, now - new Date(runningRun.startedAt).getTime()) : 0;
  const lastEventMs = lastEventAt ? Math.max(0, now - new Date(lastEventAt).getTime()) : null;
  const heartbeat = getHeartbeat(batch.status, lastEventMs);

  useEffect(() => {
    if (batch.status !== 'running') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [batch.status]);

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

      {failedBatch ? (
        <div className={styles.deliveryFailedCard}>
          <div>
            <div className={styles.workOrderKicker}>执行失败</div>
            <h2>本批次有章节失败，暂不能导出交付物。</h2>
            <p>
              已完成 {batch.completedChapters}/{batch.totalChapters} 章，失败 {batch.failedChapters} 章。
              请查看失败章节错误，修复后重跑。
            </p>
          </div>
        </div>
      ) : null}

      <div className={styles.batchProgressHeader}>
        <div>
          <div className={styles.workOrderKicker}>批次进度</div>
          <h2>{completed ? '已完成' : failedBatch ? '执行失败' : batch.status === 'running' ? '正在制作' : '批次状态'}</h2>
          <p>{batch.bookTitle}</p>
        </div>
        <div className={styles.batchLiveStatus}>
          <span className={`${styles.livePulse} ${styles[`livePulse--${heartbeat.tone}`]}`} />
          <strong>{heartbeat.label}</strong>
          <small>
            {batch.status === 'running' ? `已运行 ${formatDuration(elapsedMs)}` : `状态 ${batch.status}`}
            {lastEventMs != null ? ` · 最近更新 ${formatDuration(lastEventMs)}前` : ''}
          </small>
        </div>
        <div className={styles.batchProgressActions}>
          <button type="button" className={styles.ghostButton} onClick={onRefresh}>刷新状态</button>
          <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={batch.status !== 'running'}>取消批次</button>
        </div>
      </div>

      {runningRun ? (
        <div className={styles.batchCurrentWork}>
          <div>
            <span>当前章节</span>
            <strong>{runningRun.chapterTitle || `第 ${runningRun.chapterIndex + 1} 章`}</strong>
          </div>
          <div>
            <span>当前角色</span>
            <strong>{labelAgent(runningSheetRun?.agentId) || '等待后台事件'}</strong>
          </div>
          <div>
            <span>当前阶段</span>
            <strong>{runningSheetRun?.progressSummary || activity[0]?.title || '正在连接后台状态'}</strong>
          </div>
        </div>
      ) : null}

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

      <div className={styles.batchActivityPanel}>
        <div className={styles.batchActivityHeader}>
          <strong>后台活动</strong>
          <span>{activity.length > 0 ? `${activity.length} 条最近事件` : '等待事件'}</span>
        </div>
        <div className={styles.batchActivityList}>
          {activity.length === 0 ? (
            <div className={styles.batchActivityEmpty}>
              后台事件会在这里出现。真实 Agent 请求模型时，如果长时间没有返回，会显示最近更新时间。
            </div>
          ) : activity.slice(0, 8).map((item) => (
            <div key={item.id} className={styles.batchActivityItem}>
              <time>{new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</time>
              <div>
                <strong>{item.title}</strong>
                {item.detail ? <span>{item.detail}</span> : null}
              </div>
              {typeof item.progressPercent === 'number' ? <em>{Math.round(item.progressPercent)}%</em> : null}
            </div>
          ))}
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
              const symbol = checked ? '✓' : failed ? '✗' : run.status === 'awaiting_review' ? '⏸' : run.status === 'running' ? '⟳' : '○';
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
                  {failed && run.errorMessage ? (
                    <div className={styles.batchRunErrorText}>{run.errorMessage}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

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
          <ReviewGatePreview run={currentRun} bookId={batch.bookId} />
          <DeliveryPreview sheet={currentRun.sheet} />
        </div>
      ) : null}
    </section>
  );
}

function getHeartbeat(status: BatchJob['status'], lastEventMs: number | null) {
  if (status !== 'running') return { tone: 'idle', label: '后台未运行' };
  if (lastEventMs == null) return { tone: 'warn', label: '等待后台事件' };
  if (lastEventMs <= 10000) return { tone: 'good', label: '后台活跃' };
  if (lastEventMs <= 45000) return { tone: 'warn', label: '模型处理中' };
  return { tone: 'danger', label: '长时间无更新' };
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}秒`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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
