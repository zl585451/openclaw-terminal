import { useScriptAdapterStore } from '../../store/scriptAdapterStore';
import { scriptAdapterActions } from '../../store/actions';
import type { StageStatus } from '../../types/stage';
import { StatusDot } from '../shared/StatusDot';
import styles from '../../styles/scriptAdapter.module.css';

const TASK_STEPS = [
  { label: '确认素材', desc: '文本已标准化入库', status: 'done' },
  { label: '确认目标和范围', desc: '多人演播有声书 · 第1章', status: 'done' },
  { label: '确认修改策略', desc: '轻度听感改编已锁定', status: 'done' },
  { label: '执行制作', desc: '按 Agent 队列生成产物', status: 'running' },
  { label: '人工复核', desc: '检查样章、角色音和演播标注', status: 'pending' },
] as const;

const STATUS_LABEL: Record<StageStatus, string> = {
  done: '已完成',
  running: '执行中',
  review: '待复核',
  pending: '待执行',
  failed: '失败',
};

const ARTIFACT_LABELS: Record<string, string> = {
  adapted_script: '多人演播样章台本',
  voice_registry: '角色音标注表',
  performance_design: '演播设计稿',
  review_report: '质检审核报告',
  final_package: '交付包',
};

export function WorkbenchView() {
  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const project = useScriptAdapterStore((state) =>
    currentProjectId ? state.projects[currentProjectId] : null,
  );
  const chapters = useScriptAdapterStore((state) =>
    currentProjectId ? state.chapters[currentProjectId] ?? [] : [],
  );
  const stages = useScriptAdapterStore((state) =>
    currentProjectId ? state.stages[currentProjectId] ?? [] : [],
  );
  const artifacts = useScriptAdapterStore((state) =>
    currentProjectId ? state.artifacts[currentProjectId] ?? [] : [],
  );

  const currentChapter = chapters.find((chapter) => chapter.id === project?.meta.currentChapterId) ?? chapters[0];
  const sceneBreakdown = artifacts.find((artifact) => artifact.type === 'scene_breakdown');
  const plotLock = artifacts.find((artifact) => artifact.type === 'plot_lock');
  const styleProfile = artifacts.find((artifact) => artifact.type === 'style_profile');
  const productionStages = stages.filter((stage) => stage.idx >= 3);
  const firstRunnableStage = productionStages.find((stage) => stage.status === 'running')
    ?? productionStages.find((stage) => stage.status === 'pending')
    ?? productionStages[0];
  const expectedOutputs = productionStages
    .flatMap((stage) => stage.outputArtifactTypes)
    .filter((type, index, list) => list.indexOf(type) === index);

  const openRunnableStage = () => {
    scriptAdapterActions.openStageInWorkbench(firstRunnableStage?.idx ?? 3);
  };

  return (
    <div className={styles.taskWorkbench}>
      <aside className={styles.taskRail}>
        <div className={`${styles.card} ${styles.taskProjectCard}`}>
          <div className={styles.sidebarSectionLabel}>已锁定任务</div>
          <div className={styles.projectCardTitle}>{project?.name ?? '未命名项目'}</div>
          <div className={styles.taskProjectMeta}>
            <span>{currentChapter ? `第${currentChapter.index}章：${currentChapter.title}` : '未选择章节'}</span>
            <span>{project?.meta.genre ?? '题材待确认'}</span>
            <span>多人演播有声书样章</span>
          </div>
        </div>

        <div className={styles.taskStepList}>
          {TASK_STEPS.map((step, index) => (
            <div
              key={step.label}
              className={`${styles.taskStep} ${
                step.status === 'running' ? styles.taskStepActive : ''
              } ${step.status === 'done' ? styles.taskStepDone : ''}`}
            >
              <span className={styles.taskStepIndex}>{index + 1}</span>
              <div className={styles.taskStepText}>
                <strong>{step.label}</strong>
                <span>{step.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className={styles.secondaryWideButton}
          onClick={() => scriptAdapterActions.setViewMode('pipeline')}
        >
          查看完整 Agent 流程
        </button>
      </aside>

      <main className={styles.taskMain}>
        <section className={`${styles.card} ${styles.executionHeroCard}`}>
          <div className={styles.heroTaskCopy}>
            <div className={styles.detailEyebrow}>任务执行单已生成</div>
            <h2>下一步不是再选方向，而是按确认策略开始制作。</h2>
            <p>
              系统已锁定素材、产品目标、处理范围和修改策略。现在工作台负责展示执行队列、
              产物预期和人工复核点，方便你看到后台接下来怎么跑。
            </p>
          </div>
          <div className={styles.heroTaskActions}>
            <button type="button" className={styles.primaryButton} onClick={openRunnableStage}>
              启动第一轮制作
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => scriptAdapterActions.setViewMode('pipeline')}
            >
              查看执行队列
            </button>
          </div>
        </section>

        <section className={styles.executionSummaryGrid}>
          <div className={`${styles.card} ${styles.executionBriefCard}`}>
            <div className={styles.sectionTitle}>本轮任务执行单</div>
            <div className={styles.executionBriefGrid}>
              <div>
                <span>产品目标</span>
                <strong>多人演播有声书样章</strong>
              </div>
              <div>
                <span>处理范围</span>
                <strong>{currentChapter ? `第${currentChapter.index}章 · 前半段试跑` : '第1章前半段试跑'}</strong>
              </div>
              <div>
                <span>修改策略</span>
                <strong>保留剧情，只提升听感和演播可执行性</strong>
              </div>
              <div>
                <span>人工复核</span>
                <strong>角色音回绑、演播标注、质检结论</strong>
              </div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.outputChecklistCard}`}>
            <div className={styles.sectionTitle}>本轮会交付什么</div>
            <div className={styles.outputChecklist}>
              {expectedOutputs.map((type) => (
                <div key={type}>
                  <span>{ARTIFACT_LABELS[type] ?? type}</span>
                  <strong>{type === 'final_package' ? '最终阶段生成' : '本轮链路产出'}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.card} ${styles.agentExecutionCard}`}>
          <div className={styles.agentExecutionHeader}>
            <div>
              <div className={styles.sectionTitle}>Agent 执行队列</div>
              <p>用户不需要再手动分配 Agent。系统会按确认策略，把任务交给下面的制作队列。</p>
            </div>
            <button type="button" className={styles.ghostButton} onClick={openRunnableStage}>
              打开当前执行阶段
            </button>
          </div>

          <div className={styles.agentExecutionList}>
            {productionStages.map((stage) => (
              <div key={stage.id} className={styles.agentExecutionItem}>
                <div className={styles.agentExecutionIndex}>{stage.idx}</div>
                <div className={styles.agentExecutionMain}>
                  <div className={styles.agentExecutionTop}>
                    <strong>{stage.name}</strong>
                    <span>
                      <StatusDot status={stage.status} />
                      {STATUS_LABEL[stage.status]}
                    </span>
                  </div>
                  <p>{stage.description}</p>
                  <div className={styles.agentExecutionMeta}>
                    <span>Agent：{stage.agentRef}</span>
                    <span>输入：{stage.inputArtifactTypes.join(' / ') || '无'}</span>
                    <span>输出：{stage.outputArtifactTypes.join(' / ')}</span>
                    {stage.requiresHumanReview ? <span>需要人工复核</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.compareGrid}>
          <div className={`${styles.card} ${styles.compareCard}`}>
            <div className={styles.sectionTitle}>已锁定依据</div>
            <div className={styles.lockedEvidenceList}>
              <div>
                <strong>剧情边界</strong>
                <span>{plotLock?.contentPreview ?? '等待作品分析产物。'}</span>
              </div>
              <div>
                <strong>场景依据</strong>
                <span>{sceneBreakdown?.contentPreview ?? '等待场景拆分产物。'}</span>
              </div>
              <div>
                <strong>风格画像</strong>
                <span>{styleProfile?.contentPreview ?? '等待风格画像产物。'}</span>
              </div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.executionGuardCard}`}>
            <div className={styles.sectionTitle}>执行边界</div>
            <div className={styles.executionGuardList}>
              <div>
                <strong>不做</strong>
                <span>不改核心剧情事实，不提前解释悬疑物件，不把未定来源声音强行归为旁白。</span>
              </div>
              <div>
                <strong>重点做</strong>
                <span>优化旁白口语流畅度，补齐角色音、OS 占位、BGM、SFX、CV 情绪和气息提示。</span>
              </div>
              <div>
                <strong>交给人工确认</strong>
                <span>未定角色音是否独立锁 CV、样章是否继续扩到全章、质检是否允许进入打包。</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
