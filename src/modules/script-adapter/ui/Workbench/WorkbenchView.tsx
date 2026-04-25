import { useEffect, useRef, useState } from 'react';
import { useScriptAdapterStore } from '../../store/scriptAdapterStore';
import { scriptAdapterActions } from '../../store/actions';
import {
  abortPipeline,
  createExecutionPlan,
  runFullPipeline,
} from '../../services/mockAgentExecution';
import {
  startGatewayExecution,
  subscribeGatewayExecutionEvents,
} from '../../services/gatewayExecution';
import type { StageStatus } from '../../types/stage';
import { StatusDot } from '../shared/StatusDot';
import { ExecutionView } from './ExecutionView';
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

const TEAM_ROLE_COPY: Record<string, { title: string; shortDesc: string; promise: string }> = {
  'stage-text-adaptation': {
    title: '文本改编师',
    shortDesc: '把原文改成更适合多人演播的口语化样章。',
    promise: '保留剧情，只让旁白和对白更好听。',
  },
  'stage-voice-classification': {
    title: '角色音统筹',
    shortDesc: '标出谁在说话、哪些声音暂时未定、哪些需要后续分配 CV。',
    promise: '不把文件记录、OS、未定声音硬塞给旁白。',
  },
  'stage-performance-design': {
    title: '演播设计师',
    shortDesc: '补充 BGM、音效、CV 情绪、气息和动作提示。',
    promise: '让剧组拿到后能直接理解怎么演。',
  },
  'stage-quality-review': {
    title: '质检审校',
    shortDesc: '检查有没有改剧情、角色音是否混乱、演播提示是否可执行。',
    promise: '发现风险会停下来提醒你确认。',
  },
  'stage-export': {
    title: '交付打包员',
    shortDesc: '整理成剧组能看的台本、角色音表和制作说明。',
    promise: '把零散产物打包成清楚的交付件。',
  },
};

export function WorkbenchView() {
  const [showTechDetails, setShowTechDetails] = useState(false);
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
  const executionSheet = useScriptAdapterStore((state) =>
    currentProjectId ? state.executionSheets[currentProjectId] ?? null : null,
  );
  const executionSheetRef = useRef(executionSheet);
  executionSheetRef.current = executionSheet;

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

  const teamStages = productionStages.map((stage) => ({
    ...stage,
    friendly: TEAM_ROLE_COPY[stage.id] ?? {
      title: stage.name,
      shortDesc: stage.description,
      promise: '按确认策略完成对应制作任务。',
    },
  }));

  const openRunnableStage = () => {
    scriptAdapterActions.openStageInWorkbench(firstRunnableStage?.idx ?? 3);
  };

  const startMockExecution = () => {
    const taskId = project?.id ?? 'demo-content-task';
    const taskTitle = `${project?.name ?? '长夜未瞑'} · 多人演播样章`;
    const sheet = createExecutionPlan(taskId, taskTitle);
    scriptAdapterActions.setExecutionSheet(taskId, sheet);

    void runFullPipeline(sheet, {
      onSheetCreated: (createdSheet) => scriptAdapterActions.setExecutionSheet(taskId, createdSheet),
      onAgentStart: (_agentId, run) => {
        scriptAdapterActions.updateExecutionRun(taskId, run);
      },
      onAgentProgress: (agentId, stage, percent) => {
        scriptAdapterActions.updateExecutionProgress(taskId, agentId, stage, percent);
      },
      onAgentComplete: (_agentId, artifact, run) => {
        scriptAdapterActions.updateExecutionRun(taskId, run);
        scriptAdapterActions.addExecutionArtifact(taskId, artifact);
      },
      onGateReached: (gate) => {
        scriptAdapterActions.updateExecutionGate(taskId, gate.gateId, { status: 'pending' });
      },
      onAllComplete: (completedSheet) => scriptAdapterActions.setExecutionSheet(taskId, completedSheet),
      onAgentFailed: (agentId, error) => {
        scriptAdapterActions.failExecutionRun(taskId, agentId, error);
      },
    });
  };

  const startExecution = async () => {
    const taskId = project?.id ?? 'demo-content-task';
    const taskTitle = `${project?.name ?? '长夜未瞑'} · 多人演播样章`;
    scriptAdapterActions.setExecutionSheet(taskId, createExecutionPlan(taskId, taskTitle));

    const result = await startGatewayExecution({
      taskId,
      taskTitle,
      source: 'content-workbench',
    });

    if (!result?.success) {
      console.warn('[ScriptAdapter] Gateway execution unavailable, fallback to frontend mock:', result?.error);
      startMockExecution();
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeGatewayExecutionEvents((event) => {
      if (currentProjectId && event.taskId !== currentProjectId) return;

      if (event.event === 'sheet_created' || event.event === 'all_completed') {
        scriptAdapterActions.setExecutionSheet(event.taskId, event.sheet);
        return;
      }

      if (event.event === 'agent_started') {
        scriptAdapterActions.updateExecutionRun(event.taskId, event.run);
        return;
      }

      if (event.event === 'agent_progress') {
        scriptAdapterActions.updateExecutionProgress(
          event.taskId,
          event.agentId,
          event.progressSummary,
          event.progressPercent,
        );
        return;
      }

      if (event.event === 'artifact_created') {
        scriptAdapterActions.updateExecutionRun(event.taskId, event.run);
        scriptAdapterActions.addExecutionArtifact(event.taskId, event.artifact);
        return;
      }

      if (event.event === 'gate_reached' || event.event === 'gate_updated') {
        scriptAdapterActions.updateExecutionGate(event.taskId, event.gate.gateId, event.gate);
        return;
      }

      if (event.event === 'run_failed') {
        const firstRunning = executionSheetRef.current?.runs.find((run) => run.status === 'running');
        if (firstRunning) {
          scriptAdapterActions.failExecutionRun(event.taskId, firstRunning.agentId, event.error);
        }
      }
    });

    return () => {
      unsubscribe();
      abortPipeline();
    };
  }, [currentProjectId]);

  if (executionSheet) {
    return (
      <div className={styles.taskWorkbench}>
        <aside className={styles.taskRail}>
          <div className={`${styles.card} ${styles.taskProjectCard}`}>
            <div className={styles.sidebarSectionLabel}>正在制作</div>
            <div className={styles.projectCardTitle}>{project?.name ?? '未命名项目'}</div>
            <div className={styles.taskProjectMeta}>
              <span>{currentChapter ? `第${currentChapter.index}章：${currentChapter.title}` : '未选择章节'}</span>
              <span>多人演播样章</span>
              <span>{executionSheet.overallStatus === 'completed' ? '已完成' : '执行中'}</span>
            </div>
          </div>

          <div className={styles.taskStepList}>
            {TASK_STEPS.map((step, index) => {
              const isDone = index < 4 || executionSheet.overallStatus === 'completed';
              const isRunning = index === 3 && executionSheet.overallStatus === 'running';
              return (
                <div
                  key={step.label}
                  className={`${styles.taskStep} ${
                    isRunning ? styles.taskStepActive : ''
                  } ${isDone ? styles.taskStepDone : ''}`}
                >
                  <span className={styles.taskStepIndex}>{index + 1}</span>
                  <div className={styles.taskStepText}>
                    <strong>{step.label}</strong>
                    <span>
                      {index === 3
                        ? `${executionSheet.runs.filter((run) => run.status === 'completed').length}/${executionSheet.runs.length} 已完成`
                        : step.desc}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <ExecutionView
          sheet={executionSheet}
          onBackToContract={() => {
            if (currentProjectId) scriptAdapterActions.clearExecutionSheet(currentProjectId);
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.taskWorkbench}>
      <aside className={styles.taskRail}>
        <div className={`${styles.card} ${styles.taskProjectCard}`}>
          <div className={styles.sidebarSectionLabel}>已锁定任务</div>
          <div className={styles.projectCardTitle}>{project?.name ?? '未命名项目'}</div>
          <div className={styles.taskProjectMeta}>
            <span>{currentChapter ? `第${currentChapter.index}章：${currentChapter.title}` : '未选择章节'}</span>
            <span>{project?.meta.genre ?? '题材待确认'}</span>
            <span>开工前确认</span>
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
          查看高级流程
        </button>
      </aside>

      <main className={styles.taskMain}>
        <section className={`${styles.card} ${styles.workOrderHeroCard}`}>
          <div className={styles.workOrderHeroCopy}>
            <div className={styles.workOrderKicker}>开工确认书</div>
            <h2>已准备好开始制作第 1 章多人演播样章。</h2>
            <p>
              你前面确认的目标、范围和修改策略已经锁定。接下来系统会派出一支制作团队，
              按约定开工；需要你确认的地方，会停下来问你。
            </p>
            <div className={styles.workOrderSealRow}>
              <span>不改剧情</span>
              <span>先做样章</span>
              <span>人工复核</span>
            </div>
          </div>
          <div className={styles.workOrderHeroActions}>
            <div className={styles.readyStamp}>READY</div>
            <button type="button" className={styles.confirmStartButton} onClick={startExecution}>
              确认开工
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => scriptAdapterActions.setViewMode('pipeline')}
            >
              查看高级流程
            </button>
          </div>
        </section>

        <section className={styles.contractFocusGrid}>
          <div className={styles.contractFocusCard}>
            <span>做什么</span>
            <strong>多人演播有声书样章</strong>
            <em>给有声书团队试跑制作形态。</em>
          </div>
          <div className={styles.contractFocusCard}>
            <span>做哪里</span>
            <strong>{currentChapter ? `第${currentChapter.index}章 · 前半段` : '第1章 · 前半段'}</strong>
            <em>先小范围验证效果，不直接跑完整本。</em>
          </div>
          <div className={styles.contractFocusCard}>
            <span>怎么改</span>
            <strong>保留剧情，只提升听感</strong>
            <em>不重写故事，只让它更适合演播。</em>
          </div>
        </section>

        <section className={styles.contractReviewNotice}>
          <strong>需要你之后确认的地方</strong>
          <span>未定角色音是否独立锁 CV、演播提示是否继续扩到全章、质检结果是否允许进入打包。</span>
        </section>

        <section className={`${styles.card} ${styles.productionTeamCard}`}>
          <div className={styles.productionTeamHeader}>
            <div>
              <div className={styles.sectionTitle}>谁在为你干活</div>
              <p>不用理解技术队列。你只需要知道，这几位“制作角色”会按顺序帮你完成样章。</p>
            </div>
            <button type="button" className={styles.ghostButton} onClick={openRunnableStage}>
              打开当前制作阶段
            </button>
          </div>

          <div className={styles.productionTeamGrid}>
            {teamStages.map((stage) => (
              <div key={stage.id} className={styles.productionTeamMember}>
                <div className={styles.productionMemberTop}>
                  <span>{stage.idx}</span>
                  <em>{STATUS_LABEL[stage.status]}</em>
                </div>
                <strong>{stage.friendly.title}</strong>
                <p>{stage.friendly.shortDesc}</p>
                <small>{stage.friendly.promise}</small>
                {stage.requiresHumanReview ? <b>需要你复核</b> : null}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.contractDeliveryGrid}>
          <div className={`${styles.card} ${styles.deliveryChecklistCard}`}>
            <div className={styles.sectionTitle}>开工后你会拿到什么</div>
            <div className={styles.deliveryChecklist}>
              {expectedOutputs.map((type, index) => (
                <div key={type}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{ARTIFACT_LABELS[type] ?? type}</strong>
                    <em>{type === 'final_package' ? '最后统一整理给你' : '制作过程中逐步生成'}</em>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.card} ${styles.contractGuardCard}`}>
            <div className={styles.sectionTitle}>保护条款</div>
            <div className={styles.contractGuardList}>
              <div>
                <strong>不会改核心剧情</strong>
                <span>只优化表达和演播可执行性，不改变人物关系和关键事件。</span>
              </div>
              <div>
                <strong>不会提前解释悬疑</strong>
                <span>旧物、对讲机和关键线索仍按原来的信息顺序出现。</span>
              </div>
              <div>
                <strong>不会乱归角色音</strong>
                <span>未定来源声音会保留为候选，交给你或统筹后续确认。</span>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.card} ${styles.technicalDetailsCard}`}>
          <button
            type="button"
            className={styles.technicalDetailsToggle}
            onClick={() => setShowTechDetails((current) => !current)}
          >
            <span>{showTechDetails ? '收起技术细节' : '查看技术细节'}</span>
            <em>Agent ID、输入产物、输出产物、锁定依据</em>
          </button>

          {showTechDetails ? (
            <div className={styles.technicalDetailsBody}>
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
          ) : null}
        </section>
      </main>
    </div>
  );
}
