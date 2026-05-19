import type { RenderBlock } from '../chatTypes';

export type RenderProtocolV3GoldenCase = {
  id: string;
  title: string;
  prompt: string;
  rawModelOutput: string;
  expectedBlockTypes: RenderBlock['type'][];
  expectedSegmentTypes: string[];
  expectedFailureLayer?: 'model_output' | 'gateway_normalizer' | 'frontend_renderer';
};

function renderBlocks(blocks: RenderBlock[]): string {
  return [
    '```render_blocks',
    JSON.stringify({ version: '3.0', blocks }, null, 2),
    '```',
  ].join('\n');
}

export const renderProtocolV3GoldenCases: RenderProtocolV3GoldenCase[] = [
  {
    id: 'mixed-components',
    title: '结构化组件混合：markdown + code + table + pills',
    prompt: [
      '请帮我分析一下当前 OCT 项目的渲染协议优化方案。',
      '要求：',
      '1. 先用一段文字简述协议 V2 的核心。',
      '2. 给出一段 TypeScript 代码示例，展示如何定义一个 RenderSegment 类型。',
      '3. 对比 PillOptionBox 和 QuestionCards 的三个维度差异，用 Markdown 表格呈现。',
      '4. 在回复最后，用 [pills] 标签提供三个选项：■ 深入代码实现、■ 查看测试用例、■ 暂时不需要。',
      '注意：严禁在代码块或表格中使用裸露的 ■ 符号，确保交互选项只出现在末尾的标签内。',
    ].join('\n'),
    rawModelOutput: renderBlocks([
      { type: 'markdown', content: 'Render Protocol v2 的核心是用稳定标签约束 Markdown、表格和交互选项的边界。' },
      {
        type: 'code',
        language: 'ts',
        content: [
          "type RenderSegment = {",
          "  type: 'text' | 'pills' | 'tasklist';",
          '  content: string;',
          '};',
        ].join('\n'),
      },
      {
        type: 'table',
        columns: ['维度', 'PillOptionBox', 'QuestionCards'],
        rows: [
          ['用途', '快速选择', '反思问题'],
          ['触发', '明确选项块', '问句集合'],
          ['交互', '点击后发送', '选择问题继续追问'],
        ],
      },
      {
        type: 'pills',
        prompt: '下一步看什么？',
        items: [
          { label: '深入代码实现' },
          { label: '查看测试用例' },
          { label: '暂时不需要' },
        ],
      },
    ]),
    expectedBlockTypes: ['markdown', 'code', 'table', 'pills'],
    expectedSegmentTypes: ['text', 'text', 'text', 'pills'],
  },
  {
    id: 'symbol-defense',
    title: '符号防误触：解释裸符号时不出现 pills',
    prompt: [
      '我想学习一下 OCT 的渲染协议。请详细解释一下：',
      '1. 什么是符号检测模式？请列出它支持的所有符号（如 ■, ●, ◆ 等）。',
      '2. 为什么在正文中直接写 "■ 选项" 会被误识别？',
      '3. 如何使用 [text] 标签来保护一段包含上述符号的内容不被误识别为按钮？',
      '请在回复中多次使用这些符号进行举例说明，但不要触发任何真正的交互按钮。',
    ].join('\n'),
    rawModelOutput: renderBlocks([
      {
        type: 'markdown',
        content: [
          '符号检测模式会把特定符号开头的独立选项行视为交互候选。',
          '',
          '安全写法示例：`■ 选项`、`● 选项`、`◆ 选项` 都应放在行内代码或代码块里解释。',
          '',
          '```text',
          '■ 这只是文档示例，不是按钮',
          '● 这也是文档示例，不是按钮',
          '◆ 仍然只是文档示例',
          '```',
        ].join('\n'),
      },
    ]),
    expectedBlockTypes: ['markdown'],
    expectedSegmentTypes: ['text'],
  },
  {
    id: 'clarify-card',
    title: 'clarify_card：生成合法 inquiry spec',
    prompt: [
      '我想发起一个全新的「周报自动化」子项目，但我现在思路很乱。',
      '请通过 [clarify_card] 询问器向我收集以下维度的信息：',
      '1. 目标平台（单选：钉钉、飞书、企业微信、自定义）。',
      '2. 自动化频率（多选：每日、每周、每月）。',
      '3. 核心功能描述（自由文本）。',
      '4. 是否需要接入 AI 自动润色（确认型选项）。',
      '要求：label 必须是完整的问句；严格遵循 JSON 格式；回复中除了标签外，只允许有一句简单的引导语。',
    ].join('\n'),
    rawModelOutput: renderBlocks([
      { type: 'markdown', content: '我先问几个关键问题，帮你把周报自动化方案收束清楚。' },
      {
        type: 'clarify_card',
        title: '周报自动化配置',
        fields: [
          { id: 'platform', label: '目标平台是哪一个？', type: 'single', options: ['钉钉', '飞书', '企业微信', '自定义'] },
          { id: 'frequency', label: '自动化频率需要哪些？', type: 'multi', options: ['每日', '每周', '每月'] },
          { id: 'core_feature', label: '核心功能描述是什么？', type: 'text', placeholder: '例如：自动汇总本周任务并发送给团队' },
          { id: 'ai_polish', label: '是否需要接入 AI 自动润色？', type: 'confirm', options: ['需要', '不需要'] },
        ],
      },
    ]),
    expectedBlockTypes: ['markdown', 'clarify_card'],
    expectedSegmentTypes: ['text'],
  },
  {
    id: 'tasklist-and-pills',
    title: '任务清单 vs 胶囊：同时出现 tasklist + pills',
    prompt: [
      '帮我制定一个修复 Bug 的流程，并列出我接下来需要执行的任务清单。',
      '同时，在清单下方，请问我是否需要你提供相关的代码模板，并给出两个胶囊选项。',
    ].join('\n'),
    rawModelOutput: renderBlocks([
      { type: 'markdown', content: '下面是一套安全的 Bug 修复流程。' },
      {
        type: 'tasklist',
        title: '接下来需要执行的任务清单',
        items: [
          { id: 'reproduce', label: '复现问题并记录输入条件' },
          { id: 'locate', label: '定位相关文件和调用链' },
          { id: 'fix', label: '实施最小修复' },
          { id: 'verify', label: '运行回归测试' },
        ],
      },
      {
        type: 'pills',
        prompt: '是否需要我提供代码模板？',
        items: [
          { label: '需要代码模板', value: '请提供相关代码模板' },
          { label: '暂不需要', value: '暂不需要代码模板' },
        ],
      },
    ]),
    expectedBlockTypes: ['markdown', 'tasklist', 'pills'],
    expectedSegmentTypes: ['text', 'tasklist', 'pills'],
  },
];
