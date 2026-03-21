/**
 * optionBoxParser 单元测试
 * 
 * 每条测试对应一个真实 bug。修代码前跑一遍，改完再跑一遍。
 * 
 * 运行: npx vitest run
 * 监听: npx vitest
 */
import { describe, it, expect } from 'vitest';
import { parseOptionBox } from './optionBoxParser';

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
  it('[pills] 没有 [/pills] 时，剥离标签文字，■ 选项仍渲染', () => {
    const input = `少爷，选一个：

[pills]
■ 方案A
■ 方案B`;

    const result = parseOptionBox(input);
    // 标签文字应被剥离
    expect(result.text).not.toContain('[pills]');
    // ■ 选项应被检测到
    expect(result.options.length).toBeGreaterThanOrEqual(2);
    // 正文应保留
    expect(result.text).toContain('选一个');
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
