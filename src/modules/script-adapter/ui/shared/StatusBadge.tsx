import type { StageStatus } from '../../types/stage';
import styles from '../../styles/scriptAdapter.module.css';

const LABEL: Record<StageStatus, string> = {
  done: '已完成',
  running: '运行中',
  review: '待审校',
  pending: '待开始',
  failed: '失败',
};

interface Props {
  status: StageStatus;
}

export function StatusBadge({ status }: Props) {
  return <span className={`${styles.badge} ${styles[`badge-${status}`]}`}>{LABEL[status]}</span>;
}
