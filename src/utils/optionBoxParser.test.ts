/**
 * optionBoxParser 单元测试
 * 
 * 每条测试对应一个真实 bug。修代码前跑一遍，改完再跑一遍。
 * 
 * 运行: npx vitest run
 * 监听: npx vitest
 */
import { describe, it, expect } from 'vitest';
import { parseOptionBox, clearParseCache } from './optionBoxParser';
import { blockRouter } from '../core/blockRouter';
import { blocksToSegments } from '../core/blockAdapter';

// ============================================================
// 1. 成对标签 [pills]...[/pills] — 基本功能
// ============================================================
describe('成对标签 [pills]...[/pills]', () => {
  it('正确解析 ■ 选项为胶囊按钮', () => {
    const input = `少爷，想先做哪个？

[pills]
■ 修复 Bug
■ 写文档
■ 录视频
[/pills]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();
    expect(result.segments!.length).toBeGreaterThanOrEqual(2);

    const pillsSeg = result.segments!.find(s => s.type === 'pills');
    expect(pillsSeg).toBeDefined();
    expect(pillsSeg!.options).toHaveLength(3);
    expect(pillsSeg!.options[0].label).toBe('修复 Bug');

    const textSeg = result.segments!.find(s => s.type === 'text');
    expect(textSeg).toBeDefined();
    expect(textSeg!.content).toContain('想先做哪个');
  });

  it('保留标签外的正文内容（前+后）', () => {
    const input = `前面的正文

[pills]
■ 选项A
■ 选项B
[/pills]

后面的正文`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();

    const textSegs = result.segments!.filter(s => s.type === 'text');
    const allText = textSegs.map(s => s.content).join('\n');
    expect(allText).toContain('前面的正文');
    expect(allText).toContain('后面的正文');
  });

  it('标签文字 [pills]/[/pills] 不出现在任何 segment 中', () => {
    const input = `正文

[pills]
■ 按钮1
■ 按钮2
[/pills]

尾部正文`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();

    for (const seg of result.segments!) {
      if (seg.type === 'text') {
        expect(seg.content).not.toContain('[pills]');
        expect(seg.content).not.toContain('[/pills]');
      }
    }
  });
});

// ============================================================
// 2. 未闭合标签 — Bug A（截图1：[pills] 没有 [/pills]）
// ============================================================
describe('未闭合标签处理', () => {
  it('[pills] 没有 [/pills] 时，自动补全并渲染为可点 pills 段', () => {
    const input = `少爷，选一个：

[pills]
■ 方案A
■ 方案B`;

    const result = parseOptionBox(input);
    // 标签文字应被剥离（不原样显示）
    expect(result.text).not.toContain('[pills]');
    // 未闭合 [pills] 现在被自动补全 → 解析为 pills 段，选项可点
    const pills = (result.segments || []).find((s) => s.type === 'pills');
    expect(pills).toBeDefined();
    expect(pills!.options.length).toBeGreaterThanOrEqual(2);
    // 正文应保留
    expect(result.text).toContain('选一个');
  });

  it('[pills] 无闭合且含【粗体 - 说明】格式选项（线上真实回归）', () => {
    // 复现：AMY 记忆管理回复，[pills] 无 [/pills]，选项为「■ **粗体** - 说明」
    const input = `那现在这个情况，有几个方向可以处理，少爷看哪个合适：

[pills]
■ **我来帮你筛选** - 你说关键词或条件，我搜出来看哪些可以清理
■ **你手动清向量库** - 我告诉你路径，你自己去删
■ **先不管** - 900条对性能暂时没影响，等多了再说`;

    const result = parseOptionBox(input);
    const pills = (result.segments || []).find((s) => s.type === 'pills');
    expect(pills).toBeDefined();
    expect(pills!.options.length).toBe(3);
    expect(result.text).toContain('少爷看哪个合适');
    expect(result.text).not.toContain('[pills]');
  });

  it('孤立的 [pills] 在成对标签之后，不显示为文本', () => {
    const input = `[pills]
■ 按钮1
■ 按钮2
[/pills]

后面正文

[pills]
■ 孤立按钮`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();

    // 所有 text segment 里不应有 [pills] 文字
    for (const seg of result.segments!) {
      if (seg.type === 'text') {
        expect(seg.content).not.toContain('[pills]');
      }
    }
  });
});

// ============================================================
// 3. pills 内无 ■ 符号 — Bug B（截图2：每行变按钮）
// ============================================================
describe('pills 内无符号选项', () => {
  it('[pills] 里只有普通文字，应当作文本渲染，不做按钮', () => {
    const input = `[pills]
这是一段普通的分析文字
包含多行内容
不应该变成按钮
[/pills]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();

    const pillsSeg = result.segments!.find(s => s.type === 'pills');
    // 没有 ■ → 不应有 pills segment
    expect(pillsSeg).toBeUndefined();

    // 应该有 text segment 包含原文
    const textSeg = result.segments!.find(s => s.type === 'text');
    expect(textSeg).toBeDefined();
    expect(textSeg!.content).toContain('普通的分析文字');
  });

  it('[pills] 里混合 ■ 和普通文字，只提取 ■ 行做按钮', () => {
    const input = `[pills]
下面是选项：
■ 选A
■ 选B
[/pills]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();

    const pillsSeg = result.segments!.find(s => s.type === 'pills');
    expect(pillsSeg).toBeDefined();
    expect(pillsSeg!.options).toHaveLength(2);
  });
});

// ============================================================
// 4. 代码块内容不被解析
// ============================================================
describe('代码块保护', () => {
  it('代码块内的 ■ 符号不触发选项检测', () => {
    const input = `示例代码：

\`\`\`
■ 这不是选项
■ 这也不是
\`\`\`

正文继续`;

    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
  });

  it('代码块内的 [pills] 标签不被解析', () => {
    const input = `示例：

\`\`\`
[pills]
■ 代码里的
[/pills]
\`\`\`

正常正文`;

    const result = parseOptionBox(input);
    // 不应产生 pills segment
    if (result.segments) {
      const pillsSeg = result.segments.find(s => s.type === 'pills');
      expect(pillsSeg).toBeUndefined();
    }
  });
});

// ============================================================
// 5. 自动检测 ■ 选项（无标签时的向后兼容）
// ============================================================
describe('自动检测 ■ 选项（无标签）', () => {
  it('正文 + ■ 选项，自动检测为胶囊按钮', () => {
    const input = `少爷，选一个方向：

■ 语音输入
■ 插件系统
■ 主题定制`;

    const result = parseOptionBox(input);
    expect(result.options.length).toBeGreaterThanOrEqual(3);
    expect(result.forcePills).toBe(true);
    expect(result.text).toContain('选一个方向');
  });

  it('● ◆ ○ 等符号也触发胶囊检测', () => {
    const input = `● 选项1\n● 选项2\n● 选项3`;
    const result = parseOptionBox(input);
    expect(result.options.length).toBeGreaterThanOrEqual(3);
  });

  it('说明符号语法时不因裸符号列表误触发胶囊', () => {
    const input = `符号检测支持这些示例：

■ 方块表示一种候选行
● 圆点表示另一种候选行
◆ 菱形也是候选符号

以上只是协议说明，不是在让用户选择。`;

    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
    expect(result.segments).toBeUndefined();
    expect(result.text).toContain('■ 方块表示一种候选行');
  });
});

// ============================================================
// 6. [question] 标签
// ============================================================
describe('[question] 标签', () => {
  it('成对 [question] 标签解析为问题卡片', () => {
    const input = `想想这几个问题：

[question]
1. 你更看重速度还是稳定性？
2. 预算有上限吗？
3. 半年后会怎样？
[/question]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();

    const qSeg = result.segments!.find(s => s.type === 'question');
    expect(qSeg).toBeDefined();
    expect(qSeg!.options.length).toBeGreaterThanOrEqual(2);
  });

  it('[question] 标签内带可选空格的变体能正确解析', () => {
    const input = `先思考：

[ question ]
1. 你怎么看？
2. 有什么顾虑？
[ / question ]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();
    const qSeg = result.segments!.find(s => s.type === 'question');
    expect(qSeg).toBeDefined();
    expect(qSeg!.options.length).toBeGreaterThanOrEqual(2);
  });

  it('内容中的 // 注释不受标签剥离影响', () => {
    const input = `代码示例：

[question]
1. 这段 // 注释会被保留吗？
2. 另一个问题？
[/question]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();
    const qSeg = result.segments!.find(s => s.type === 'question');
    expect(qSeg).toBeDefined();
    expect(qSeg!.options.some(o => o.label.includes('//'))).toBe(true);
  });
});

// ============================================================
// 7. [checkbox] 标签
// ============================================================
describe('[checkbox] 标签', () => {
  it('成对 [checkbox] 标签解析为复选框', () => {
    const input = `今天想推进哪些？

[checkbox]
- [ ] 修复 Bug
- [ ] 写文档
- [ ] 录视频
[/checkbox]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();

    const cbSeg = result.segments!.find(s => s.type === 'checkbox');
    expect(cbSeg).toBeDefined();
    expect(cbSeg!.options.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// 8. 混合标签（一条消息多种交互）
// ============================================================
describe('混合标签', () => {
  it('[question] + [pills] 在同一消息中各自渲染', () => {
    const input = `先想想：

[question]
1. 你怎么看？
2. 有什么顾虑？
[/question]

或者直接选：

[pills]
■ 方案A
■ 方案B
[/pills]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();

    const qSeg = result.segments!.find(s => s.type === 'question');
    const pSeg = result.segments!.find(s => s.type === 'pills');
    expect(qSeg).toBeDefined();
    expect(pSeg).toBeDefined();
  });
});

// ============================================================
// 9. 边界情况
// ============================================================
describe('边界情况', () => {
  it('空字符串不崩溃', () => {
    const result = parseOptionBox('');
    expect(result.text).toBe('');
    expect(result.options).toHaveLength(0);
  });

  it('纯文本无交互标记 → 原样返回', () => {
    const input = '少爷好！今天天气不错 😊';
    const result = parseOptionBox(input);
    expect(result.text).toContain('少爷好');
    expect(result.options).toHaveLength(0);
    expect(result.segments).toBeUndefined();
  });

  it('[RENDER:none] 禁用所有交互检测', () => {
    const input = `■ 这不是选项\n■ 这也不是\n[RENDER:none]`;
    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
  });

  it('Markdown 表格不触发选项检测', () => {
    const input = `| 方案 | 优点 |
|------|------|
| A    | 快   |
| B    | 稳   |`;

    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
  });

  it('表格前后有空行时能正确识别，不触发选项检测', () => {
    const input = `下面是方案对比：

| 方案 | 优点 | 缺点 |
|------|------|------|
| A    | 快   | 贵   |
| B    | 稳   | 慢   |

请选择适合的方案。`;

    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
    expect(result.text).toContain('| 方案 | 优点 | 缺点 |');
  });

  it('代码块内的 | 符号不触发表格/选项检测', () => {
    const input = `示例数据：

\`\`\`
| col1 | col2 |
|------|------|
| a    | b    |
\`\`\`

[pills]
■ 选项A
■ 选项B
[/pills]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();
    const pillsSeg = result.segments!.find(s => s.type === 'pills');
    expect(pillsSeg).toBeDefined();
    expect(pillsSeg!.options).toHaveLength(2);
    const textSeg = result.segments!.find(s => s.type === 'text');
    expect(textSeg?.content).toContain('```');
    expect(textSeg?.content).toContain('| col1 | col2 |');
  });

  it('普通 Markdown "-" 列表保持为正文，不自动渲染成交互组件', () => {
    const input = `问题点：

- AI 输出内容里用 \`-\` 开头写注意事项
- 前端 Markdown 解析器把它当成选项组件
- 代码块标记也可能被一起影响`;

    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
    expect(result.segments).toBeUndefined();
    expect(result.text).toContain('- AI 输出内容里用');
    expect(result.text).toContain('- 前端 Markdown 解析器把它当成选项组件');
  });

  it('经过 blockRouter/blocksToSegments 桥接后，代码块内的 "-" 列表仍不触发选项检测', () => {
    const raw = `示例代码：

\`\`\`md
- 注意 1
- 注意 2
- 注意 3
\`\`\`

正文继续`;

    const bridged = blocksToSegments(blockRouter(raw)).map((s) => s.content).join('');
    const result = parseOptionBox(bridged);

    expect(result.options).toHaveLength(0);
    expect(result.text).toContain('```md');
    expect(result.text).toContain('- 注意 1');
    expect(result.text).toContain('正文继续');
  });

  it('仅因为前文提到“任务/清单”字样，不应把后续 checkbox 文本段误判成 TaskList', () => {
    const input = `这里先解释一下任务背景，不是在声明任务清单。

[text]
[ ] 先看日志
[ ] 再看渲染链
[/text]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();
    const checkboxSeg = result.segments!.find((s) => s.type === 'checkbox');
    const taskSeg = result.segments!.find((s) => s.type === 'tasklist');
    expect(checkboxSeg).toBeDefined();
    expect(taskSeg).toBeUndefined();
  });

  it('说明 Markdown checkbox 语法时不因裸 checkbox 误触发交互', () => {
    const input = `Markdown checkbox 的语法示例：

- [ ] 未完成事项
- [x] 已完成事项

这些只是文档示例，不是用户待选项。`;

    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
    expect(result.segments).toBeUndefined();
    expect(result.text).toContain('- [ ] 未完成事项');
  });

  it('Google 风格的自然任务清单标题 + 加粗 checkbox 应渲染为 TaskList', () => {
    const input = `接下来你需要执行的任务清单

- [ ] **任务 1**：提供当前 Bug 的具体现象。
- [ ] **任务 2**：确认复现步骤。
- [ ] **任务 3**：补充期望行为。`;

    const result = parseOptionBox(input);

    expect(result.isTaskList).toBe(true);
    expect(result.options.map((o) => o.label)).toEqual([
      '任务 1：提供当前 Bug 的具体现象。',
      '任务 2：确认复现步骤。',
      '任务 3：补充期望行为。',
    ]);
  });

  it('TaskList 与 pills 混排时应分段渲染且互不干扰', () => {
    const input = `接下来你需要执行的任务清单

- [ ] **任务 1**：提供当前 Bug 的具体现象。
- [ ] **任务 2**：确认复现步骤。
- [ ] **任务 3**：补充期望行为。

是否需要我提供相关的代码模板？

[pills]
■ 需要，提供代码模板
■ 暂不需要，直接修 Bug
[/pills]`;

    const result = parseOptionBox(input);

    const taskSeg = result.segments?.find((s) => s.type === 'tasklist');
    const pillsSeg = result.segments?.find((s) => s.type === 'pills');
    expect(taskSeg).toBeDefined();
    expect(taskSeg?.options).toHaveLength(3);
    expect(pillsSeg).toBeDefined();
    expect(pillsSeg?.options.map((o) => o.label)).toEqual([
      '需要，提供代码模板',
      '暂不需要，直接修 Bug',
    ]);
  });

  it('普通编号步骤说明保持为正文，不自动渲染成交互组件', () => {
    const input = `排查步骤：

1. 打开日志面板
2. 查看网络请求
3. 对比渲染前后的结构`;

    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
    expect(result.segments).toBeUndefined();
    expect(result.text).toContain('1. 打开日志面板');
    expect(result.text).toContain('2. 查看网络请求');
  });

  it('带明确选择提示的编号列表仍可自动渲染为交互组件', () => {
    const input = `你想先做哪个？

1. 修复渲染 BUG
2. 检查消息解析链
3. 补回归测试`;

    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(3);
    expect(result.text).toContain('<!--OPTIONS_HERE-->');
  });

  it('表格内容（中文、英文、emoji）在 text segment 中保留，供 Markdown 渲染', () => {
    const input = `## 方案对比

| 优先级 | 操作 | 文件 |
| --- | --- | --- |
| 🔴 P0 | 改核心规则 | AGENTS.md |
| 🟡 P1 | 细化边界 | OCT_PROTOCOL.md |

[pills]
■ 先改 P0 的两条核心规则
■ 直接用 DeepSeek 的方案
[/pills]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();
    const textSegs = result.segments!.filter(s => s.type === 'text');
    const allText = textSegs.map(s => s.content).join('\n');
    expect(allText).toContain('| 优先级 | 操作 | 文件 |');
    expect(allText).toContain('🔴 P0');
    expect(allText).toContain('AGENTS.md');
    expect(allText).toContain('方案对比');
    const pillsSeg = result.segments!.find(s => s.type === 'pills');
    expect(pillsSeg).toBeDefined();
    expect(pillsSeg!.options).toHaveLength(2);
  });
});

// ============================================================
// 长内容 + 表格 + 交互标签 — 修复缓存碰撞导致的不渲染
// ============================================================
describe('长内容 + 表格 + 交互标签', () => {
  it('长消息 + 表格 + [pills] 标签，交互元素正确渲染', () => {
    const longPrefix = '根据您的问题，我整理了以下分析：\n\n'.repeat(5);
    const input = longPrefix + `## 方案对比

| 优先级 | 操作 | 文件 |
| --- | --- | --- |
| P0 | 改核心规则 | AGENTS.md |
| P1 | 细化边界 | OCT_PROTOCOL.md |

[pills]
■ 先改 P0 的两条核心规则
■ 直接用 DeepSeek 的方案
[/pills]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();
    const pillsSeg = result.segments!.find(s => s.type === 'pills');
    expect(pillsSeg).toBeDefined();
    expect(pillsSeg!.options).toHaveLength(2);
  });

  it('长消息 + 表格 + 无标签的 ■ 选项，自动检测仍生效', () => {
    const longPrefix = '根据您的问题，我整理了以下内容：\n\n'.repeat(8);
    const input = longPrefix + `| 方案 | 优点 |
|------|------|
| A    | 快   |
| B    | 稳   |

请选择：
■ 方案 A
■ 方案 B`;

    const result = parseOptionBox(input);
    expect(result.options.length).toBeGreaterThanOrEqual(2);
    expect(result.options.some(o => o.label.includes('方案 A'))).toBe(true);
  });

  it('缓存键不碰撞：两条长消息前缀相同、结尾不同，各自解析正确', () => {
    const sharedPrefix = '根据您的问题：\n\n'.repeat(10);
    const msgWithoutPills = sharedPrefix + '这是纯文本回复，没有选项。';
    const msgWithPills = sharedPrefix + `[pills]
■ 选项1
■ 选项2
[/pills]`;

    const r1 = parseOptionBox(msgWithoutPills);
    const r2 = parseOptionBox(msgWithPills);

    expect(r1.options?.length ?? 0).toBe(0);
    expect(r1.segments?.some(s => s.type === 'pills') ?? false).toBe(false);

    expect(r2.segments).toBeDefined();
    const pillsSeg = r2.segments!.find(s => s.type === 'pills');
    expect(pillsSeg).toBeDefined();
    expect(pillsSeg!.options).toHaveLength(2);
  });
});

// ============================================================
// 9b. 额外边界用例（重构补充：非法输入、嵌套/未知标签、显式 RENDER hint、遗留协议）
// ============================================================
describe('额外边界用例', () => {
  it('null/undefined 输入不崩溃，返回空文本空选项', () => {
    expect(parseOptionBox(null as unknown as string)).toEqual({ text: '', options: [] });
    expect(parseOptionBox(undefined as unknown as string)).toEqual({ text: '', options: [] });
  });

  it('仅空白字符的输入不崩溃，不产生选项', () => {
    const result = parseOptionBox('   \n\n\t  ');
    expect(result.options).toHaveLength(0);
  });

  it('嵌套同名标签：内层标签原样保留在 inner 内容中（不递归解析）', () => {
    const input = `[pills]
■ 外层选项A
[pills]
■ 内层不应被当成独立标签
[/pills]
[/pills]`;

    const result = parseOptionBox(input);
    expect(result.segments).toBeDefined();
    const pillsSegs = result.segments!.filter((s) => s.type === 'pills');
    // 非贪婪匹配下，第一对 [pills]...[/pills] 在最近的 [/pills] 处闭合
    expect(pillsSegs.length).toBeGreaterThanOrEqual(1);
  });

  it('未知标签 [foo]...[/foo] 不被当作成对标签解析，原样保留为文本', () => {
    const input = `正文前

[foo]
■ 不应被解析
[/foo]

正文后`;
    const result = parseOptionBox(input);
    // 没有合法成对标签，应走自动检测路径；[foo] 不在已知标签列表中，原样保留
    expect(result.text).toContain('[foo]');
    expect(result.text).toContain('正文前');
    expect(result.text).toContain('正文后');
  });

  it('[RENDER:checkbox] 显式 hint 命中复选框解析', () => {
    const input = `今天做哪些：
- [ ] 任务A
- [ ] 任务B
[RENDER:checkbox]`;
    const result = parseOptionBox(input);
    expect(result.options.length).toBeGreaterThanOrEqual(2);
    expect(result.forcePills).toBe(false);
    expect(result.isTaskList).toBeFalsy();
  });

  it('[RENDER:tasklist] 显式 hint 命中任务清单解析', () => {
    const input = `- [ ] 任务A
- [ ] 任务B
[RENDER:tasklist]`;
    const result = parseOptionBox(input);
    expect(result.options.length).toBeGreaterThanOrEqual(2);
    expect(result.isTaskList).toBe(true);
  });

  it('[RENDER:question] 显式 hint 但没有合格问题选项时，原样返回正文', () => {
    const input = `随便说点什么。
[RENDER:question]`;
    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
  });

  it('[RENDER:pill] 显式 hint 但没有符号选项时，原样返回正文', () => {
    const input = `这里没有符号选项。
[RENDER:pill]`;
    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(0);
  });

  it('遗留协议 [选项框开始]...[选项框结束] 仍兼容解析', () => {
    const input = `前面的话
[选项框开始]
[选项1: 方案A | valueA]
[选项2: 方案B | valueB]
[选项框结束]
后面的话`;
    const result = parseOptionBox(input);
    expect(result.options).toHaveLength(2);
    expect(result.options[0]).toEqual({ num: 1, label: '方案A', value: 'valueA' });
    expect(result.text).toContain('前面的话');
    expect(result.text).toContain('后面的话');
  });

  it('畸形遗留协议（缺少结束标记）不触发选项解析，原样走自动检测', () => {
    const input = `[选项框开始]
[选项1: 方案A | valueA]`;
    const result = parseOptionBox(input);
    // 没有 [选项框结束]，不会进入遗留协议分支
    expect(result.text).toContain('[选项框开始]');
  });

  it('连续调用 parseOptionBox 对同一输入结果一致（缓存命中不影响正确性）', () => {
    const input = `选一个：\n\n■ A\n■ B`;
    const r1 = parseOptionBox(input);
    const r2 = parseOptionBox(input);
    expect(r2).toEqual(r1);
  });

  it('clearParseCache 清空后重新解析仍得到一致结果', () => {
    const input = `选一个：\n\n■ X\n■ Y`;
    const before = parseOptionBox(input);
    clearParseCache();
    const after = parseOptionBox(input);
    expect(after).toEqual(before);
  });
});

// ============================================================
// 10. [clarify_card] 标签剥离
// ============================================================
describe('[clarify_card] 标签剥离', () => {
  it('标签外的 clarify_card 应被完全剥离', () => {
    const input = `好的我帮你写。

[clarify_card]
{"title":"测试","fields":[{"id":"x","label":"x","type":"single","options":["a","b"]}]}
[/clarify_card]

继续正文。`;
    const result = parseOptionBox(input);
    expect(result.text).not.toContain('clarify_card');
    expect(result.text).toContain('好的我帮你写');
    expect(result.text).toContain('继续正文');
  });

  it('代码块内的 clarify_card 示例应被保留', () => {
    const input = `下面是用法示例：

\`\`\`
[clarify_card]
{"title":"示例","fields":[]}
[/clarify_card]
\`\`\`

看懂了吗？`;
    const result = parseOptionBox(input);
    expect(result.text).toContain('[clarify_card]');
    expect(result.text).toContain('"title":"示例"');
  });

  it('孤立的 [clarify_card] 或 [/clarify_card] 单标签应被清理', () => {
    const input = `正文前 [clarify_card] 没有闭合也不能原样显示`;
    const result = parseOptionBox(input);
    expect(result.text).not.toContain('[clarify_card]');
    expect(result.text).toContain('正文前');
  });
});
