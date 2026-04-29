import type { DeliveryOptions, TaskCreationContract } from '../types/batch';
import type { GatewayIntakeStep, IntakeExecutionMode, IntakeStepStatus } from './gatewayIntake';

export interface ProductionQueueItem {
  id: string;
  label: string;
  enabled: boolean;
  reason: string;
}

export interface GatewayProductionStep {
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
}

export interface GatewayProductionRun {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  steps: GatewayProductionStep[];
  result?: {
    contract?: TaskCreationContract;
    productionQueue?: ProductionQueueItem[];
  } | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
}

export const GATEWAY_PRODUCTION_STEPS: GatewayProductionStep[] = [
  {
    id: 'validate_strategy',
    title: '修改策略校验',
    desc: '确认已选择修改策略、处理范围和交付物。',
    mode: 'system',
    executor: 'oct-gateway.production-handoff',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  },
  {
    id: 'build_execution_contract',
    title: '生成制作执行合同',
    desc: '把目标、范围、策略和交付物固化为工作台合同。',
    mode: 'rule',
    executor: 'oct-gateway.execution-contract',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  },
  {
    id: 'resolve_production_queue',
    title: '解析制作队列',
    desc: '按交付物开关计算将要启用的制作 Agent 和模块。',
    mode: 'rule',
    executor: 'oct-gateway.production-queue',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  },
  {
    id: 'handoff_workbench',
    title: '交接到制作工作台',
    desc: '把执行合同交给工作台，等待用户在开工页启动批次。',
    mode: 'system',
    executor: 'oct-gateway.workbench-handoff',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  },
];

export async function startGatewayProductionHandoff(payload: TaskCreationContract): Promise<{
  productionRun: GatewayProductionRun;
  contract: TaskCreationContract;
  productionQueue: ProductionQueueItem[];
}> {
  if (!window.electronAPI?.startScriptAdapterProductionHandoff) {
    throw new Error('PRODUCTION_HANDOFF_API_UNAVAILABLE: 当前环境未注入制作交接 IPC。');
  }
  const res = await window.electronAPI.startScriptAdapterProductionHandoff({ ...payload }) as {
    success?: boolean;
    error?: string;
    productionRun?: GatewayProductionRun;
    result?: {
      contract?: TaskCreationContract;
      productionQueue?: ProductionQueueItem[];
    };
  };
  if (!res.success || !res.productionRun || !res.result?.contract) {
    throw new Error(res.error || res.productionRun?.error || '制作交接失败');
  }
  return {
    productionRun: res.productionRun,
    contract: res.result.contract,
    productionQueue: res.result.productionQueue || [],
  };
}

export function productionStepToEvidence(step: GatewayProductionStep): GatewayIntakeStep {
  return {
    id: step.id,
    title: step.title,
    desc: step.desc,
    mode: step.mode,
    executor: step.executor,
    status: step.status,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    durationMs: step.durationMs,
    error: step.error,
  };
}

export function buildProductionQueuePreview(deliveryOptions: DeliveryOptions): ProductionQueueItem[] {
  return [
    { id: 'adapter.audiobook_text_rewriter@1.0', label: '文本改编 Agent', enabled: true, reason: '生成多人演播台本' },
    { id: 'classifier.voice_role_marker@1.0', label: '角色音标注 Agent', enabled: deliveryOptions.voiceRegistry, reason: '生成角色音表' },
    { id: 'designer.performance_audio@1.0', label: '演播设计 Agent', enabled: deliveryOptions.cvDirections || deliveryOptions.bgmSfx, reason: '生成 CV/BGM/SFX 指导' },
    { id: 'reviewer.production_quality@1.0', label: '质检 Agent', enabled: deliveryOptions.qualityReview, reason: '生成质检报告' },
    { id: 'packager.content_delivery@1.0', label: '交付打包模块', enabled: deliveryOptions.finalPackage, reason: '生成最终交付包' },
  ].filter((item) => item.enabled);
}
