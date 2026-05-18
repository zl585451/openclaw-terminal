import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  normalizeAssistantMarkdown,
  normalizeFenceLanguage,
  normalizeTableSpacing,
} = require('../../oct-gateway/services/markdownNormalizer');

describe('gateway markdownNormalizer', () => {
  it('closes an unclosed fenced code block', () => {
    const input = [
      '运行这个命令：',
      '',
      '```powershell',
      'git status',
    ].join('\n');

    expect(normalizeAssistantMarkdown(input)).toBe([
      '运行这个命令：',
      '',
      '```powershell',
      'git status',
      '```',
    ].join('\n'));
  });

  it('normalizes vague code fence language from command content', () => {
    const input = [
      '```code',
      'git status',
      '```',
    ].join('\n');

    expect(normalizeAssistantMarkdown(input)).toBe([
      '```bash',
      'git status',
      '```',
    ].join('\n'));
  });

  it('splits explanation text out of a command code block', () => {
    const input = [
      '```code',
      '2. **查看当前状态：**',
      'git status',
      '```',
    ].join('\n');

    expect(normalizeAssistantMarkdown(input)).toBe([
      '查看当前状态：',
      '',
      '```bash',
      'git status',
      '```',
    ].join('\n'));
  });

  it('keeps normal source code content unchanged except language alias', () => {
    const input = [
      '```javascript',
      'function demo() {',
      "  console.log('ok');",
      '}',
      '```',
    ].join('\n');

    expect(normalizeAssistantMarkdown(input)).toBe([
      '```js',
      'function demo() {',
      "  console.log('ok');",
      '}',
      '```',
    ].join('\n'));
  });

  it('adds blank lines around markdown tables outside fences', () => {
    const input = [
      '结果如下：',
      '| 项目 | 状态 |',
      '|---|---|',
      '| Gateway | 已恢复 |',
      '[pills]',
      '■ 继续',
      '[/pills]',
    ].join('\n');

    expect(normalizeTableSpacing(input)).toBe([
      '结果如下：',
      '',
      '| 项目 | 状态 |',
      '|---|---|',
      '| Gateway | 已恢复 |',
      '',
      '[pills]',
      '■ 继续',
      '[/pills]',
    ].join('\n'));
  });

  it('does not modify table-like text inside code fences', () => {
    const input = [
      '```text',
      '| keep | this |',
      '|---|---|',
      '```',
    ].join('\n');

    expect(normalizeAssistantMarkdown(input)).toBe(input);
  });

  it('infers powershell for PowerShell commands', () => {
    expect(normalizeFenceLanguage('code', ['Get-ChildItem docs'])).toBe('powershell');
  });
});
