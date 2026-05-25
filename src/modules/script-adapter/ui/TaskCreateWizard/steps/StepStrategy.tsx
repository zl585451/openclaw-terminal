import { useWizardContext } from '../WizardContext';
import styles from '../../../styles/scriptAdapter.module.css';

export function StepStrategy() {
  const {
    analysisReport,
    selectedStrategyId,
    setSelectedStrategyId,
  } = useWizardContext();

  if (!analysisReport) {
    return <div className={styles.composerGateCard}>正在进行初读分析，请稍候...</div>;
  }

  return (
    <div className={styles.composerGateCard}>
      {analysisReport.evidence && analysisReport.evidence.length > 0 && (
        <div className={styles.evidencePanel}>
          <div className={styles.taskFieldLabel}>问题证据</div>
          {analysisReport.evidence.map((item: any, idx: number) => (
            <div key={`${item.location}-${item.issue}-${idx}`} className={styles.evidenceItem}>
              <div>
                <strong>{item.location}</strong>
                <span>{item.issue}</span>
              </div>
              <p>{item.quote}</p>
            </div>
          ))}
        </div>
      )}

      <div className={styles.strategyPanel}>
        <div className={styles.composerSectionHeader}>
          <div>
            <div className={styles.taskFieldLabel}>选择修改方向</div>
            <span className={styles.mutedText}>这里决定"怎么改、改多深"，不会在你确认前启动制作 Agent。</span>
          </div>
        </div>
        <div className={styles.strategyGrid}>
          {analysisReport.strategyOptions.map((option: any) => (
            <button
              key={option.id}
              type="button"
              className={selectedStrategyId === option.id ? styles.strategyCardActive : styles.strategyCard}
              onClick={() => setSelectedStrategyId(option.id)}
            >
              <span>{option.recommended ? 'AI 推荐' : option.editDepth}</span>
              <strong>{option.title}</strong>
              <em>{option.desc}</em>
              <small>{option.impact}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
