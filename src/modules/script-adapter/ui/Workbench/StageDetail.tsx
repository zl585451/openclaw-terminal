import type { Artifact, ArtifactStatus, ArtifactType } from '../../types/artifact';
import type { Chapter } from '../../types/project';
import { useScriptAdapterStore } from '../../store/scriptAdapterStore';
import { scriptAdapterActions } from '../../store/actions';
import { StatusBadge } from '../shared/StatusBadge';
import { MetricCard } from '../shared/MetricCard';
import styles from '../../styles/scriptAdapter.module.css';

type DisplayArtifact = Artifact & {
  displayTitle: string;
};

const PLACEHOLDER_STAGE_SET = new Set([2, 3, 5, 7]);

const ARTIFACT_LABEL: Record<ArtifactType, string> = {
  team_template: '团队模板',
  project_context: '项目上下文',
  chapter_index: '章节索引',
  plot_lock: '剧情锁定表',
  character_profile: '人物档案',
  artifact_tracker: '物件追踪表',
  timeline: '时间线',
  style_profile: '风格画像',
  scene_breakdown: '场景拆解',
  distilled_content: '提炼内容',
  adapted_script: '改编台本',
  voice_registry: '角色音表',
  performance_design: '演播设计',
  review_report: '质检报告',
  scene_script: '场景台本',
  consistency_report: '一致性报告',
  final_package: '交付包',
};

const ARTIFACT_STATUS_LABEL: Record<ArtifactStatus, string> = {
  draft: '草稿',
  reviewing: '审核中',
  approved: '已通过',
  rejected: '已打回',
  superseded: '已被替代',
};

const STAGE_STATUS_LABEL: Record<string, string> = {
  done: '已完成',
  running: '进行中',
  review: '待复核',
  pending: '待执行',
  failed: '失败',
};

function getArtifactLabel(type: string): string {
  return ARTIFACT_LABEL[type as ArtifactType] ?? type;
}

function buildVirtualArtifact(
  base: Artifact,
  overrides: Partial<Artifact>,
  displayTitle: string,
): DisplayArtifact {
  return {
    ...base,
    ...overrides,
    displayTitle,
  };
}

function getDisplayArtifacts(
  stageIdx: number,
  stageOutputTypes: string[],
  artifacts: Artifact[],
  chapters: Chapter[],
): DisplayArtifact[] {
  const chapterIndex = artifacts.find((item) => item.type === 'chapter_index');
  const projectArtifacts = artifacts.filter((item) =>
    ['character_profile', 'artifact_tracker', 'timeline', 'style_profile'].includes(item.type),
  );
  const latestSceneScript = artifacts.find((item) => item.type === 'scene_script');

  const directMatches = artifacts.filter((artifact) => stageOutputTypes.includes(artifact.type));
  if (directMatches.length > 0) {
    return directMatches.map((artifact) => ({
      ...artifact,
      displayTitle: ARTIFACT_LABEL[artifact.type],
    }));
  }

  if (stageIdx === 0 && chapterIndex) {
    return [{ ...chapterIndex, displayTitle: '章节切分索引' }];
  }

  if (stageIdx === 1) {
    return projectArtifacts.map((artifact) => ({ ...artifact, displayTitle: ARTIFACT_LABEL[artifact.type] }));
  }

  if (stageIdx === 4 && latestSceneScript) {
    return [
      {
        ...latestSceneScript,
        displayTitle: `场景台本 · ${latestSceneScript.scopeId}`,
      },
    ];
  }

  if (stageIdx === 6 && latestSceneScript) {
    const chapterFive = chapters.find((chapter) => chapter.id === 'ch-05');
    const basePreview = latestSceneScript.contentPreview.slice(0, 120);
    return [
      {
        ...latestSceneScript,
        displayTitle: `待审校台本 · ${latestSceneScript.scopeId}`,
      },
      buildVirtualArtifact(
        latestSceneScript,
        {
          id: 'virtual-consistency-report-stage6',
          type: 'consistency_report',
          status: 'reviewing',
          scopeId: latestSceneScript.scopeId,
          version: 1,
          contentPreview:
            `场景 ${latestSceneScript.scopeId} 的人物称谓、年代口吻与物件描述需要复核。重点关注 ${chapterFive?.title ?? '第5章'} 的时代质感与称谓一致性。`,
          createdAt: latestSceneScript.createdAt,
        },
        '人工审校清单 · 一致性复核',
      ),
      buildVirtualArtifact(
        latestSceneScript,
        {
          id: 'virtual-final-package-stage6',
          type: 'final_package',
          status: 'draft',
          scopeId: latestSceneScript.scopeId,
          version: 0,
          contentPreview:
            `待人工审校通过后，当前打包候选内容将从以下台本片段生成交付包：${basePreview}...`,
          createdAt: latestSceneScript.createdAt,
        },
        '交付候选包 · 待审校确认',
      ),
    ];
  }

  return [];
}

export function StageDetail() {
  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const project = useScriptAdapterStore((state) =>
    currentProjectId ? state.projects[currentProjectId] : null,
  );
  const chapters = useScriptAdapterStore((state) =>
    currentProjectId ? state.chapters[currentProjectId] ?? [] : [],
  );
  const artifacts = useScriptAdapterStore((state) =>
    currentProjectId ? state.artifacts[currentProjectId] ?? [] : [],
  );
  const selectedStageIdx = useScriptAdapterStore((state) => state.selectedStageIdx);
  const stage = useScriptAdapterStore((state) =>
    currentProjectId
      ? (state.stages[currentProjectId] ?? []).find((item) => item.idx === selectedStageIdx) ?? null
      : null,
  );
  const agent = useScriptAdapterStore((state) =>
    stage ? state.agents.find((item) => item.id === stage.agentRef.split('@')[0]) ?? null : null,
  );

  if (!project || !currentProjectId || !stage) {
    return <div className={`${styles.card} ${styles.placeholderCard}`}>等待阶段数据加载。</div>;
  }

  const displayArtifacts = getDisplayArtifacts(stage.idx, stage.outputArtifactTypes, artifacts, chapters);

  return (
    <section className={styles.detailPanel}>
      <div className={`${styles.card} ${styles.detailHeader}`}>
        <div className={styles.detailTitleGroup}>
          <div className={styles.detailEyebrow}>阶段 {stage.idx}</div>
          <div className={styles.detailTitle}>{stage.name}</div>
          <div className={styles.detailDesc}>{stage.description}</div>
        </div>

        <div className={styles.detailActionRow}>
          <StatusBadge status={stage.status} />
          {stage.requiresHumanReview ? <span className={styles.reviewPill}>需人工确认</span> : null}
          {stage.status === 'running' ? (
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => scriptAdapterActions.pauseStage(currentProjectId, stage.idx)}
            >
              暂停阶段
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.metricsGrid}>
        <MetricCard label="负责角色" value={agent?.role ?? stage.name} sub="制作团队成员" />
        <MetricCard label="当前产物" value={stage.artifactCount} sub="本阶段已产出" />
        <MetricCard label="当前状态" value={STAGE_STATUS_LABEL[stage.status] ?? '待执行'} sub={stage.status === 'running' ? '正在处理' : '等待推进'} />
        <MetricCard label="人工复核" value={stage.requiresHumanReview ? '需要' : '不需要'} sub="进入下一步前" />
      </div>

      <div className={styles.contractGrid}>
        <div className={`${styles.card} ${styles.contractCard}`}>
          <div className={styles.sectionTitleSmall}>本阶段会做什么</div>
          <div className={styles.ruleDocText}>{stage.description}</div>
        </div>
        <div className={`${styles.card} ${styles.contractCard}`}>
          <div className={styles.sectionTitleSmall}>会交付什么</div>
          <div className={styles.tagList}>
            {stage.outputArtifactTypes.map((type) => (
              <span key={type} className={styles.agentMetaTag}>
                {getArtifactLabel(type)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {stage.requiresHumanReview ? (
        <div className={`${styles.card} ${styles.reviewBox}`}>
          <div className={styles.sectionTitleSmall}>人工确认</div>
          <div className={styles.reviewBoxText}>
            当前阶段需要统筹或导演确认后再进入下一步。重点检查角色归属、未定占位、返工风险和是否允许后续 Agent 继续消费该产物。
          </div>
        </div>
      ) : null}

      {PLACEHOLDER_STAGE_SET.has(stage.idx) && displayArtifacts.length === 0 ? (
        <div className={`${styles.card} ${styles.placeholderCard}`}>
          <div className={styles.sectionTitle}>详情占位</div>
          <div className={styles.mutedText}>（此阶段骨架阶段未实现详情视图）</div>
        </div>
      ) : (
        <div className={styles.artifactSection}>
          <div className={styles.sectionTitle}>阶段产物</div>
          {stage.status === 'pending' ? (
            <div className={`${styles.card} ${styles.placeholderCard}`}>当前阶段尚未开始，暂无产物。</div>
          ) : (
            <div className={styles.artifactList}>
              {displayArtifacts.map((artifact) => (
                <div key={artifact.id} className={`${styles.card} ${styles.artifactCard}`}>
                  <div className={styles.artifactHeader}>
                    <div className={styles.artifactTitleGroup}>
                      <div className={styles.artifactTitle}>{artifact.displayTitle}</div>
                      <div className={styles.artifactMeta}>
                        {ARTIFACT_LABEL[artifact.type]} · {ARTIFACT_STATUS_LABEL[artifact.status]} · v
                        {artifact.version}
                      </div>
                    </div>
                    <StatusBadge
                      status={
                        artifact.status === 'approved'
                          ? 'done'
                          : artifact.status === 'reviewing'
                            ? 'review'
                            : artifact.status === 'rejected'
                              ? 'failed'
                              : 'pending'
                      }
                    />
                  </div>

                  <div className={styles.artifactPreview}>{artifact.contentPreview}</div>

                  <div className={styles.artifactActions}>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => scriptAdapterActions.openArtifact(artifact.id)}
                    >
                      展开
                    </button>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() =>
                        scriptAdapterActions.rejectArtifact(
                          artifact.id,
                          `stage-${stage.idx}-${artifact.scopeId}`,
                        )
                      }
                    >
                      打回重跑
                    </button>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => scriptAdapterActions.viewArtifactHistory(artifact.id)}
                    >
                      历史版本
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
