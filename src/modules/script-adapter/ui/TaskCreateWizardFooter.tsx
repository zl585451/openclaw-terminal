import styles from '../styles/scriptAdapter.module.css';
import type { TaskWizardFooterPolicy } from '../wizardFooterPolicy';

interface TaskCreateWizardFooterProps {
  policy: TaskWizardFooterPolicy;
  onBack: () => void;
  onPrimaryAction: () => void;
}

export function TaskCreateWizardFooter({
  policy,
  onBack,
  onPrimaryAction,
}: TaskCreateWizardFooterProps) {
  return (
    <footer className={styles.composerActionBar}>
      <div>
        <strong>{policy.title}</strong>
        <span>{policy.desc}</span>
      </div>
      <div className={styles.createFooterActions}>
        <button type="button" className={styles.ghostButton} onClick={onBack}>
          稍后再建
        </button>
        <button type="button" className={styles.ghostButton}>
          保存草稿
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={policy.disabled}
          onClick={onPrimaryAction}
        >
          {policy.buttonText}
        </button>
      </div>
    </footer>
  );
}
