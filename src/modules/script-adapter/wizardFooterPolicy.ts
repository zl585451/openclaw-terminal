import type { AnalysisStatus, IntakeStatus } from './services/mockTaskIntake';

export interface TaskWizardFooterPolicyInput {
  activeStep: 1 | 2 | 3;
  intakeStatus: IntakeStatus;
  sourceReady: boolean;
  sourceConfirmed: boolean;
  selectedRangeLabel: string;
  analysisStatus: AnalysisStatus;
  analysisCompleted: boolean;
  selectedStrategyId: string;
  productionStatus: IntakeStatus;
  productionError: string;
}

export interface TaskWizardFooterPolicy {
  title: string;
  desc: string;
  buttonText: string;
  disabled: boolean;
  action: 'confirm_source' | 'run_analysis' | 'handoff_production';
}

export function getTaskWizardFooterPolicy(input: TaskWizardFooterPolicyInput): TaskWizardFooterPolicy {
  const {
    activeStep,
    intakeStatus,
    sourceReady,
    sourceConfirmed,
    selectedRangeLabel,
    analysisStatus,
    analysisCompleted,
    selectedStrategyId,
    productionStatus,
    productionError,
  } = input;

  const isIntakeRunning = intakeStatus === 'running';
  const isAnalysisRunning = analysisStatus === 'running';
  const isProductionRunning = productionStatus === 'running';

  if (activeStep === 1) {
    return {
      title: isIntakeRunning ? '正在确认素材' : sourceConfirmed ? `已确认：${selectedRangeLabel}` : sourceReady ? `待确认：${selectedRangeLabel}` : '等待选择任务素材',
      desc: '确认后会进入目标和范围配置；后台解析会自动完成，不需要你理解技术链路。',
      buttonText: isIntakeRunning ? '正在确认素材' : sourceConfirmed ? '重新确认素材' : '确认这份素材，继续配置目标',
      disabled: isIntakeRunning || !sourceReady,
      action: 'confirm_source',
    };
  }

  if (activeStep === 2) {
    return {
      title: isAnalysisRunning ? 'AI 初读分析中' : sourceConfirmed ? '等待确认目标和范围' : '请先完成素材确认',
      desc: '确认后只进入 AI 初读分析，不会直接改稿；分析完成会自动进入第 3 步。',
      buttonText: isAnalysisRunning ? 'AI 初读分析中' : analysisCompleted ? '重新分析并进入第 3 步' : '确认目标和范围，进入第 3 步',
      disabled: !sourceConfirmed || isAnalysisRunning,
      action: 'run_analysis',
    };
  }

  return {
    title: isProductionRunning
      ? '正在生成制作执行单'
      : productionStatus === 'failed'
        ? '制作交接失败'
        : analysisCompleted
          ? '等待确认修改方向'
          : isAnalysisRunning
            ? 'AI 初读分析中'
            : '等待目标和范围确认',
    desc: isProductionRunning
      ? '正在校验策略、生成执行合同并解析制作队列。'
      : productionStatus === 'failed'
        ? productionError || '请查看状态机证据后重试。'
        : '确认修改方向和交付清单后，生成工作台执行单；制作 Agent 仍会在工作台开工后启动。',
    buttonText: isProductionRunning
      ? '正在生成执行单'
      : productionStatus === 'failed'
        ? '重试生成执行单'
        : '确认方向，进入工作台',
    disabled: !analysisCompleted || !selectedStrategyId || isProductionRunning,
    action: 'handoff_production',
  };
}
