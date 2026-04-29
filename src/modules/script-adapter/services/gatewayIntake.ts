import type { IntakeResult } from './mockTaskIntake';

export type IntakeStepStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type IntakeExecutionMode = 'system' | 'rule' | 'agent' | 'mock';

export interface GatewayIntakeStep {
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

export interface GatewayIntakeRun {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  source?: {
    mode?: string;
    bookId?: string | null;
    bookTitle?: string;
    rangeLabel?: string;
    chapterIndices?: number[];
  };
  steps: GatewayIntakeStep[];
  result?: IntakeResult | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
}

export const GATEWAY_INTAKE_STEPS: GatewayIntakeStep[] = [
  {
    id: 'raw_asset',
    title: 'RawAsset 原始文件留存',
    desc: '记录本次素材来源、书籍、章节和输入方式。',
    mode: 'system',
    executor: 'oct-gateway.intake',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  },
  {
    id: 'text_extract',
    title: '文本抽取 / 清洗 / 编码统一',
    desc: '把章节文本或粘贴文本规整成后续链路可读的纯文本。',
    mode: 'rule',
    executor: 'oct-gateway.text-normalizer',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  },
  {
    id: 'source_document',
    title: 'SourceDocument 标准化入库',
    desc: '生成标准文档草案，后续步骤不再依赖上传方式。',
    mode: 'rule',
    executor: 'oct-gateway.source-document',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  },
  {
    id: 'source_profile',
    title: 'SourceProfile 建索引和轻量画像',
    desc: '基于真实文本统计章节、字数、正文类型和处理风险。',
    mode: 'rule',
    executor: 'oct-gateway.source-profiler',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  },
  {
    id: 'task_draft',
    title: 'TaskDraft 任务草案生成',
    desc: '生成下一步需要人工确认的目标、范围和候选执行方向。',
    mode: 'rule',
    executor: 'oct-gateway.task-draft',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  },
];

export interface StartGatewayIntakePayload {
  sourceMode: 'library' | 'paste' | 'upload';
  bookId?: string;
  sourceTitle: string;
  rangeLabel: string;
  sourceTypeLabel: string;
  chapterIndices: number[];
  chapters?: Array<{
    chapter_index: number;
    title: string | null;
    preview?: string | null;
    char_count?: number | null;
    text?: string;
  }>;
  pastedText?: string;
}

type StartGatewayIntakeResponse = {
  success?: boolean;
  error?: string;
  intakeRun?: GatewayIntakeRun;
  result?: IntakeResult;
};

export async function startGatewayIntake(payload: StartGatewayIntakePayload): Promise<{
  intakeRun: GatewayIntakeRun;
  result: IntakeResult;
}> {
  if (!window.electronAPI?.startScriptAdapterIntake) {
    throw new Error('INTAKE_API_UNAVAILABLE: 当前环境未注入真实摄入 IPC，无法证明后台状态机执行。');
  }
  const res = await window.electronAPI.startScriptAdapterIntake({ ...payload }) as StartGatewayIntakeResponse;
  if (!res.success || !res.intakeRun || !res.result) {
    throw new Error(res.error || res.intakeRun?.error || '素材摄入失败');
  }
  return { intakeRun: res.intakeRun, result: res.result };
}
