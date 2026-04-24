import { StageSidebar } from './StageSidebar';
import { StageDetail } from './StageDetail';
import styles from '../../styles/scriptAdapter.module.css';

export function WorkbenchView() {
  return (
    <div className={styles.workbench}>
      <StageSidebar />
      <StageDetail />
    </div>
  );
}
