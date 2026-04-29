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

const ARTIFACT_NAME: Record<string, string> = {
  chapter_index: '章节索引',
  project_context: '项目上下文',
  plot_lock: '剧情锁定表',
  character_profile: '人物档案',
  artifact_tracker: '物件追踪表',
  timeline: '时间线',
  style_profile: '风格画像',
  scene_breakdown: '场景拆解',
  adapted_script: '改编台本',
  voice_registry: '角色音表',
  performance_design: '演播设计',
  review_report: '质检报告',
  final_package: '交付包',
};

export function PipelineView() {
  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const stages = useScriptAdapterStore((state) =>
    currentProjectId ? state.stages[currentProjectId] ?? [] : [],
  );
  const selectedStageIdx = useScriptAdapterStore((state) => state.selectedStageIdx);
  const selectedStage = stages.find((stage) => stage.idx === selectedStageIdx) ?? stages[0];
  const project = useScriptAdapterStore((state) =>
    currentProjectId ? state.projects[currentProjectId] : null,
  );
  const template = useScriptAdapterStore((state) =>
    project ? state.templates[project.templateId] : null,
  );

  if (!currentProjectId || stages.length === 0 || !selectedStage) {
    return <div className={`${styles.card} ${styles.placeholderCard}`}>等待流程数据加载。</div>;
  }

  return (
    <section className={styles.pipeline}>
      <div className={`${styles.card} ${styles.templateBanner}`}>
        <div>
          <div className={styles.detailEyebrow}>Team Template</div>
          <div className={styles.detailTitle}>{template?.name ?? '未选择团队模板'}</div>
          <div className={styles.detailDesc}>{template?.description ?? '等待模板数据加载。'}</div>
        </div>
        <div className={styles.templateMeta}>
          <span className={styles.agentMetaTag}>{project?.templateType ?? 'unknown'}</span>
          <span className={styles.agentMetaTag}>{template?.id ?? 'no-template'}</span>
        </div>
      </div>

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

        <div className={styles.tagList}>
          {selectedStage.outputArtifactTypes.map((type) => (
            <span key={type} className={styles.agentMetaTag} title={type}>
              {ARTIFACT_NAME[type] ?? type}
            </span>
          ))}
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
