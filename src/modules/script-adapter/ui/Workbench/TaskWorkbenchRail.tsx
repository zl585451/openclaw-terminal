import styles from '../../styles/scriptAdapter.module.css';

const TASK_STEPS = [
  { label: '确认素材', desc: '文本已标准化入库', status: 'done' },
  { label: '确认目标和范围', desc: '多人演播有声书 · 第1章', status: 'done' },
  { label: '确认修改策略', desc: '轻度听感改编已锁定', status: 'done' },
  { label: '执行制作', desc: '按 Agent 队列生成产物', status: 'running' },
] as const;

interface TaskWorkbenchRailProps {
  sidebarLabel: string;
  projectName: string;
  chapterLabel: string;
  metaLabel: string;
  executionSummary?: string | null;
  onBack?: () => void;
}

export function TaskWorkbenchRail({
  sidebarLabel,
  projectName,
  chapterLabel,
  metaLabel,
  executionSummary,
  onBack,
}: TaskWorkbenchRailProps) {
  return (
    <aside className={styles.taskRail}>
      <div className={`${styles.card} ${styles.taskProjectCard}`}>
        <div className={styles.sidebarSectionLabel}>{sidebarLabel}</div>
        <div className={styles.projectCardTitle}>{projectName}</div>
        <div className={styles.taskProjectMeta}>
          <span>{chapterLabel}</span>
          <span>多人演播样章</span>
          <span>{metaLabel}</span>
        </div>
      </div>

      <div className={styles.taskStepList}>
        {TASK_STEPS.map((step, index) => {
          const isDone = executionSummary ? index < 4 || metaLabel === '已完成' : step.status === 'done';
          const isRunning = executionSummary ? index === 3 && metaLabel === '执行中' : step.status === 'running';
          return (
            <div
              key={step.label}
              className={`${styles.taskStep} ${isRunning ? styles.taskStepActive : ''} ${isDone ? styles.taskStepDone : ''}`}
            >
              <span className={styles.taskStepIndex}>{index + 1}</span>
              <div className={styles.taskStepText}>
                <strong>{step.label}</strong>
                <span>{executionSummary && index === 3 ? executionSummary : step.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {onBack ? (
        <button
          type="button"
          className={styles.secondaryWideButton}
          onClick={onBack}
        >
          返回修改方案
        </button>
      ) : null}
    </aside>
  );
}
