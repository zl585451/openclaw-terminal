import { describe, expect, it } from 'vitest';
import { stabilizeStreamingMarkdown } from './markdownPreprocess';

describe('stabilizeStreamingMarkdown', () => {
  it('temporarily closes an unfinished fenced code block', () => {
    const input = [
      '检查当前状态：',
      '',
      '```bash',
      'git status',
    ].join('\n');

    expect(stabilizeStreamingMarkdown(input)).toBe([
      '检查当前状态：',
      '',
      '```bash',
      'git status',
      '```',
    ].join('\n'));
  });

  it('leaves already closed fenced code blocks unchanged', () => {
    const input = [
      '```powershell',
      'Get-ChildItem docs',
      '```',
      '',
      '继续说明。',
    ].join('\n');

    expect(stabilizeStreamingMarkdown(input)).toBe(input);
  });

  it('supports tilde fences used by some models', () => {
    const input = [
      '~~~json',
      '{"ok": true}',
    ].join('\n');

    expect(stabilizeStreamingMarkdown(input)).toBe([
      '~~~json',
      '{"ok": true}',
      '~~~',
    ].join('\n'));
  });
});
