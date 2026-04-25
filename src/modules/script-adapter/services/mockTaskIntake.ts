export type IntakeStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface IntakeStep {
  id: string;
  title: string;
  desc: string;
}

export interface SourceDocumentDraft {
  fileName: string;
  sourceType: string;
  chapterHint: string;
  wordCountLabel: string;
}

export interface TaskDraftConfirmItem {
  label: string;
  value: string;
  desc: string;
}

export interface IntakeResult {
  rawAssetId: string;
  sourceDocument: SourceDocumentDraft;
  intakeSummary: string;
  recommendedAction: string;
  recommendedReason: string;
  plannerAgent: string;
  taskDraft: {
    confirmItems: TaskDraftConfirmItem[];
  };
  agentPreAllocation: {
    assignedCount: number;
    nextAgent: string;
    candidateCount: number;
    requiresHumanConfirm: boolean;
  };
}

export const MOCK_INTAKE_STEPS: IntakeStep[] = [
  {
    id: 'raw_asset',
    title: 'RawAsset 原始文件留存',
    desc: '保存原始文件入口和上传元信息，保证后续可以回看。',
  },
  {
    id: 'text_extract',
    title: '文本抽取 / 清洗 / 编码统一',
    desc: '把不同来源统一成可被 Agent 读取的纯文本。',
  },
  {
    id: 'source_document',
    title: 'SourceDocument 标准化入库',
    desc: '生成标准文档对象，后续 Agent 不再关心上传方式。',
  },
  {
    id: 'source_profile',
    title: 'SourceProfile 建索引和轻量画像',
    desc: '识别章节、题材、文本形态和轻量风险。',
  },
  {
    id: 'task_draft',
    title: '任务安排 Agent 生成 TaskDraft',
    desc: '生成推荐执行方案、确认项和后续 Agent 队列。',
  },
];

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

export async function runMockTaskIntake(onStepDone: (stepIndex: number) => void): Promise<IntakeResult> {
  for (let index = 0; index < MOCK_INTAKE_STEPS.length; index += 1) {
    await wait(index === 0 ? 380 : 520);
    onStepDone(index + 1);
  }

  return {
    rawAssetId: 'raw_asset_mock_20260425_001',
    sourceDocument: {
      fileName: '长夜未瞑_第1章.txt',
      sourceType: '小说正文',
      chapterHint: '识别第 1 章',
      wordCountLabel: '约 3,200 字',
    },
    intakeSummary: '系统判断：小说正文 / 已识别第 1 章 / 适合多人演播 / 轻风险',
    recommendedAction: '先做第 1 章的业务分析，不直接改稿。',
    recommendedReason: '文本为小说正文，旁白和对白混合，适合先做听感、结构和角色音风险分析。',
    plannerAgent: 'task.intake_planner@1.0',
    taskDraft: {
      confirmItems: [
        {
          label: '目标产物',
          value: '多人演播有声书',
          desc: '按有声书团队模板生成分析和后续制作链路。',
        },
        {
          label: '处理范围',
          value: '第 1 章',
          desc: '先跑样章范围，避免第一次任务过大。',
        },
        {
          label: '改动权限',
          value: '不改剧情，只提升听感',
          desc: '保护剧情事实，先聚焦听感、角色音和演播可执行性。',
        },
        {
          label: '下一步 Agent',
          value: '业务分析 Agent',
          desc: '先输出问题和方向，不直接进入改稿。',
        },
      ],
    },
    agentPreAllocation: {
      assignedCount: 3,
      nextAgent: '业务分析 Agent',
      candidateCount: 3,
      requiresHumanConfirm: true,
    },
  };
}
