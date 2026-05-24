import { useWizardContext } from '../WizardContext';
import styles from '../../styles/scriptAdapter.module.css';

export function StepStrategy() {
  const context = useWizardContext();
  const {
    analysisReport,
  } = context;

  if (!analysisReport) {
    return <div className={styles.composerGateCard}>正在进行初读分析，请稍候...</div>;
  }

  return (
    <div className={`${styles.card} ${styles.composerGateCard}`}>
      <div className={styles.composerSectionHeader}>
        <div>
          <div className={styles.detailEyebrow}>第 3 步 · 确定修改方向</div>
          <h2>初读分析报告与策略选择</h2>
          <p className={styles.sectionLead}>AI 已读取你的素材并出具了初读分析报告。请选择你最倾向的修改策略。</p>
        </div>
      </div>

      <div className={styles.strategyReport}>
        <div className={styles.strategySummary}>
          <h3>初读摘要</h3>
          <p>{analysisReport.summary}</p>
        </div>

        <div className={styles.strategyOptions}>
          <h3>推荐修改方向</h3>
          {analysisReport.strategyOptions.map((opt: any) => (
            <div key={opt.id} className={styles.strategyCard}>
              <h4>{opt.title}</h4>
              <p>{opt.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
