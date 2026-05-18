import styles from '../styles/scriptAdapter.module.css';

interface WizardStepItem {
  index: number;
  title: string;
  desc: string;
  status: 'active' | 'done' | 'pending';
}

interface TaskCreateWizardSidebarProps {
  progressValue: number;
  analysisCompleted: boolean;
  isAnalysisRunning: boolean;
  sourceConfirmed: boolean;
  isIntakeRunning: boolean;
  intakeStepIndex: number;
  intakeStepCount: number;
  createSteps: readonly WizardStepItem[];
  canOpenStep: (step: number) => boolean;
  openStep: (step: number) => void;
}

export function TaskCreateWizardSidebar({
  progressValue,
  analysisCompleted,
  isAnalysisRunning,
  sourceConfirmed,
  isIntakeRunning,
  intakeStepIndex,
  intakeStepCount,
  createSteps,
  canOpenStep,
  openStep,
}: TaskCreateWizardSidebarProps) {
  return (
    <aside className={styles.composerRail}>
      <div className={`${styles.card} ${styles.composerProgressCard}`}>
        <div className={styles.sidebarSectionLabel}>任务完整度</div>
        <div className={styles.composerProgressValue}>{progressValue}%</div>
        <div className={styles.composerProgressTrack}>
          <span style={{ width: `${progressValue}%` }} />
        </div>
        <div className={styles.mutedText}>
          {analysisCompleted
            ? 'AI 初读分析完成，等待你确认修改方向。'
            : isAnalysisRunning
              ? '业务分析 Agent 正在输出问题、证据和修改方向。'
              : sourceConfirmed
                ? '已生成任务草案，等待你确认目标订单。'
                : isIntakeRunning
                  ? `正在执行第 ${Math.min(intakeStepIndex + 1, intakeStepCount)} 步素材摄入。`
                  : '先确认素材，系统再自动生成任务草案。'}
        </div>
      </div>

      <div className={styles.composerStepList}>
        {createSteps.map((step) => (
          <button
            type="button"
            key={step.index}
            className={`${styles.composerStepItem} ${
              step.status === 'active' ? styles.composerStepItemActive : ''
            } ${
              step.status === 'done' ? styles.composerStepItemDone : ''
            }`}
            disabled={!canOpenStep(step.index)}
            onClick={() => openStep(step.index)}
          >
            <span className={styles.composerStepIndex}>{step.index}</span>
            <div>
              <strong>{step.title}</strong>
              <span>{step.desc}</span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
