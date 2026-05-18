import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseOptionBox } from './optionBoxParser';
import { preprocessMarkdown, stabilizeStreamingMarkdown } from './markdownPreprocess';

const require = createRequire(import.meta.url);

const {
  normalizeAssistantMarkdown,
}: {
  normalizeAssistantMarkdown: (text: string) => string;
} = require('../../oct-gateway/services/markdownNormalizer');

describe('Render Protocol v2 regressions', () => {
  it('keeps Chinese explanation outside command fences', () => {
    const input = [
      '```code',
      '1. 查看当前状态：',
      'git status',
      '```',
    ].join('\n');

    const output = normalizeAssistantMarkdown(input);

    expect(output).toContain('查看当前状态：');
    expect(output).toContain('```bash\ngit status\n```');
    expect(output).not.toContain('```bash\n1. 查看当前状态：');
  });

  it('stabilizes a mixed table, code block, and pills response', () => {
    const input = [
      '下面是检查结果：',
      '| 项目 | 状态 |',
      '| --- | --- |',
      '| Gateway | 正常 |',
      '```code',
      'git status',
      '```',
      '[pills]',
      '■ 继续修复',
      '■ 先跑测试',
      '[/pills]',
    ].join('\n');

    const normalized = normalizeAssistantMarkdown(input);
    const renderedText = preprocessMarkdown(normalized);
    const parsed = parseOptionBox(renderedText);

    expect(renderedText).toContain('\n\n| 项目 | 状态 |');
    expect(renderedText).toContain('```bash\ngit status\n```');
    const pillsSegment = parsed.segments?.find((segment) => segment.type === 'pills');
    expect(pillsSegment).toBeDefined();
    expect(pillsSegment?.options.map((option) => option.label)).toEqual(['继续修复', '先跑测试']);
  });

  it('keeps an unfinished streaming fence as one stable block', () => {
    const streaming = [
      '我会先检查 Git：',
      '',
      '```bash',
      'git status',
    ].join('\n');

    expect(stabilizeStreamingMarkdown(streaming)).toBe([
      '我会先检查 Git：',
      '',
      '```bash',
      'git status',
      '```',
    ].join('\n'));
  });

  it('normalizes model output that uses vague code fences', () => {
    const input = [
      '运行这个：',
      '',
      '```code',
      'Get-ChildItem docs',
      '```',
    ].join('\n');

    expect(normalizeAssistantMarkdown(input)).toContain('```powershell\nGet-ChildItem docs\n```');
  });
});
