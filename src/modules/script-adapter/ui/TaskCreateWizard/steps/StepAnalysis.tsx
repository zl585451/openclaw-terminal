import { useWizardContext } from '../WizardContext';
import styles from '../../styles/scriptAdapter.module.css';

export function StepAnalysis() {
  const context = useWizardContext();
  const {
    intakeResult,
    editingDecisionId,
    setEditingDecisionId,
    decisionOverrides,
    updateDecision,
    updateDecisionNote,
  } = context;

  if (!intakeResult) {
    return <div className={styles.composerGateCard}>请先完成素材确认</div>;
  }

  const getDecisionView = (item: any) => {
    return decisionOverrides[item.id] ?? { value: item.value, desc: item.desc, customNote: '' };
  };

  const getDecisionSourceLabel = (item: any) => {
    const currentValue = getDecisionView(item).value;
    const source = item.options.find((option: any) => option.value === currentValue)?.source;
    if (source === 'recommended') return 'AI 推荐';
    if (source === 'agent') return 'Agent 候选';
    return '同类预设';
  };

  const getDecisionEditButtonText = (item: any) => {
    if (editingDecisionId === item.id) return '完成修改';
    if (item.id === 'work_goal') return '修改目标';
    if (item.id === 'scope') return '修改范围';
    return '修改';
  };

  return (
    <div className={`${styles.card} ${styles.composerGateCard}`}>
      <div className={styles.composerSectionHeader}>
        <div>
          <div className={styles.detailEyebrow}>第 2 步 · 目标和工作范围确认</div>
          <h2>确认并优化本次任务目标</h2>
          <p className={styles.sectionLead}>AI 已围绕你的素材自动生成了最适配的草案。你可以对每一项参数做微调。</p>
        </div>
      </div>

      <div className={styles.decisionForm}>
        {intakeResult.taskDraft.confirmItems.map((item: any) => {
          const view = getDecisionView(item);
          const isEditing = editingDecisionId === item.id;
          return (
            <div key={item.id} className={styles.decisionItem}>
              <div className={styles.decisionHeader}>
                <strong>{item.label}</strong>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => setEditingDecisionId(isEditing ? null : item.id)}
                >
                  {getDecisionEditButtonText(item)}
                </button>
              </div>
              
              {!isEditing ? (
                <div className={styles.decisionValue}>
                  <span>{view.value}</span>
                  <span className={styles.sourceTag}>{getDecisionSourceLabel(item)}</span>
                  <p>{view.desc}</p>
                </div>
              ) : (
                <div className={styles.decisionEdit}>
                  <select
                    value={view.value}
                    onChange={(e) => {
                      const selectedOpt = item.options.find((opt: any) => opt.value === e.target.value);
                      if (selectedOpt) {
                        updateDecision(item.id, selectedOpt.value, selectedOpt.desc);
                      }
                    }}
                  >
                    {item.options.map((opt: any) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.value}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.decisionNote}>
                <textarea
                  placeholder="补充说明或给制作 Agent 的特别要求..."
                  value={view.customNote || ''}
                  onChange={(e) => updateDecisionNote(item.id, e.target.value)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
