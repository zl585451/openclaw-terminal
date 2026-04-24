import { useScriptAdapterStore } from '../../store/scriptAdapterStore';
import { scriptAdapterActions } from '../../store/actions';
import { StageNode } from './StageNode';
import { StatusDot } from '../shared/StatusDot';
import styles from '../../styles/scriptAdapter.module.css';

const LEGEND_ITEMS = [
  { status: 'done' as const, label: '已完成' },
  { status: 'running' as const, label: '运行中' },
  { status: 'review' as const, label: '待审校' },
  { status: 'pending' as const, label: '待开始' },
];

export function PipelineView() {
  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const stages = useScriptAdapterStore((state) =>
    currentProjectId ? state.stages[currentProjectId] ?? [] : [],
  );
  const selectedStageIdx = useScriptAdapterStore((state) => state.selectedStageIdx);
  const selectedStage = stages.find((stage) => stage.idx === selectedStageIdx) ?? stages[0];

  if (!currentProjectId || stages.length === 0 || !selectedStage) {
    return <div className={`${styles.card} ${styles.placeholderCard}`}>等待流程数据加载。</div>;
  }

  return (
    <section className={styles.pipeline}>
      <div className={styles.legend}>
        {LEGEND_ITEMS.map((item) => (
          <div key={item.status} className={styles.legendItem}>
            <StatusDot status={item.status} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className={styles.pipelineScroller}>
        <div className={styles.pipelineTrack}>
          {stages.map((stage, index) => (
            <div key={stage.id} className={styles.pipelineTrack}>
              <StageNode
                stage={stage}
                active={stage.idx === selectedStageIdx}
                onSelect={(idx) => scriptAdapterActions.selectStage(idx)}
              />
              {index < stages.length - 1 ? <div className={styles.pipelineArrow}>→</div> : null}
            </div>
          ))}
        </div>
      </div>

      <div className={`${styles.card} ${styles.pipelineDetail}`}>
        <div className={styles.detailTitleGroup}>
          <div className={styles.detailEyebrow}>Pipeline Detail</div>
          <div className={styles.detailTitle}>{selectedStage.name}</div>
          <div className={styles.detailDesc}>{selectedStage.description}</div>
        </div>

        <div className={styles.pipelineDetailStats}>
          <div className={styles.pipelineDetailItem}>
            <div className={styles.pipelineDetailLabel}>Token</div>
            <div className={styles.pipelineDetailValue}>{selectedStage.tokensUsed}</div>
          </div>
          <div className={styles.pipelineDetailItem}>
            <div className={styles.pipelineDetailLabel}>用时</div>
            <div className={styles.pipelineDetailValue}>{selectedStage.runtimeSeconds}s</div>
          </div>
          <div className={styles.pipelineDetailItem}>
            <div className={styles.pipelineDetailLabel}>产物数</div>
            <div className={styles.pipelineDetailValue}>{selectedStage.artifactCount}</div>
          </div>
          <div className={styles.pipelineDetailItem}>
            <div className={styles.pipelineDetailLabel}>Agent</div>
            <div className={styles.pipelineDetailValue}>{selectedStage.agentRef}</div>
          </div>
        </div>

        <div className={styles.detailActionRow}>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => scriptAdapterActions.openStageInWorkbench(selectedStage.idx)}
          >
            进入此阶段 →
          </button>
        </div>
      </div>
    </section>
  );
}
