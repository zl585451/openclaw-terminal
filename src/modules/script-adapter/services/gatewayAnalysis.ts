import type { AnalysisReport } from './mockTaskIntake';
import type { GatewayIntakeStep, IntakeExecutionMode, IntakeStepStatus } from './gatewayIntake';

export interface GatewayAnalysisStep {
  id: string;
  title: string;
  desc: string;
  mode: IntakeExecutionMode;
  executor: string;
  status: IntakeStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  model?: string | null;
}

export interface GatewayAnalysisRun {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  steps: GatewayAnalysisStep[];
  result?: AnalysisReport | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
}

export const GATEWAY_ANALYSIS_STEPS: GatewayAnalysisStep[] = [
  {
    id: 'validate_order',
    title: '目标订单校验',
    desc: '确认工作目标、处理范围和输入文本完整。',
    mode: 'system',
    executor: 'oct-gateway.analysis-order',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
    model: null,
  },
  {
    id: 'prepare_context',
    title: '分析上下文整理',
    desc: '整理章节正文、字数、预览和用户确认项。',
    mode: 'rule',
    executor: 'oct-gateway.analysis-context',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
    model: null,
  },
  {
    id: 'business_analysis',
    title: '业务分析 Agent 初读',
    desc: '调用真实模型生成问题诊断、证据、策略选项和执行影响。',
    mode: 'agent',
    executor: 'agent.business_analysis@1.0',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
    model: null,
  },
];

export interface StartGatewayAnalysisPayload {
  workGoal: string;
  rangeLabel: string;
  customNotes?: string;
  chapters: Array<{
    chapter_index: number;
    title: string | null;
    preview?: string | null;
    char_count?: number | null;
    text: string;
  }>;
}

type StartGatewayAnalysisResponse = {
  success?: boolean;
  error?: string;
  analysisRun?: GatewayAnalysisRun;
  result?: AnalysisReport;
};

export async function startGatewayAnalysis(payload: StartGatewayAnalysisPayload): Promise<{
  analysisRun: GatewayAnalysisRun;
}> {
  if (!window.electronAPI?.startScriptAdapterAnalysis) {
    throw new Error('ANALYSIS_API_UNAVAILABLE: 当前环境未注入真实分析 IPC，无法启动业务分析 Agent。');
  }
  const res = await window.electronAPI.startScriptAdapterAnalysis({ ...payload }) as StartGatewayAnalysisResponse;
  if (!res.success || !res.analysisRun) {
    throw new Error(res.error || res.analysisRun?.error || '业务分析失败');
  }
  return { analysisRun: res.analysisRun };
}

export function toEvidenceStep(step: GatewayAnalysisStep): GatewayIntakeStep {
  return {
    id: step.id,
    title: step.title,
    desc: step.model ? `${step.desc} 模型：${step.model}` : step.desc,
    mode: step.mode,
    executor: step.executor,
    status: step.status,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    durationMs: step.durationMs,
    error: step.error,
  };
}
