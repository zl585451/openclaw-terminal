import { useState, useEffect } from 'react';
import styles from '../styles/scriptAdapter.module.css';
import { WizardContext } from './WizardContext';
import { StepSource } from './steps/StepSource';
import { StepAnalysis } from './steps/StepAnalysis';
import { StepStrategy } from './steps/StepStrategy';
import { useWizardSource } from './hooks/useWizardSource';
import { useWizardDecisions } from './hooks/useWizardDecisions';
import { useWizardProcess } from './hooks/useWizardProcess';
import { WizardStep } from './index';
import { IntakeResult, AnalysisReport } from '../../services/mockTaskIntake';
import {
  GATEWAY_INTAKE_STEPS,
  startGatewayIntake,
  GatewayIntakeRun,
  GatewayIntakeStep,
} from '../../services/gatewayIntake';
import {
  GATEWAY_ANALYSIS_STEPS,
  startGatewayAnalysis,
  toEvidenceStep,
  GatewayAnalysisRun,
} from '../../services/gatewayAnalysis';
import {
  GATEWAY_PRODUCTION_STEPS,
  productionStepToEvidence,
  startGatewayProductionHandoff,
  GatewayProductionRun,
  ProductionQueueItem,
} from '../../services/gatewayProduction';
import { DeliveryOptions, TaskCreationContract } from '../../types/batch';
import { getChapterText } from '../../services/aiLibraryClient';

interface WizardProps {
  onBack: () => void;
  onStart: (contract: TaskCreationContract) => void;
}

// Removed unused getGoalConfirmationCopy


export function TaskCreateWizard({ onBack, onStart }: WizardProps) {
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);

  const sourceHook = useWizardSource();
  const decisionHook = useWizardDecisions(intakeResult);
  const { intakeRun, setIntakeRun, analysisRun, setAnalysisRun, productionRun, setProductionRun } = useWizardProcess();

  const [intakeStatus, setIntakeStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [intakeStepIndex, setIntakeStepIndex] = useState(0);
  const [, setIntakeError] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [, setAnalysisError] = useState('');
  const [productionStatus, setProductionStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [productionError, setProductionError] = useState('');
  const [, setProductionQueue] = useState<ProductionQueueItem[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [deliveryOptions] = useState<DeliveryOptions>({
    adaptedScript: true,
    voiceRegistry: true,
    qualityReview: true,
    cvDirections: false,
    bgmSfx: false,
    finalPackage: true,
  });

  const {
    sourceMode,
    selectedBookId,
    selectedRangeLabel,
    selectedRangeChapters,
    selectedBook,
    selectedRangeTotalChars,
    pastedText,
    sourceReady,
  } = sourceHook;

  const {
    decisionOverrides,
    setDecisionOverrides,
    editingDecisionId,
    setEditingDecisionId,
    updateDecision,
    updateDecisionNote,
  } = decisionHook;

  const sourceConfirmed = intakeStatus === 'completed' && Boolean(intakeResult);
  const isIntakeRunning = intakeStatus === 'running';
  const isAnalysisRunning = analysisStatus === 'running';
  const isProductionRunning = productionStatus === 'running';
  const analysisCompleted = analysisStatus === 'completed' && Boolean(analysisReport);
  const selectedStrategy = analysisReport?.strategyOptions.find((option: any) => option.id === selectedStrategyId);
  const progressValue = analysisCompleted ? 96 : isAnalysisRunning ? 86 : sourceConfirmed ? 72 : isIntakeRunning ? 48 : 34;

  const createSteps = [
    {
      index: 1,
      title: '确认素材',
      desc: sourceConfirmed ? '参数已确认 · 已生成预分配' : isIntakeRunning ? '正在生成素材对象' : '先选项目素材 · 再生成预分配',
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
      title: '确认修改方向',
      desc: analysisCompleted ? '选择怎么改 · 锁定制作队列' : isAnalysisRunning ? 'AI 初读分析中' : '等待目标和范围',
      status: activeStep === 3 ? 'active' : analysisCompleted ? 'done' : 'pending',
    },
  ] as const;

  useEffect(() => {
    if (!window.electronAPI?.onScriptAdapterEvent) return undefined;
    return window.electronAPI.onScriptAdapterEvent((payload) => {
      const eventName = typeof payload.event === 'string' ? payload.event : '';
      if (!eventName.startsWith('intake.')) return;
      const nextRun = payload.intakeRun as GatewayIntakeRun | undefined;
      if (!nextRun?.id || !Array.isArray(nextRun.steps)) return;
      setIntakeRun(nextRun);
      const runningIndex = nextRun.steps.findIndex((step) => step.status === 'running');
      const doneCount = nextRun.steps.filter((step) => step.status === 'succeeded').length;
      setIntakeStepIndex(runningIndex >= 0 ? runningIndex : doneCount);
      if (nextRun.status === 'running') setIntakeStatus('running');
      if (nextRun.status === 'succeeded') setIntakeStatus('completed');
      if (nextRun.status === 'failed') {
        setIntakeStatus('failed');
        setIntakeError(nextRun.error || '素材摄入失败');
      }
    });
  }, [setIntakeRun]);

  useEffect(() => {
    if (!window.electronAPI?.onScriptAdapterEvent) return undefined;
    return window.electronAPI.onScriptAdapterEvent((payload) => {
      const eventName = typeof payload.event === 'string' ? payload.event : '';
      if (!eventName.startsWith('analysis.')) return;
      const nextRun = payload.analysisRun as GatewayAnalysisRun | undefined;
      if (!nextRun?.id || !Array.isArray(nextRun.steps)) return;
      setAnalysisRun(nextRun);
      if (nextRun.status === 'running') setAnalysisStatus('running');
      if (nextRun.status === 'succeeded') {
        if (nextRun.result) {
          setAnalysisReport(nextRun.result);
          setSelectedStrategyId(nextRun.result.recommendedStrategyId);
          setAnalysisStatus('completed');
          setActiveStep(3);
        } else {
          setAnalysisStatus('failed');
          setAnalysisError('ANALYSIS_RESULT_EMPTY: 业务分析完成但没有返回报告');
        }
      }
      if (nextRun.status === 'failed') {
        setAnalysisStatus('failed');
        setAnalysisError(nextRun.error || '业务分析失败');
      }
    });
  }, [setAnalysisRun]);

  useEffect(() => {
    if (!window.electronAPI?.onScriptAdapterEvent) return undefined;
    return window.electronAPI.onScriptAdapterEvent((payload) => {
      const eventName = typeof payload.event === 'string' ? payload.event : '';
      if (!eventName.startsWith('production.')) return;
      const nextRun = payload.productionRun as GatewayProductionRun | undefined;
      if (!nextRun?.id || !Array.isArray(nextRun.steps)) return;
      setProductionRun(nextRun);
      if (nextRun.result?.productionQueue) setProductionQueue(nextRun.result.productionQueue);
      if (nextRun.status === 'running') setProductionStatus('running');
      if (nextRun.status === 'succeeded') setProductionStatus('completed');
      if (nextRun.status === 'failed') {
        setProductionStatus('failed');
        setProductionError(nextRun.error || '制作交接失败');
      }
    });
  }, [setProductionRun]);

  const canOpenStep = (step: WizardStep) => {
    if (step === 1) return true;
    if (step === 2) return sourceConfirmed;
    return analysisCompleted || isAnalysisRunning;
  };

  const openStep = (step: WizardStep) => {
    if (canOpenStep(step)) setActiveStep(step);
  };

  const sourceSummary = selectedBook?.title || '待选择素材';
  const sourceTypeLabel = selectedBook?.source_type || (sourceMode === 'paste' ? '临时粘贴文本' : '待识别');

  const displayedIntakeSteps: GatewayIntakeStep[] = intakeRun?.steps?.length
    ? intakeRun.steps
    : GATEWAY_INTAKE_STEPS;
  const displayedAnalysisSteps: GatewayIntakeStep[] = (analysisRun?.steps?.length
    ? analysisRun.steps.map(toEvidenceStep)
    : GATEWAY_ANALYSIS_STEPS.map(toEvidenceStep));
  const displayedProductionSteps: GatewayIntakeStep[] = (productionRun?.steps?.length
    ? productionRun.steps.map(productionStepToEvidence)
    : GATEWAY_PRODUCTION_STEPS.map(productionStepToEvidence));

  const intakeSucceededCount = displayedIntakeSteps.filter((step: any) => step.status === 'succeeded').length;
  const analysisSucceededCount = displayedAnalysisSteps.filter((step: any) => step.status === 'succeeded').length;
  const productionSucceededCount = displayedProductionSteps.filter((step: any) => step.status === 'succeeded').length;
  const businessAgentStep = displayedAnalysisSteps.find((step: any) => step.mode === 'agent');

  const evidenceSummary = activeStep === 2
    ? `素材摄入 ${intakeSucceededCount}/${displayedIntakeSteps.length} 成功 · 当前页无 Agent 执行`
    : isProductionRunning || productionStatus === 'completed' || productionStatus === 'failed'
      ? `制作交接 ${productionSucceededCount}/${displayedProductionSteps.length} 成功 · ${productionStatus === 'completed' ? '工作台合同已生成' : productionStatus === 'failed' ? '交接失败' : '交接中'}`
      : `业务分析 ${analysisSucceededCount}/${displayedAnalysisSteps.length} 成功 · ${businessAgentStep?.status === 'succeeded' ? 'Agent 已完成' : businessAgentStep?.status === 'running' ? 'Agent 执行中' : businessAgentStep?.status === 'failed' ? 'Agent 失败' : '等待 Agent'}`;

  const handleConfirmSource = async () => {
    if (isIntakeRunning || !sourceReady) return;

    setIntakeStatus('running');
    setIntakeStepIndex(0);
    setIntakeResult(null);
    setIntakeRun({
      id: `local-pending-${Date.now()}`,
      status: 'running',
      source: {
        mode: sourceMode,
        bookId: selectedBookId || null,
        bookTitle: sourceSummary,
        rangeLabel: sourceMode === 'library' ? selectedRangeLabel : sourceMode === 'paste' ? '临时文本' : '待选择',
        chapterIndices: selectedRangeChapters.map((chapter) => chapter.chapter_index),
      },
      steps: GATEWAY_INTAKE_STEPS.map((step) => ({ ...step })),
      result: null,
      error: null,
    });
    setIntakeError('');

    try {
      const chapters = sourceMode === 'library'
        ? await Promise.all(selectedRangeChapters.map(async (chapter) => {
            const detail = await getChapterText(selectedBookId, chapter.chapter_index);
            return {
              chapter_index: chapter.chapter_index,
              title: chapter.title,
              preview: chapter.preview,
              char_count: chapter.char_count,
              text: detail.text,
            };
          }))
        : [];
      const { intakeRun: completedRun, result } = await startGatewayIntake({
        sourceMode,
        bookId: selectedBookId || undefined,
        sourceTitle: sourceSummary,
        rangeLabel: sourceMode === 'library' ? selectedRangeLabel : sourceMode === 'paste' ? '临时文本' : '待选择',
        sourceTypeLabel,
        chapterIndices: selectedRangeChapters.map((chapter) => chapter.chapter_index),
        chapters,
        pastedText: sourceMode === 'paste' ? pastedText : undefined,
      });
      setIntakeRun(completedRun);
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
      setIntakeRun((current) => current
        ? { ...current, status: 'failed', error: error instanceof Error ? error.message : '素材摄入失败，请重试。' }
        : current);
    }
  };

  const getDecisionSummaryValue = (itemId: string, fallback: string) => {
    if (itemId === 'scope' && sourceMode === 'library') return selectedRangeLabel;
    const sourceItem = intakeResult?.taskDraft.confirmItems.find((item) => item.id === itemId);
    return decisionOverrides[itemId]?.value ?? sourceItem?.value ?? fallback;
  };

  const selectedWorkGoal = getDecisionSummaryValue('work_goal', '多人演播有声书');

  const buildTaskContract = (): TaskCreationContract | null => {
    if (!selectedBook || selectedRangeChapters.length === 0 || !selectedStrategy) return null;
    return {
      bookId: selectedBook.id,
      bookTitle: selectedBook.title,
      chapterIndices: selectedRangeChapters.map((chapter) => chapter.chapter_index),
      rangeLabel: selectedRangeLabel,
      totalChars: selectedRangeTotalChars,
      chapterCount: selectedRangeChapters.length,
      workGoal: getDecisionSummaryValue('work_goal', '多人演播有声书'),
      strategyTitle: selectedStrategy.title,
      strategyDesc: selectedStrategy.desc,
      deliveryOptions,
    };
  };

  const handleProductionHandoff = async () => {
    if (isProductionRunning) return;
    const contract = buildTaskContract();
    if (!contract) return;

    setProductionStatus('running');
    setProductionError('');
    setProductionQueue([]);
    setProductionRun({
      id: `local-production-${Date.now()}`,
      status: 'running',
      steps: GATEWAY_PRODUCTION_STEPS.map((step) => ({ ...step })),
      result: null,
      error: null,
    });

    try {
      const result = await startGatewayProductionHandoff(contract);
      setProductionRun(result.productionRun);
      setProductionQueue(result.productionQueue);
      setProductionStatus('completed');
      onStart(result.contract);
    } catch (error) {
      setProductionStatus('failed');
      setProductionError(error instanceof Error ? error.message : '制作交接失败');
      setProductionRun((current) => current
        ? { ...current, status: 'failed', error: error instanceof Error ? error.message : '制作交接失败' }
        : current);
    }
  };

  const handleRunAnalysis = async () => {
    if (!sourceConfirmed || isAnalysisRunning) return;

    setAnalysisStatus('running');
    setAnalysisReport(null);
    setAnalysisRun({
      id: `local-analysis-${Date.now()}`,
      status: 'running',
      steps: GATEWAY_ANALYSIS_STEPS.map((step) => ({ ...step })),
      result: null,
      error: null,
    });
    setAnalysisError('');
    setSelectedStrategyId('');
    setActiveStep(3);

    try {
      const chapters = await Promise.all(selectedRangeChapters.map(async (chapter) => {
        const detail = await getChapterText(selectedBookId, chapter.chapter_index);
        return {
          chapter_index: chapter.chapter_index,
          title: chapter.title,
          preview: chapter.preview,
          char_count: chapter.char_count,
          text: detail.text,
        };
      }));
      const { analysisRun: startedRun } = await startGatewayAnalysis({
        workGoal: selectedWorkGoal,
        rangeLabel: selectedRangeLabel,
        customNotes: Object.values(decisionOverrides).map((item) => item.customNote).filter(Boolean).join('\n'),
        chapters,
      });
      setAnalysisRun(startedRun);
      setAnalysisStatus('running');
      setActiveStep(3);
    } catch (error) {
      setAnalysisStatus('failed');
      setAnalysisError(error instanceof Error ? error.message : 'AI 初读分析失败，请重试。');
      setAnalysisRun((current) => current
        ? { ...current, status: 'failed', error: error instanceof Error ? error.message : 'AI 初读分析失败，请重试。' }
        : current);
    }
  };

  const getFooterTitle = () => {
    if (activeStep === 1) {
      if (isIntakeRunning) return '正在确认素材';
      if (sourceConfirmed) return `已确认：${selectedRangeLabel}`;
      return sourceReady ? `待确认：${selectedRangeLabel}` : '等待选择任务素材';
    }
    if (activeStep === 2) {
      return isAnalysisRunning ? 'AI 初读分析中' : sourceConfirmed ? '等待确认目标和范围' : '请先完成素材确认';
    }
    if (isProductionRunning) return '正在生成制作执行单';
    if (productionStatus === 'failed') return '制作交接失败';
    return analysisCompleted ? '等待确认修改方向' : isAnalysisRunning ? 'AI 初读分析中' : '等待目标和范围确认';
  };

  const getFooterDesc = () => {
    if (activeStep === 1) return '确认后会进入目标和范围配置；后台解析会自动完成，不需要你理解技术链路。';
    if (activeStep === 2) return '确认后只进入 AI 初读分析，不会直接改稿；分析完成会自动进入第 3 步。';
    if (isProductionRunning) return '正在校验策略、生成执行合同并解析制作队列。';
    if (productionStatus === 'failed') return productionError || '请查看状态机证据后重试。';
    return '确认修改方向和交付清单后，生成工作台执行单；制作 Agent 仍会在工作台开工后启动。';
  };

  const getFooterButtonText = () => {
    if (activeStep === 1) return isIntakeRunning ? '正在确认素材' : sourceConfirmed ? '重新确认素材' : '确认这份素材，继续配置目标';
    if (activeStep === 2) return isAnalysisRunning ? 'AI 初读分析中' : analysisCompleted ? '重新分析并进入第 3 步' : '确认目标和范围，进入第 3 步';
    if (isProductionRunning) return '正在生成执行单';
    if (productionStatus === 'failed') return '重试生成执行单';
    return '确认方向，进入工作台';
  };

  const isFooterButtonDisabled = () => {
    if (activeStep === 1) return isIntakeRunning || !sourceReady;
    if (activeStep === 2) return !sourceConfirmed || isAnalysisRunning;
    return !analysisCompleted || !selectedStrategyId || isProductionRunning;
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
    void handleProductionHandoff();
  };

  const getIntakeStepClassName = (step: any, stepIdx: number) => {
    if (step.status === 'succeeded' || intakeStatus === 'completed' || intakeStepIndex > stepIdx) return styles.backgroundStepDone;
    if (step.status === 'failed') return styles.backgroundStepFailed;
    if (step.status === 'running' || (isIntakeRunning && intakeStepIndex === stepIdx)) return styles.backgroundStepRunning;
    return styles.backgroundStepPending;
  };

  const getIntakeStepMeta = (step: any) => {
    const modeLabel = step.mode === 'agent' ? 'Agent' : step.mode === 'mock' ? 'Mock' : step.mode === 'system' ? 'System' : 'Rule';
    const statusLabel = step.status === 'succeeded' ? '成功' : step.status === 'running' ? '执行中' : step.status === 'failed' ? '失败' : '待执行';
    const duration = typeof step.durationMs === 'number' ? ` · ${step.durationMs}ms` : '';
    return `${modeLabel} · ${statusLabel}${duration} · ${step.executor}`;
  };

  return (
    <WizardContext.Provider value={{
      activeStep, setActiveStep,
      intakeResult, setIntakeResult,
      analysisReport, setAnalysisReport,
      decisionOverrides, setDecisionOverrides,
      editingDecisionId, setEditingDecisionId,
      updateDecision, updateDecisionNote,
      ...sourceHook
    }}>
      <div className={styles.createShell}>
        <header className={styles.createComposerHeader}>
          <div>
            <div className={styles.detailEyebrow}>新建内容任务</div>
            <h1>先确认素材，再配置目标</h1>
            <p>第一步只需要确认本次要处理的书和章节；后台解析、内容识别和任务草案会自动完成。</p>
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
                  ? 'AI 初读分析完成，等待你确认修改方向。'
                  : isAnalysisRunning
                    ? '业务分析 Agent 正在输出问题、证据和修改方向。'
                    : sourceConfirmed
                      ? '已生成任务草案，等待你确认目标订单。'
                      : isIntakeRunning
                        ? `正在执行第 ${Math.min(intakeStepIndex + 1, displayedIntakeSteps.length)} 步素材摄入。`
                        : '先确认素材，系统再自动生成任务草案。'}
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
            {activeStep === 1 && <StepSource />}
            {activeStep === 2 && <StepAnalysis />}
            {activeStep === 3 && <StepStrategy />}

            <div className={`${styles.card} ${styles.composerEvidenceCard}`}>
              <div className={styles.evidenceHeader}>
                <strong>后台解析状态机证据与事件追溯</strong>
                <span className={styles.evidenceSummary}>{evidenceSummary}</span>
              </div>
              {activeStep === 1 ? (
                <div className={styles.backgroundStepList}>
                  {displayedIntakeSteps.map((step, idx) => (
                    <div key={step.id} className={`${styles.backgroundStepItem} ${getIntakeStepClassName(step, idx)}`}>
                      <div className={styles.backgroundStepRow}>
                        <strong className={styles.backgroundStepName}>
                          {step.id === 'save' ? `[OK] ${step.title}` : step.title}
                        </strong>
                        <span className={styles.backgroundStepDuration}>{getIntakeStepMeta(step)}</span>
                      </div>
                      <p className={styles.backgroundStepDesc}>{step.desc}</p>
                    </div>
                  ))}
                </div>
              ) : activeStep === 2 ? (
                <div className={styles.backgroundStepList}>
                  {displayedAnalysisSteps.map((step: any) => (
                    <div key={step.id} className={`${styles.backgroundStepItem} ${
                      step.status === 'succeeded' ? styles.backgroundStepDone :
                      step.status === 'failed' ? styles.backgroundStepFailed :
                      step.status === 'running' ? styles.backgroundStepRunning : styles.backgroundStepPending
                    }`}>
                      <div className={styles.backgroundStepRow}>
                        <strong className={styles.backgroundStepName}>{step.title}</strong>
                        <span className={styles.backgroundStepDuration}>{step.executor}</span>
                      </div>
                      <p className={styles.backgroundStepDesc}>{step.desc}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.backgroundStepList}>
                  {displayedProductionSteps.map((step: any) => (
                    <div key={step.id} className={`${styles.backgroundStepItem} ${
                      step.status === 'succeeded' ? styles.backgroundStepDone :
                      step.status === 'failed' ? styles.backgroundStepFailed :
                      step.status === 'running' ? styles.backgroundStepRunning : styles.backgroundStepPending
                    }`}>
                      <div className={styles.backgroundStepRow}>
                        <strong className={styles.backgroundStepName}>{step.title}</strong>
                        <span className={styles.backgroundStepDuration}>{step.executor}</span>
                      </div>
                      <p className={styles.backgroundStepDesc}>{step.desc}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>

        <footer className={styles.composerFooter}>
          <div className={styles.footerSummary}>
            <strong>{getFooterTitle()}</strong>
            <span>{getFooterDesc()}</span>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isFooterButtonDisabled()}
            onClick={handleFooterAction}
          >
            {getFooterButtonText()}
          </button>
        </footer>
      </div>
    </WizardContext.Provider>
  );
}
export default TaskCreateWizard;
