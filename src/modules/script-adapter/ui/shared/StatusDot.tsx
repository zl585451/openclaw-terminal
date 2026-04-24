import type { StageStatus } from '../../types/stage';
import styles from '../../styles/scriptAdapter.module.css';

interface Props {
  status: StageStatus;
}

export function StatusDot({ status }: Props) {
  return <span className={`${styles.statusDot} ${styles[status]}`} aria-label={status} />;
}
