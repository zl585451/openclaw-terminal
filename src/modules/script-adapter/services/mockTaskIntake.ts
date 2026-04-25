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
  id: string;
  label: string;
  value: string;
  desc: string;
  options: Array<{
    value: string;
    desc: string;
    source: 'recommended' | 'preset' | 'agent';
  }>;
  customHint: string;
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
          id: 'target_product',
          label: '目标产物',
          value: '多人演播有声书',
          desc: '按有声书团队模板生成分析和后续制作链路。',
          customHint: '如果目标不在列表里，可以写成“我要把它做成……”。系统会判断是否需要切换 Agent 团队。',
          options: [
            { value: '多人演播有声书', desc: '适合小说口语化、角色音、演播提示和音效设计。', source: 'recommended' },
            { value: '小说润色', desc: '保留小说文本形态，只优化语言、节奏和可读性。', source: 'preset' },
            { value: '剧情重写', desc: '允许重构篇章、冲突和人物动机，需要更强人工确认。', source: 'preset' },
            { value: '作品分析', desc: '只输出问题、风险和修改建议，不直接改稿。', source: 'preset' },
          ],
        },
        {
          id: 'scope',
          label: '处理范围',
          value: '第 1 章',
          desc: '先跑样章范围，避免第一次任务过大。',
          customHint: '可以写具体章节、段落或页码，例如“第1章前半段”或“从雨夜开场到第一次对话”。',
          options: [
            { value: '第 1 章', desc: '适合样章试跑，能快速验证流程和效果。', source: 'recommended' },
            { value: '第 1 章前半段', desc: '更小范围，适合先看演播标注样式。', source: 'preset' },
            { value: '全文', desc: '适合素材较短或已经确认方案后批量处理。', source: 'preset' },
            { value: '自定义范围', desc: '由用户指定章节、段落或文件片段。', source: 'preset' },
          ],
        },
        {
          id: 'edit_permission',
          label: '改动权限',
          value: '不改剧情，只提升听感',
          desc: '保护剧情事实，先聚焦听感、角色音和演播可执行性。',
          customHint: '这里最好写清楚“哪些不能动”。例如事实、结论、人物关系、核心观点或剧情事件。',
          options: [
            { value: '不改剧情，只提升听感', desc: '适合有声书改编，保护剧情事实和人物关系。', source: 'recommended' },
            { value: '轻度润色', desc: '只改语言表达，不动结构和事实。', source: 'preset' },
            { value: '中度改写', desc: '允许重排句子和段落，让表达更顺。', source: 'preset' },
            { value: '重度重写', desc: '允许重建篇章表达，需要明确人工确认。', source: 'preset' },
            { value: '只分析不改', desc: '只生成问题清单和修改建议。', source: 'preset' },
          ],
        },
        {
          id: 'next_agent',
          label: '下一步 Agent',
          value: '业务分析 Agent',
          desc: '先输出问题和方向，不直接进入改稿。',
          customHint: '通常不建议手写 Agent 名称。自定义内容会作为调度备注，由任务安排 Agent 判断是否可用。',
          options: [
            { value: '业务分析 Agent', desc: '先分析作品问题、目标匹配和执行风险。', source: 'recommended' },
            { value: '文本润色 Agent', desc: '直接进入语言层优化，适合低风险短文本。', source: 'agent' },
            { value: '结构诊断 Agent', desc: '适合论文、演讲稿、长文章的结构问题分析。', source: 'agent' },
            { value: '剧情重写 Agent', desc: '适合小说剧情、人物动机和篇章重构。', source: 'agent' },
            { value: '学术规范 Agent', desc: '适合论文润色、摘要、引言和投稿规范检查。', source: 'agent' },
          ],
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
