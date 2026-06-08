/**
 * aiConnectionErrors：humanizeAiConnectionError 单元测试
 *
 * 运行: npx vitest run src/utils/aiConnectionErrors.test.ts
 */
import { describe, it, expect } from 'vitest';
import { humanizeAiConnectionError } from './aiConnectionErrors';

describe('humanizeAiConnectionError', () => {
  it('空或仅空白时返回固定兜底', () => {
    expect(humanizeAiConnectionError('')).toBe('连接测试失败，请稍后重试。');
    expect(humanizeAiConnectionError('  \t  ')).toBe('连接测试失败，请稍后重试。');
  });

  it('MiniMax：含 token plan / api key 提示且非 sk-cp- 时优先返回 Token Plan 说明', () => {
    expect(
      humanizeAiConnectionError('Please use Token Plan API Key', 'minimax'),
    ).toBe('MiniMax 需要 Token Plan API Key（以 sk-cp- 开头），普通按量 Key 不能用。');
    expect(
      humanizeAiConnectionError('invalid api key for minimax', 'minimax'),
    ).toBe('MiniMax 需要 Token Plan API Key（以 sk-cp- 开头），普通按量 Key 不能用。');
  });

  it('MiniMax：错误文案里已含 sk-cp- 时不走 Token Plan 专支', () => {
    const raw = 'sk-cp-xxx invalid token plan';
    expect(humanizeAiConnectionError(raw, 'minimax')).toBe(raw.slice(0, 200));
  });

  it('非 minimax 时即含 token plan 也不走 MiniMax 专支', () => {
    expect(humanizeAiConnectionError('Token Plan only', 'openai')).toBe('Token Plan only');
    const only401 = humanizeAiConnectionError('401', 'minimax');
    expect(only401).toBe(
      'API Key 无效或权限不足。MiniMax 需要 sk-cp- 前缀的 Token Plan Key。',
    );
  });

  it('401 / 403 / unauthorized / forbidden（大小写不敏感）', () => {
    expect(humanizeAiConnectionError('HTTP 401')).toBe(
      'API Key 无效或权限不足。MiniMax 需要 sk-cp- 前缀的 Token Plan Key。',
    );
    expect(humanizeAiConnectionError('status 403')).toBe(
      'API Key 无效或权限不足。MiniMax 需要 sk-cp- 前缀的 Token Plan Key。',
    );
    expect(humanizeAiConnectionError('Unauthorized')).toBe(
      'API Key 无效或权限不足。MiniMax 需要 sk-cp- 前缀的 Token Plan Key。',
    );
    expect(humanizeAiConnectionError('FORBIDDEN')).toBe(
      'API Key 无效或权限不足。MiniMax 需要 sk-cp- 前缀的 Token Plan Key。',
    );
  });

  it('timeout / timed out / abort', () => {
    expect(humanizeAiConnectionError('request Timeout')).toBe(
      '连接超时。如果你使用 Google 或 OpenAI，可能需要在高级设置里填写 HTTPS 代理地址。',
    );
    expect(humanizeAiConnectionError('Error: timed out')).toBe(
      '连接超时。如果你使用 Google 或 OpenAI，可能需要在高级设置里填写 HTTPS 代理地址。',
    );
    expect(humanizeAiConnectionError('fetch aborted')).toBe(
      '连接超时。如果你使用 Google 或 OpenAI，可能需要在高级设置里填写 HTTPS 代理地址。',
    );
  });

  it('404 且含 model 子串时返回模型不存在提示', () => {
    expect(humanizeAiConnectionError('404 model not found')).toBe(
      '模型不存在。请点击“换一个”尝试其他推荐模型。',
    );
  });

  it('仅 404 或仅 model 不满足组合条件时原样截断返回', () => {
    expect(humanizeAiConnectionError('404 not found')).toBe('404 not found');
    expect(humanizeAiConnectionError('unknown model error')).toBe('unknown model error');
  });

  it('默认分支：返回原文前 200 字', () => {
    const long = 'x'.repeat(250);
    expect(humanizeAiConnectionError(long)).toHaveLength(200);
    expect(humanizeAiConnectionError(long)).toBe('x'.repeat(200));
  });

  it('MiniMax 专支优先于 401 通用支（同条含 token plan 与 401）', () => {
    expect(humanizeAiConnectionError('401 token plan required', 'minimax')).toBe(
      'MiniMax 需要 Token Plan API Key（以 sk-cp- 开头），普通按量 Key 不能用。',
    );
  });
});
