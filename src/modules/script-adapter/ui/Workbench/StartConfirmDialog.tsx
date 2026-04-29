import styles from '../../styles/scriptAdapter.module.css';
import type { BatchEstimate, TrialExecutionMode } from '../../types/batch';

interface StartConfirmDialogProps {
  open: boolean;
  loading: boolean;
  bookTitle: string;
  rangeLabel: string;
  estimate: BatchEstimate;
  executionMode: TrialExecutionMode;
  deliveryItemLabels: string[];
  warnings: string[];
  confirmButtonText: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function StartConfirmDialog({
  open,
  loading,
  bookTitle,
  rangeLabel,
  estimate,
  executionMode,
  deliveryItemLabels,
  warnings,
  confirmButtonText,
  onClose,
  onConfirm,
}: StartConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className={styles.workbenchModalOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.startConfirmDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-confirm-title"
      >
        <div className={styles.startConfirmHeader}>
          <div>
            <span>开工确认</span>
            <h3 id="start-confirm-title">确认启动这次试产？</h3>
          </div>
          <button type="button" aria-label="关闭开工确认" onClick={onClose}>×</button>
        </div>

        <div className={styles.startConfirmProject}>
          <span>素材</span>
          <strong>《{bookTitle}》</strong>
          <em>{rangeLabel}</em>
        </div>

        <div className={styles.startConfirmStats}>
          <div><span>章节</span><strong>{estimate.chapterCount}</strong></div>
          <div><span>字数</span><strong>{estimate.totalChars.toLocaleString('zh-CN')}</strong></div>
          <div><span>耗时</span><strong>{estimate.estimatedDurationMinutes} 分钟</strong></div>
          <div><span>费用</span><strong>¥{estimate.estimatedCostCny.toFixed(2)}</strong></div>
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

        {warnings.length > 0 ? (
          <div className={styles.startConfirmWarnings}>
            {warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : (
          <div className={styles.startConfirmSafeNote}>当前批次规模适合直接试跑。</div>
        )}

        <div className={styles.startConfirmActions}>
          <button type="button" className={styles.ghostButton} onClick={onClose}>
            再检查一下
          </button>
          <button
            type="button"
            className={styles.confirmStartButton}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? '启动中…' : confirmButtonText}
          </button>
        </div>
      </section>
    </div>
  );
}
