export type IntakeStatus = 'idle' | 'running' | 'completed' | 'failed';
export type AnalysisStatus = 'idle' | 'running' | 'completed' | 'failed';

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

export interface SourceProfileDraft {
  contentCategory: string;
  structureSummary: string;
  confidenceLabel: string;
  recommendedDirections: Array<{
    name: string;
    reason: string;
    level: 'recommended' | 'available';
  }>;
  unsupportedDirections: Array<{
    name: string;
    reason: string;
  }>;
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
  sourceProfile: SourceProfileDraft;
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

export interface AnalysisReport {
  agentName: string;
  summary: string;
  diagnosis: Array<{
    title: string;
    detail: string;
    severity: '轻' | '中' | '高';
  }>;
  evidence: Array<{
    location: string;
    issue: string;
    quote: string;
  }>;
  strategyOptions: Array<{
    id: string;
    title: string;
    desc: string;
    editDepth: string;
    impact: string;
    recommended?: boolean;
  }>;
  recommendedStrategyId: string;
  executionImpact: {
    nextAgents: string[];
    outputs: string[];
    requiresReview: boolean;
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
    sourceProfile: {
      contentCategory: '小说正文',
      structureSummary: '已识别第 1 章，旁白和对白混合，具备场景化改编基础。',
      confidenceLabel: '高可信',
      recommendedDirections: [
        { name: '多人演播有声书 · 先做业务分析', reason: '适合听感、角色音和演播风险分析。', level: 'recommended' },
        { name: '广播剧 · 先做可行性分析', reason: '可以改造，但需要更强场景重构。', level: 'available' },
        { name: '小说润色 · 先做问题分析', reason: '适合保留小说形态，先判断语言和节奏问题。', level: 'available' },
        { name: '只做作品分析', reason: '低风险，只输出问题和建议。', level: 'available' },
      ],
      unsupportedDirections: [
        { name: '论文润色', reason: '当前素材不是论文结构。' },
        { name: '演讲稿优化', reason: '当前文本不是演讲或口播稿。' },
      ],
    },
    intakeSummary: '系统判断：小说正文 / 已识别第 1 章 / 可做多人演播或广播剧方向 / 轻风险',
    recommendedAction: '确认多人演播有声书目标，并先分析第 1 章。',
    recommendedReason: '文本为小说正文，旁白和对白混合，适合先锁定产物和范围，再进入听感、结构和角色音风险分析。',
    plannerAgent: 'task.intake_planner@1.0',
    taskDraft: {
      confirmItems: [
        {
          id: 'work_goal',
          label: '工作目标',
          value: '多人演播有声书 · 先做业务分析',
          desc: '先确认要做的产物类型，不在这里决定改稿深度。',
          customHint: '如果目标不准确，可以补一句你真正想要的产物，例如“只想做小说润色”或“只帮我判断文章问题”。',
          options: [
            { value: '多人演播有声书 · 先做业务分析', desc: '适合先检查听感、结构、角色音和演播风险。', source: 'recommended' },
            { value: '广播剧 · 先做可行性分析', desc: '适合小说场景化改造，但需要先判断改造成本。', source: 'preset' },
            { value: '小说润色 · 先做问题分析', desc: '保留小说文本形态，先找语言和节奏问题。', source: 'preset' },
            { value: '只做作品分析', desc: '只输出问题清单和修改建议，不进入改稿。', source: 'preset' },
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

export async function runMockInitialAnalysis(): Promise<AnalysisReport> {
  await wait(900);

  return {
    agentName: '业务分析 Agent',
    summary: '第 1 章适合做多人演播方向试跑，但建议先处理旁白听感、对白可演性和角色音区分问题，不建议直接进入全章重改。',
    diagnosis: [
      {
        title: '旁白书面感偏重',
        detail: '部分叙述句信息密度较高，直接朗读时容易显得硬，需要转成更顺耳的口播表达。',
        severity: '中',
      },
      {
        title: '对白归属需要确认',
        detail: '部分台词或文件记录类内容可能不是现场对白，需要标注为回忆、文件声或待定角色音。',
        severity: '高',
      },
      {
        title: '场景衔接可强化',
        detail: '章节内存在调查、翻阅资料和情绪转折，适合补充停顿、声场或 BGM 进入点。',
        severity: '轻',
      },
    ],
    evidence: [
      {
        location: '第 1 章 · 开场段',
        issue: '旁白信息密度偏高',
        quote: '周佳宁推门进去的时候，屋里还残留着潮湿的木头气味。',
      },
      {
        location: '第 1 章 · 文件翻阅段',
        issue: '声音主体不明确',
        quote: '“老马说，别查了。”',
      },
      {
        location: '第 1 章 · 调查推进段',
        issue: '转场缺少听觉提示',
        quote: '她继续往后翻，年份一点点往前推。',
      },
    ],
    strategyOptions: [
      {
        id: 'analysis_only',
        title: '只保留分析结果',
        desc: '暂不改稿，只输出问题清单和后续制作建议。',
        editDepth: '不改原文',
        impact: '适合先让统筹确认方向。',
      },
      {
        id: 'light_listening_polish',
        title: '轻度听感润色',
        desc: '只处理不顺口的旁白和句式，不改变剧情、人物关系和信息顺序。',
        editDepth: '轻度',
        impact: '会进入文本听感优化 Agent。',
      },
      {
        id: 'audiobook_sample',
        title: '有声书样章制作',
        desc: '在轻度听感润色基础上，补充角色音、BGM、音效和 CV 情绪提示。',
        editDepth: '中度',
        impact: '会进入文本改编、角色音标注和演播设计 Agent。',
        recommended: true,
      },
      {
        id: 'drama_feasibility',
        title: '广播剧可行性拆解',
        desc: '不直接改成广播剧，先判断场景重构、对白增强和音效成本。',
        editDepth: '分析优先',
        impact: '会进入场景拆分和广播剧可行性分析。',
      },
    ],
    recommendedStrategyId: 'audiobook_sample',
    executionImpact: {
      nextAgents: ['文本改编 Agent', '角色音标注 Agent', '演播设计 Agent'],
      outputs: ['有声书样章文本', '角色音标注表', '演播设计提示'],
      requiresReview: true,
    },
  };
}
