import { useEffect, useRef, useState } from 'react';
import { ScriptAdapterLayout } from './ui/ScriptAdapterLayout';
import { scriptAdapterActions } from './store/actions';
import { MOCK_PROJECT, MOCK_CHAPTERS } from './mockData/mockProject';
import { MOCK_STAGES } from './mockData/mockStages';
import { MOCK_ARTIFACTS } from './mockData/mockArtifacts';
import { MOCK_AGENTS } from './mockData/mockAgents';
import { MOCK_TEAM_TEMPLATES } from './mockData/mockTemplates';
import {
  type AnalysisReport,
  type AnalysisStatus,
  MOCK_INTAKE_STEPS,
  type IntakeResult,
  type IntakeStatus,
  runMockInitialAnalysis,
  runMockTaskIntake,
} from './services/mockTaskIntake';
import styles from './styles/scriptAdapter.module.css';

type ScriptAdapterScreen = 'home' | 'create' | 'workspace';
type WizardStep = 1 | 2 | 3;

const SOURCE_AGENT_PREVIEW = [
  { name: '文件解析 Agent', status: '预分配', desc: '识别文件类型、字数、章节边界和基础元数据。' },
  { name: '内容识别 Agent', status: '预分配', desc: '判断题材、文本形态和是否适合当前目标产物。' },
  { name: '任务安排 Agent', status: '预分配', desc: '生成初步任务草案、推荐方案和后续 Agent 队列。' },
];

const AGENT_QUEUE_SUMMARY = [
  { label: '已预分配', value: '3', desc: '文件解析、内容识别、任务安排' },
  { label: '即将执行', value: '1', desc: '业务分析 Agent' },
  { label: '后续候选', value: '3', desc: '场景拆分、文本改编、角色音标注' },
  { label: '人工确认', value: '是', desc: '分析方向和冲突要求需要确认' },
];

interface ScriptAdapterAppProps {
  onBack?: () => void;
}

export function ScriptAdapterApp({ onBack }: ScriptAdapterAppProps) {
  const [screen, setScreen] = useState<ScriptAdapterScreen>('home');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scriptAdapterActions.loadProject(
      MOCK_PROJECT,
      MOCK_CHAPTERS,
      MOCK_STAGES,
      MOCK_ARTIFACTS,
      MOCK_TEAM_TEMPLATES,
    );
    scriptAdapterActions.setAgents(MOCK_AGENTS);
    scriptAdapterActions.setViewMode('workbench');
    scriptAdapterActions.selectStage(3);
  }, []);

  useEffect(() => {
    rootRef.current?.scrollTo({ top: 0, left: 0 });
  }, [screen]);

  return (
    <div className={styles.root} ref={rootRef}>
      {screen === 'home' ? (
        <ContentCreationHome
          onBack={onBack}
          onCreateTask={() => setScreen('create')}
          onOpenDemoTask={() => setScreen('workspace')}
        />
      ) : null}
      {screen === 'create' ? (
        <TaskCreateWizard
          onBack={() => setScreen('home')}
          onStart={() => setScreen('workspace')}
        />
      ) : null}
      {screen === 'workspace' ? (
        <ScriptAdapterLayout onBack={() => setScreen('home')} />
      ) : null}
    </div>
  );
}

interface HomeProps {
  onBack?: () => void;
  onCreateTask: () => void;
  onOpenDemoTask: () => void;
}

function ContentCreationHome({ onBack, onCreateTask, onOpenDemoTask }: HomeProps) {
  return (
    <div className={styles.entryShell}>
      <header className={styles.entryHeader}>
        <div>
          <div className={styles.detailEyebrow}>内容创作</div>
          <h1>从一个明确任务开始，而不是从 Agent 开始。</h1>
          <p>
            上传小说、剧本、课程稿或访谈稿，让 AI 先做初读分析，再由你确认方向，最后进入工作台执行改写、拆分、标注或制作方案。
          </p>
        </div>
        {onBack ? (
          <button type="button" className={styles.backButton} onClick={onBack}>
            ← 返回 Chat
          </button>
        ) : null}
      </header>

      <section className={styles.entryHeroGrid}>
        <div className={`${styles.card} ${styles.entryPrimaryCard}`}>
          <div className={styles.entryCardKicker}>推荐入口</div>
          <h2>新建内容制作任务</h2>
          <p>
            适合用户主动打开内容创作面板时使用。先选素材来源和目标产物，再开始 AI 初读分析。
          </p>
          <button type="button" className={styles.primaryButton} onClick={onCreateTask}>
            新建任务
          </button>
        </div>

        <div className={`${styles.card} ${styles.entrySecondaryCard}`}>
          <div className={styles.entryCardKicker}>已有任务</div>
          <h2>继续样章工作台</h2>
          <p>
            打开当前 mock 项目：长夜未瞑 · 多人演播有声小说。用于查看任务式工作台的完整演示。
          </p>
          <button type="button" className={styles.ghostButton} onClick={onOpenDemoTask}>
            继续制作
          </button>
        </div>
      </section>

      <section className={styles.entryTemplateGrid}>
        <EntryTemplateCard
          title="多人演播有声书"
          desc="小说口语化改编、角色音标注、演播提示、质检交付。"
        />
        <EntryTemplateCard
          title="广播剧"
          desc="重建场景台词、音效调度、角色关系和分场节奏。"
        />
        <EntryTemplateCard
          title="短剧脚本"
          desc="提炼冲突、拆场、生成短剧分集或分镜脚本。"
        />
        <EntryTemplateCard
          title="只做作品分析"
          desc="先总结问题、结构、人物、节奏和修改建议，不直接改稿。"
        />
      </section>
    </div>
  );
}

interface EntryTemplateCardProps {
  title: string;
  desc: string;
}

function EntryTemplateCard({ title, desc }: EntryTemplateCardProps) {
  return (
    <div className={`${styles.card} ${styles.entryTemplateCard}`}>
      <strong>{title}</strong>
      <span>{desc}</span>
    </div>
  );
}

interface WizardProps {
  onBack: () => void;
  onStart: () => void;
}

function TaskCreateWizard({ onBack, onStart }: WizardProps) {
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [intakeStatus, setIntakeStatus] = useState<IntakeStatus>('idle');
  const [intakeStepIndex, setIntakeStepIndex] = useState(0);
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);
  const [intakeError, setIntakeError] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle');
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [decisionOverrides, setDecisionOverrides] = useState<Record<string, { value: string; desc: string; customNote: string }>>({});
  const sourceConfirmed = intakeStatus === 'completed' && Boolean(intakeResult);
  const isIntakeRunning = intakeStatus === 'running';
  const isAnalysisRunning = analysisStatus === 'running';
  const analysisCompleted = analysisStatus === 'completed' && Boolean(analysisReport);
  const selectedStrategy = analysisReport?.strategyOptions.find((option) => option.id === selectedStrategyId);
  const progressValue = analysisCompleted ? 96 : isAnalysisRunning ? 86 : sourceConfirmed ? 72 : isIntakeRunning ? 48 : 34;
  const agentQueueSummary = intakeResult
    ? [
        { label: '已预分配', value: String(intakeResult.agentPreAllocation.assignedCount), desc: '文件解析、内容识别、任务安排' },
        { label: '即将执行', value: analysisCompleted ? String(analysisReport?.executionImpact.nextAgents.length ?? 0) : '1', desc: analysisCompleted ? (analysisReport?.executionImpact.nextAgents.join('、') ?? '') : intakeResult.agentPreAllocation.nextAgent },
        { label: '后续候选', value: String(intakeResult.agentPreAllocation.candidateCount), desc: analysisCompleted ? '按策略进入制作队列' : '场景拆分、文本改编、角色音标注' },
        { label: '人工确认', value: analysisReport?.executionImpact.requiresReview ? '是' : intakeResult.agentPreAllocation.requiresHumanConfirm ? '是' : '否', desc: analysisCompleted ? '修改策略已待确认' : '分析方向和冲突要求需要确认' },
      ]
    : AGENT_QUEUE_SUMMARY;
  const createSteps = [
    {
      index: 1,
      title: '确认素材',
      desc: sourceConfirmed ? '参数已确认 · 已生成预分配' : isIntakeRunning ? '正在生成素材对象' : '上传原始文本 · 生成预分配',
      status: activeStep === 1 ? 'active' : sourceConfirmed ? 'done' : 'pending',
    },
    {
      index: 2,
      title: '确认目标和范围',
      desc: analysisStatus !== 'idle' ? '已确认 · 正在分析' : sourceConfirmed ? '定义产物 · 工作范围' : '等待素材确认',
      status: activeStep === 2 ? 'active' : analysisStatus !== 'idle' ? 'done' : sourceConfirmed ? 'done' : 'pending',
    },
    {
      index: 3,
      title: '确认修改策略',
      desc: analysisCompleted ? '选择怎么改 · 锁定制作队列' : isAnalysisRunning ? 'AI 初读分析中' : '等待目标和范围',
      status: activeStep === 3 ? 'active' : analysisCompleted ? 'done' : 'pending',
    },
  ] as const;

  const canOpenStep = (step: WizardStep) => {
    if (step === 1) return true;
    if (step === 2) return sourceConfirmed;
    return analysisCompleted || isAnalysisRunning;
  };

  const openStep = (step: WizardStep) => {
    if (canOpenStep(step)) setActiveStep(step);
  };

  const handleConfirmSource = async () => {
    if (isIntakeRunning) return;

    setIntakeStatus('running');
    setIntakeStepIndex(0);
    setIntakeResult(null);
    setIntakeError('');

    try {
      const result = await runMockTaskIntake((stepIndex) => {
        setIntakeStepIndex(stepIndex);
      });
      setIntakeResult(result);
      setDecisionOverrides({});
      setEditingDecisionId(null);
      setAnalysisStatus('idle');
      setAnalysisReport(null);
      setAnalysisError('');
      setSelectedStrategyId('');
      setIntakeStatus('completed');
      setActiveStep(2);
    } catch (error) {
      setIntakeStatus('failed');
      setIntakeError(error instanceof Error ? error.message : '素材摄入失败，请重试。');
    }
  };

  const getIntakeStepClassName = (stepIndex: number) => {
    if (intakeStatus === 'completed' || intakeStepIndex > stepIndex) return styles.backgroundStepDone;
    if (isIntakeRunning && intakeStepIndex === stepIndex) return styles.backgroundStepRunning;
    return styles.backgroundStepPending;
  };

  const getDecisionView = (item: IntakeResult['taskDraft']['confirmItems'][number]) => {
    return decisionOverrides[item.id] ?? { value: item.value, desc: item.desc, customNote: '' };
  };

  const updateDecision = (itemId: string, value: string, desc: string) => {
    setDecisionOverrides((current) => ({
      ...current,
      [itemId]: {
        value,
        desc,
        customNote: current[itemId]?.customNote ?? '',
      },
    }));
  };

  const updateDecisionNote = (itemId: string, customNote: string) => {
    setDecisionOverrides((current) => ({
      ...current,
      [itemId]: {
        value: current[itemId]?.value ?? intakeResult?.taskDraft.confirmItems.find((item) => item.id === itemId)?.value ?? '',
        desc: current[itemId]?.desc ?? intakeResult?.taskDraft.confirmItems.find((item) => item.id === itemId)?.desc ?? '',
        customNote,
      },
    }));
  };

  const getDecisionSummaryValue = (itemId: string, fallback: string) => {
    const sourceItem = intakeResult?.taskDraft.confirmItems.find((item) => item.id === itemId);
    return decisionOverrides[itemId]?.value ?? sourceItem?.value ?? fallback;
  };

  const handleRunAnalysis = async () => {
    if (!sourceConfirmed || isAnalysisRunning) return;

    setAnalysisStatus('running');
    setAnalysisReport(null);
    setAnalysisError('');
    setSelectedStrategyId('');
    setActiveStep(3);

    try {
      const report = await runMockInitialAnalysis();
      setAnalysisReport(report);
      setSelectedStrategyId(report.recommendedStrategyId);
      setAnalysisStatus('completed');
      setActiveStep(3);
    } catch (error) {
      setAnalysisStatus('failed');
      setAnalysisError(error instanceof Error ? error.message : 'AI 初读分析失败，请重试。');
    }
  };

  const getFooterTitle = () => {
    if (activeStep === 1) {
      return isIntakeRunning ? '正在确认素材并生成任务方案' : sourceConfirmed ? '素材已确认，可进入目标和范围确认' : '等待确认素材参数';
    }
    if (activeStep === 2) {
      return isAnalysisRunning ? 'AI 初读分析中' : sourceConfirmed ? '等待确认目标和范围' : '请先完成素材确认';
    }
    return analysisCompleted ? '等待确认修改策略' : isAnalysisRunning ? 'AI 初读分析中' : '等待目标和范围确认';
  };

  const getFooterDesc = () => {
    if (activeStep === 1) return '确认后会生成素材对象、轻量画像和 Agent 预分配，并自动进入第 2 步。';
    if (activeStep === 2) return '确认后只进入 AI 初读分析，不会直接改稿；分析完成会自动进入第 3 步。';
    return '确认策略后才进入制作 Agent，并生成工作台执行单。';
  };

  const getFooterButtonText = () => {
    if (activeStep === 1) return isIntakeRunning ? '正在生成任务方案' : sourceConfirmed ? '重新确认素材' : '确认素材，进入第 2 步';
    if (activeStep === 2) return isAnalysisRunning ? 'AI 初读分析中' : analysisCompleted ? '重新分析并进入第 3 步' : '确认目标和范围，进入第 3 步';
    return '确认策略，进入工作台';
  };

  const isFooterButtonDisabled = () => {
    if (activeStep === 1) return isIntakeRunning;
    if (activeStep === 2) return !sourceConfirmed || isAnalysisRunning;
    return !analysisCompleted || !selectedStrategyId;
  };

  const handleFooterAction = () => {
    if (activeStep === 1) {
      void handleConfirmSource();
      return;
    }
    if (activeStep === 2) {
      void handleRunAnalysis();
      return;
    }
    onStart();
  };

  return (
    <div className={styles.createShell}>
      <header className={styles.createComposerHeader}>
        <div>
          <div className={styles.detailEyebrow}>后台任务编排</div>
          <h1>配置内容制作任务</h1>
          <p>先确认素材，再确认产品内容和工作范围。改动策略会在 AI 初读分析后单独确认。</p>
        </div>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← 返回任务大厅
        </button>
      </header>

      <main className={styles.composerGrid}>
        <aside className={styles.composerRail}>
          <div className={`${styles.card} ${styles.composerProgressCard}`}>
            <div className={styles.sidebarSectionLabel}>任务完整度</div>
            <div className={styles.composerProgressValue}>{progressValue}%</div>
            <div className={styles.composerProgressTrack}>
              <span style={{ width: `${progressValue}%` }} />
            </div>
            <div className={styles.mutedText}>
              {analysisCompleted
                ? 'AI 初读分析完成，等待你确认修改策略。'
                : isAnalysisRunning
                  ? '业务分析 Agent 正在输出问题、证据和修改策略。'
                  : sourceConfirmed
                ? '已生成初步任务草案，等待你确认详细执行方案。'
                : isIntakeRunning
                  ? `正在执行第 ${Math.min(intakeStepIndex + 1, MOCK_INTAKE_STEPS.length)} 步素材摄入。`
                  : '先确认素材参数，系统再生成 Agent 预分配。'}
            </div>
          </div>

          <div className={styles.composerStepList}>
            {createSteps.map((step) => (
              <button
                type="button"
                key={step.index}
                className={`${styles.composerStepItem} ${
                  step.status === 'active' ? styles.composerStepItemActive : ''
                } ${
                  step.status === 'done' ? styles.composerStepItemDone : ''
                }`}
                disabled={!canOpenStep(step.index as WizardStep)}
                onClick={() => openStep(step.index as WizardStep)}
              >
                <span className={styles.composerStepIndex}>{step.index}</span>
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className={styles.composerMain}>
          {activeStep === 1 ? (
          <div className={`${styles.card} ${styles.composerGateCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.detailEyebrow}>第 1 步 · 输入确认</div>
                <h2>提交原始文本，确认素材参数</h2>
              </div>
              <span className={sourceConfirmed ? styles.composerStatePill : styles.reviewPill}>
                {sourceConfirmed ? '已确认' : isIntakeRunning ? '处理中' : '待确认'}
              </span>
            </div>

            <div className={styles.sourceGateLayout}>
              <div className={styles.sourcePrimaryColumn}>
                <div className={styles.sourceModeHeader}>
                  <strong>素材来源</strong>
                  <span>第一版以上传原始文本为主，粘贴和已有文档先作为轻量入口保留。</span>
                </div>
                <div className={styles.choiceGrid}>
                  <button type="button" className={styles.choiceCardActive}>上传文件</button>
                  <button type="button" className={styles.choiceCard}>粘贴试跑</button>
                  <button type="button" className={styles.choiceCard}>已有文档</button>
                </div>
                <div className={styles.mockUploadBox}>
                  <strong>拖拽小说原文到这里，或点击选择文件</strong>
                  <span>支持 .txt / .md / .docx / 小说章节文本。确认后才会进入文件解析和 Agent 预分配。</span>
                </div>
              </div>

              <div className={styles.sourceInspectPanel}>
                <div className={styles.taskFieldLabel}>确认后生成的素材参数</div>
                <div className={styles.sourceParamGrid}>
                  <div><span>文件</span><strong>{intakeResult?.sourceDocument.fileName ?? '长夜未瞑_第1章.txt'}</strong></div>
                  <div><span>类型</span><strong>{intakeResult?.sourceProfile.contentCategory ?? intakeResult?.sourceDocument.sourceType ?? '待识别'}</strong></div>
                  <div><span>章节</span><strong>{intakeResult?.sourceDocument.chapterHint ?? '待解析'}</strong></div>
                  <div><span>字数</span><strong>{intakeResult?.sourceDocument.wordCountLabel ?? '待真实解析'}</strong></div>
                </div>
                {intakeResult ? (
                  <div className={styles.sourceProfileSummary}>
                    <strong>AI 已识别素材归属：{intakeResult.sourceProfile.contentCategory}</strong>
                    <span>{intakeResult.sourceProfile.structureSummary}</span>
                    <em>{intakeResult.sourceProfile.confidenceLabel}</em>
                  </div>
                ) : null}
                <div className={styles.agentPreviewList}>
                  {SOURCE_AGENT_PREVIEW.map((item) => (
                    <div key={item.name} className={styles.agentPreviewItem}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.desc}</span>
                      </div>
                      <em>{item.status}</em>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={isIntakeRunning}
                  onClick={handleConfirmSource}
                >
                  {isIntakeRunning ? '正在生成任务方案' : sourceConfirmed ? '重新生成任务方案' : '确认素材，生成任务方案'}
                </button>
                {intakeError ? <div className={styles.inlineErrorText}>{intakeError}</div> : null}
              </div>
            </div>
          </div>
          ) : null}

          {activeStep === 2 ? (
          <div className={`${styles.card} ${styles.composerRequirementCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.detailEyebrow}>第 2 步 · 目标和范围确认</div>
                <h2>确认产品内容和工作范围</h2>
              </div>
              <span className={sourceConfirmed ? styles.reviewPill : styles.mutedPill}>
                {sourceConfirmed ? '初步分析已生成' : isIntakeRunning ? '生成中' : '等待素材'}
              </span>
            </div>

            {sourceConfirmed && intakeResult ? (
              <>
                <div className={styles.planHeroCard}>
                  <div className={styles.planHeroHeader}>
                    <div>
                      <strong>AI 推荐执行方案</strong>
                      <span>{intakeResult.intakeSummary}</span>
                    </div>
                    <em>{intakeResult.plannerAgent}</em>
                  </div>
                  <div className={styles.planHeroMain}>
                    <span>建议方案</span>
                    <strong>{intakeResult.recommendedAction}</strong>
                    <p>{intakeResult.recommendedReason}确认后只进入 AI 初读分析，不会直接改稿。</p>
                  </div>
                </div>

                <div className={styles.directionFitPanel}>
                  <div className={styles.taskFieldLabel}>基于素材归属生成的可选方向</div>
                  <div className={styles.directionFitGrid}>
                    {intakeResult.sourceProfile.recommendedDirections.map((direction) => (
                      <div
                        key={direction.name}
                        className={direction.level === 'recommended' ? styles.directionFitRecommended : styles.directionFitItem}
                      >
                        <span>{direction.level === 'recommended' ? 'AI 推荐' : '可选'}</span>
                        <strong>{direction.name}</strong>
                        <em>{direction.reason}</em>
                      </div>
                    ))}
                  </div>
                  <div className={styles.unsupportedDirectionList}>
                    <span>不会在第二步提供：</span>
                    {intakeResult.sourceProfile.unsupportedDirections.map((direction) => (
                      <em key={direction.name}>{direction.name}，{direction.reason}</em>
                    ))}
                  </div>
                </div>

                <div className={styles.planDecisionList}>
                  {intakeResult.taskDraft.confirmItems.map((item) => (
                    <div key={item.id} className={styles.planDecisionItem}>
                      <div className={styles.planDecisionTop}>
                        <div>
                          <span>{item.label}</span>
                          <strong>{getDecisionView(item).value}</strong>
                          <em>{getDecisionView(item).desc}</em>
                          {getDecisionView(item).customNote ? <small>补充：{getDecisionView(item).customNote}</small> : null}
                        </div>
                        <button
                          type="button"
                          className={styles.tinyEditButton}
                          onClick={() => setEditingDecisionId(editingDecisionId === item.id ? null : item.id)}
                        >
                          {editingDecisionId === item.id ? '收起' : '修改'}
                        </button>
                      </div>
                      {editingDecisionId === item.id ? (
                        <div className={styles.decisionEditPanel}>
                          <div className={styles.decisionEditHint}>
                            <strong>系统建议优先选候选项</strong>
                            <span>自定义内容只作为补充约束，后续会交给任务安排 Agent 判断是否需要切换团队或人工确认。</span>
                          </div>
                          <div className={styles.decisionOptionList}>
                            {item.options.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={getDecisionView(item).value === option.value ? styles.decisionOptionActive : styles.decisionOption}
                                onClick={() => updateDecision(item.id, option.value, option.desc)}
                              >
                                <span>{option.source === 'recommended' ? 'AI 推荐' : option.source === 'agent' ? 'Agent 候选' : '同类预设'}</span>
                                <strong>{option.value}</strong>
                                <em>{option.desc}</em>
                              </button>
                            ))}
                          </div>
                          <label className={styles.decisionCustomNote}>
                            <span>自定义补充</span>
                            <textarea
                              value={getDecisionView(item).customNote}
                              placeholder={item.customHint}
                              onChange={(event) => updateDecisionNote(item.id, event.target.value)}
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className={styles.teamLockBox}>
                  <div>
                    <strong>确认后锁定的 Agent 团队</strong>
                    <span>业务分析 Agent 先执行；AI 输出问题、风险和可修改建议后，再进入第 3 步确认修改策略。</span>
                  </div>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={!sourceConfirmed}
                    onClick={handleRunAnalysis}
                  >
                    {isAnalysisRunning ? 'AI 初读分析中' : analysisCompleted ? '重新生成 AI 初读分析' : '确认目标和范围，开始 AI 初读分析'}
                  </button>
                  {analysisError ? <div className={styles.inlineErrorText}>{analysisError}</div> : null}
                </div>
              </>
            ) : (
              <div className={styles.intakeWaitingPanel}>
                <strong>{isIntakeRunning ? '正在生成 AI 初步判断' : '等待第 1 步确认后生成 AI 初步判断'}</strong>
                <span>
                  {isIntakeRunning
                    ? '系统正在完成文件留存、文本标准化、轻量画像和任务草案生成，完成后会自动回填到这里。'
                    : '确认素材后，系统会先完成文件留存、文本标准化、轻量画像和任务草案生成，再进入这里让你调整。'}
                </span>
              </div>
            )}
          </div>
          ) : null}

          {activeStep === 3 ? (
          <div className={`${styles.card} ${styles.composerRequirementCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.detailEyebrow}>第 3 步 · 修改策略确认</div>
                <h2>基于 AI 初读结果，选择怎么改</h2>
              </div>
              <span className={analysisCompleted ? styles.reviewPill : styles.mutedPill}>
                {analysisCompleted ? '待确认策略' : isAnalysisRunning ? '分析中' : '等待分析'}
              </span>
            </div>

            {isAnalysisRunning ? (
              <div className={styles.analysisRunningPanel}>
                <strong>业务分析 Agent 正在初读文本</strong>
                <span>正在生成文本问题、证据片段、可修改方向、推荐策略和执行影响。这里不会改稿，只做决策前分析。</span>
              </div>
            ) : null}

            {analysisCompleted && analysisReport ? (
              <>
                <div className={styles.analysisHeroCard}>
                  <div>
                    <strong>AI 初读结论</strong>
                    <span>{analysisReport.agentName}</span>
                  </div>
                  <p>{analysisReport.summary}</p>
                </div>

                <div className={styles.analysisIssueGrid}>
                  {analysisReport.diagnosis.map((item) => (
                    <div key={item.title} className={styles.analysisIssueCard}>
                      <span>风险：{item.severity}</span>
                      <strong>{item.title}</strong>
                      <em>{item.detail}</em>
                    </div>
                  ))}
                </div>

                <div className={styles.evidencePanel}>
                  <div className={styles.taskFieldLabel}>问题证据</div>
                  {analysisReport.evidence.map((item) => (
                    <div key={`${item.location}-${item.issue}`} className={styles.evidenceItem}>
                      <div>
                        <strong>{item.location}</strong>
                        <span>{item.issue}</span>
                      </div>
                      <p>{item.quote}</p>
                    </div>
                  ))}
                </div>

                <div className={styles.strategyPanel}>
                  <div className={styles.composerSectionHeader}>
                    <div>
                      <div className={styles.taskFieldLabel}>选择修改策略</div>
                      <span className={styles.mutedText}>这里才决定“怎么改、改多深”。</span>
                    </div>
                  </div>
                  <div className={styles.strategyGrid}>
                    {analysisReport.strategyOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={selectedStrategyId === option.id ? styles.strategyCardActive : styles.strategyCard}
                        onClick={() => setSelectedStrategyId(option.id)}
                      >
                        <span>{option.recommended ? 'AI 推荐' : option.editDepth}</span>
                        <strong>{option.title}</strong>
                        <em>{option.desc}</em>
                        <small>{option.impact}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.executionImpactBox}>
                  <div>
                    <strong>确认后将进入制作队列</strong>
                    <span>下一步 Agent：{analysisReport.executionImpact.nextAgents.join('、')}</span>
                    <span>预计产物：{analysisReport.executionImpact.outputs.join('、')}</span>
                    {selectedStrategy ? <span>当前策略：{selectedStrategy.title}，{selectedStrategy.impact}</span> : null}
                  </div>
                </div>
              </>
            ) : null}

            {!analysisCompleted && !isAnalysisRunning ? (
              <div className={styles.intakeWaitingPanel}>
                <strong>等待第 2 步确认后生成 AI 初读分析</strong>
                <span>确认产品方向和工作范围后，这里会展示文本问题、证据、可修改建议和策略选择。</span>
              </div>
            ) : null}
          </div>
          ) : null}
        </section>

        <aside className={styles.composerSummary}>
          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.composerSectionHeader}>
              <div>
                <div className={styles.sidebarSectionLabel}>任务地图</div>
                <h3>系统理解结果</h3>
              </div>
              <span className={sourceConfirmed ? styles.reviewPill : styles.mutedPill}>
                {sourceConfirmed ? '待执行确认' : '待素材确认'}
              </span>
            </div>
            <div className={styles.summaryList}>
              <div><span>素材</span><strong>{sourceConfirmed ? '已确认 · 已完成解析' : isIntakeRunning ? '正在摄入 · 生成素材对象' : '上传文件 · 待确认'}</strong></div>
              <div><span>归属</span><strong>{intakeResult?.sourceProfile.contentCategory ?? '待识别'}</strong></div>
              <div><span>目标</span><strong>{getDecisionSummaryValue('work_goal', '多人演播有声书 · 先做业务分析')}</strong></div>
              <div><span>范围</span><strong>{getDecisionSummaryValue('scope', '第 1 章')}</strong></div>
              <div><span>本轮</span><strong>{analysisCompleted ? selectedStrategy?.title ?? '待选择策略' : isAnalysisRunning ? 'AI 初读分析中' : '先分析问题'}</strong></div>
              <div><span>草案</span><strong>{sourceConfirmed ? '已生成 TaskDraft' : isIntakeRunning ? '生成中' : '等待生成'}</strong></div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.sidebarSectionLabel}>后台摄入链路</div>
            <div className={styles.backgroundStepList}>
              {MOCK_INTAKE_STEPS.map((step, index) => (
                <div key={step.id} className={getIntakeStepClassName(index)}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <em>{step.desc}</em>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.sidebarSectionLabel}>确认闸门</div>
            <div className={styles.gateMapList}>
              <div className={sourceConfirmed ? styles.gateMapItemDone : styles.gateMapItemActive}>
                <span>1</span>
                <div>
                  <strong>素材确认</strong>
                  <em>{sourceConfirmed ? '已通过' : '当前步骤'}</em>
                </div>
              </div>
              <div className={sourceConfirmed ? styles.gateMapItemActive : styles.gateMapItemPending}>
                <span>2</span>
                <div>
                  <strong>目标和范围确认</strong>
                  <em>{sourceConfirmed ? '等待确认目标和范围' : isIntakeRunning ? '等待摄入完成' : '等待素材确认'}</em>
                </div>
              </div>
              <div className={analysisCompleted ? styles.gateMapItemActive : isAnalysisRunning ? styles.gateMapItemActive : styles.gateMapItemPending}>
                <span>3</span>
                <div>
                  <strong>修改策略确认</strong>
                  <em>{analysisCompleted ? '等待确认策略' : isAnalysisRunning ? 'AI 初读分析中' : '等待目标和范围'}</em>
                </div>
              </div>
            </div>
          </div>

          <div className={`${styles.card} ${styles.taskMapCard}`}>
            <div className={styles.sidebarSectionLabel}>Agent 队列总览</div>
            <div className={styles.queueSummaryGrid}>
              {agentQueueSummary.map((item) => (
                <div key={item.label} className={styles.queueSummaryItem}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <em>{item.desc}</em>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.requirementBoundaryBox}>
            <strong>执行边界</strong>
            <span>当前只确认产品内容和工作范围。AI 初读分析完成后，系统会再给出可修改建议，由用户单独确认改动策略。</span>
          </div>
        </aside>
      </main>

      <footer className={styles.composerActionBar}>
        <div>
          <strong>{getFooterTitle()}</strong>
          <span>{getFooterDesc()}</span>
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
            disabled={isFooterButtonDisabled()}
            onClick={handleFooterAction}
          >
            {getFooterButtonText()}
          </button>
        </div>
      </footer>
    </div>
  );
}
