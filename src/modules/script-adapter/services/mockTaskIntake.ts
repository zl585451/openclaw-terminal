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

export interface MockIntakeContext {
  sourceTitle: string;
  rangeLabel: string;
  wordCountLabel: string;
  sourceTypeLabel: string;
}

export interface MockAnalysisChapter {
  title: string;
  preview: string;
  charCount: number;
}

export interface MockAnalysisContext {
  rangeLabel: string;
  chapterCount: number;
  totalChars: number;
  chapters: MockAnalysisChapter[];
  workGoal?: string;
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

const getDefaultIntakeContext = (): MockIntakeContext => ({
  sourceTitle: '长夜未瞑',
  rangeLabel: '第 1 章',
  wordCountLabel: '约 3,200 字',
  sourceTypeLabel: '小说正文',
});

const pickPreviewQuote = (text: string | undefined, fallback: string) => {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  const sentence = normalized.split(/[。！？!?]/).find((part) => part.trim().length >= 8)?.trim();
  return sentence ? `${sentence}。` : `${normalized.slice(0, 48)}${normalized.length > 48 ? '…' : ''}`;
};

export async function runMockTaskIntake(
  onStepDone: (stepIndex: number) => void,
  context?: Partial<MockIntakeContext>,
): Promise<IntakeResult> {
  for (let index = 0; index < MOCK_INTAKE_STEPS.length; index += 1) {
    await wait(index === 0 ? 380 : 520);
    onStepDone(index + 1);
  }

  const input = { ...getDefaultIntakeContext(), ...context };
  const rangeDesc = input.rangeLabel || '待确认范围';

  return {
    rawAssetId: 'raw_asset_mock_20260425_001',
    sourceDocument: {
      fileName: `${input.sourceTitle}_${rangeDesc}.txt`,
      sourceType: input.sourceTypeLabel,
      chapterHint: `识别 ${rangeDesc}`,
      wordCountLabel: input.wordCountLabel,
    },
    sourceProfile: {
      contentCategory: '小说正文',
      structureSummary: `已识别 ${rangeDesc}，旁白和对白混合，具备场景化改编基础。`,
      confidenceLabel: '高可信',
      recommendedDirections: [
        { name: '多人演播有声书', reason: '适合后续生成台本、角色音和质检交付物。', level: 'recommended' },
        { name: '广播剧样章', reason: '可以改造，但需要更强场景重构。', level: 'available' },
        { name: '小说润色稿', reason: '适合保留小说形态，优化语言和节奏。', level: 'available' },
        { name: '作品分析报告', reason: '低风险，只输出问题和建议。', level: 'available' },
      ],
      unsupportedDirections: [
        { name: '论文润色', reason: '当前素材不是论文结构。' },
        { name: '演讲稿优化', reason: '当前文本不是演讲或口播稿。' },
      ],
    },
    intakeSummary: `系统判断：小说正文 / 已识别 ${rangeDesc} / 可做多人演播或广播剧方向 / 轻风险`,
    recommendedAction: `把本轮工作目标锁定为“多人演播有声书”，处理范围锁定为${rangeDesc}。`,
    recommendedReason: '文本为小说正文，旁白和对白混合，适合先确定要交付的产品类型和样章范围；具体改法留到 AI 初读后再决定。',
    plannerAgent: 'task.intake_planner@1.0',
    taskDraft: {
      confirmItems: [
        {
          id: 'work_goal',
          label: '工作目标',
          value: '多人演播有声书',
          desc: '这里只确认最终要做成什么产品，不决定改稿深度。',
          customHint: '如果目标不准确，可以补一句你真正想要的产品，例如“只想做小说润色稿”或“只要作品分析报告”。',
          options: [
            { value: '多人演播有声书', desc: '最终交付多人演播台本、角色音表和质检报告。', source: 'recommended' },
            { value: '广播剧样章', desc: '最终交付更强场景化的广播剧试作方案。', source: 'preset' },
            { value: '小说润色稿', desc: '最终交付保留小说形态的润色文本。', source: 'preset' },
            { value: '作品分析报告', desc: '最终只交付问题清单和修改建议，不进入改稿。', source: 'preset' },
          ],
        },
        {
          id: 'scope',
          label: '处理范围',
          value: rangeDesc,
          desc: '先跑样章范围，避免第一次任务过大。',
          customHint: '可以写具体章节、段落或页码，例如“第1章前半段”或“从雨夜开场到第一次对话”。',
          options: [
            { value: rangeDesc, desc: '适合样章试跑，能快速验证流程和效果。', source: 'recommended' },
            { value: `${rangeDesc}前半段`, desc: '更小范围，适合先看演播标注样式。', source: 'preset' },
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

export async function runMockInitialAnalysis(context?: MockAnalysisContext): Promise<AnalysisReport> {
  await wait(900);

  const rangeLabel = context?.rangeLabel || '第 1 章';
  const workGoal = context?.workGoal || '多人演播有声书';
  const isDramaGoal = workGoal.includes('广播剧');
  const isPolishGoal = workGoal.includes('润色');
  const isAnalysisGoal = workGoal.includes('分析');
  const chapters = context?.chapters?.length ? context.chapters : [
    {
      title: '第 1 章',
      preview: '周佳宁推门进去的时候，屋里还残留着潮湿的木头气味。她继续往后翻，年份一点点往前推。',
      charCount: 3200,
    },
  ];
  const totalChars = context?.totalChars || chapters.reduce((sum, chapter) => sum + chapter.charCount, 0);
  const isMultiChapter = (context?.chapterCount || chapters.length) > 1;
  const firstChapter = chapters[0];
  const secondChapter = chapters[1] || chapters[0];
  const lastChapter = chapters[chapters.length - 1];
  const goalSummary = isDramaGoal
    ? '适合先做广播剧样章可行性分析，重点判断场景拆分、对白增强和音效成本'
    : isPolishGoal
      ? '适合先做小说润色诊断，重点判断语言顺滑度、节奏和信息顺序'
      : isAnalysisGoal
        ? '适合先做作品分析报告，重点输出问题清单和后续建议'
        : '适合做多人演播方向试跑，重点判断旁白听感、对白可演性和角色音区分';

  return {
    agentName: '业务分析 Agent',
    summary: `${workGoal} · ${rangeLabel}：${goalSummary}。当前约 ${totalChars.toLocaleString('zh-CN')} 字，不建议直接进入整段重改。`,
    diagnosis: [
      {
        title: isDramaGoal ? '场景边界需要拆清' : isPolishGoal ? '语言密度需要梳理' : '旁白书面感偏重',
        detail: isDramaGoal
          ? `${rangeLabel}中叙述、动作和对白混在一起，需要先拆出可演场景和不可直接对白化的段落。`
          : `${rangeLabel}中部分叙述句信息密度较高，直接朗读或润色时容易显得硬，需要转成更顺的表达。`,
        severity: '中',
      },
      {
        title: isDramaGoal ? '对白可演性需要确认' : '对白归属需要确认',
        detail: isDramaGoal
          ? '部分句子不是天然对白，需要判断能否改成角色对话，还是保留旁白、文件声或内心声。'
          : '部分台词或文件记录类内容可能不是现场对白，需要标注为回忆、文件声或待定角色音。',
        severity: '高',
      },
      {
        title: isDramaGoal ? '音效和转场成本待估' : isMultiChapter ? '章节衔接可强化' : '场景衔接可强化',
        detail: isDramaGoal
          ? '如果进入广播剧方向，需要提前判断哪些场景需要环境声、转场音效或更强戏剧化处理。'
          : isMultiChapter
            ? '所选范围跨越多个章节，适合补充章间过渡、回顾提示和声场变化。'
            : '章节内存在调查、翻阅资料和情绪转折，适合补充停顿、声场或 BGM 进入点。',
        severity: '轻',
      },
    ],
    evidence: [
      {
        location: `${firstChapter.title} · 预览片段`,
        issue: '旁白信息密度偏高',
        quote: pickPreviewQuote(firstChapter.preview, '当前章节预览为空，需要先回到素材库刷新章节预览。'),
      },
      {
        location: `${secondChapter.title} · 对白/叙述检查`,
        issue: '声音主体不明确',
        quote: pickPreviewQuote(secondChapter.preview, '当前片段需要进一步抽取对白或文件声主体。'),
      },
      {
        location: `${lastChapter.title} · ${isMultiChapter ? '章间衔接' : '调查推进段'}`,
        issue: isMultiChapter ? '跨章节转场缺少听觉提示' : '转场缺少听觉提示',
        quote: pickPreviewQuote(lastChapter.preview, '所选范围需要补充转场、停顿或声场提示。'),
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
        recommended: !isDramaGoal && !isPolishGoal && !isAnalysisGoal,
      },
      {
        id: 'drama_feasibility',
        title: '广播剧可行性拆解',
        desc: '不直接改成广播剧，先判断场景重构、对白增强和音效成本。',
        editDepth: '分析优先',
        impact: '会进入场景拆分和广播剧可行性分析。',
        recommended: isDramaGoal,
      },
    ],
    recommendedStrategyId: isDramaGoal ? 'drama_feasibility' : isAnalysisGoal ? 'analysis_only' : 'audiobook_sample',
    executionImpact: {
      nextAgents: isDramaGoal
        ? ['场景拆分 Agent', '对白增强 Agent', '音效成本评估 Agent']
        : ['文本改编 Agent', '角色音标注 Agent', '演播设计 Agent'],
      outputs: isDramaGoal
        ? ['广播剧场景拆分表', '对白增强建议', '音效成本评估']
        : ['有声书样章文本', '角色音标注表', '演播设计提示'],
      requiresReview: true,
    },
  };
}
