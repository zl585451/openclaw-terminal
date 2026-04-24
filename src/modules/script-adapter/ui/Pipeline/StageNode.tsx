import type { Stage } from '../../types/stage';
import { StatusDot } from '../shared/StatusDot';
import styles from '../../styles/scriptAdapter.module.css';

function getStageSubtitle(stage: Stage): string {
  if (stage.status === 'running') return '进行中';
  if (stage.status === 'review') return '待审校';
  if (stage.status === 'pending') return '待开始';
  return `${stage.artifactCount} 件产物`;
}

interface StageNodeProps {
  stage: Stage;
  active: boolean;
  onSelect: (idx: number) => void;
}

export function StageNode({ stage, active, onSelect }: StageNodeProps) {
  return (
    <button
      type="button"
      className={`${styles.stageNode} ${active ? styles.stageNodeActive : ''}`}
      onClick={() => onSelect(stage.idx)}
    >
      <div className={styles.stageNodeTop}>
        <span className={styles.stageNodeIndex}>Stage {stage.idx}</span>
        <StatusDot status={stage.status} />
      </div>
      <div className={styles.stageNodeName}>{stage.name}</div>
      <div className={styles.stageNodeSub}>{getStageSubtitle(stage)}</div>
    </button>
  );
}
