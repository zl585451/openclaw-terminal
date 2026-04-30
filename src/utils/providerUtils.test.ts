/**
 * providerUtils 单元测试：inferProviderFromBaseUrl / detectProviderFromKey
 *
 * 运行: npx vitest run src/utils/providerUtils.test.ts
 */
import { describe, it, expect } from 'vitest';
import { inferProviderFromBaseUrl, detectProviderFromKey } from './providerUtils';

describe('inferProviderFromBaseUrl', () => {
  it('空字符串与仅空白时回退为 bailian-coding', () => {
    expect(inferProviderFromBaseUrl('')).toBe('bailian-coding');
    expect(inferProviderFromBaseUrl('   ')).toBe('bailian-coding');
  });

  it('大小写不敏感匹配子串', () => {
    expect(inferProviderFromBaseUrl('HTTPS://API.OPENAI.COM/v1')).toBe('openai');
    expect(inferProviderFromBaseUrl('https://GenerativeLanguage.Googleapis.Com/')).toBe('google');
  });

  it('coding.dashscope 优先于 dashscope（更具体子串在前）', () => {
    expect(inferProviderFromBaseUrl('https://coding.dashscope.aliyuncs.com')).toBe('bailian-coding');
    expect(inferProviderFromBaseUrl('https://dashscope.aliyuncs.com')).toBe('bailian');
  });

  it('按子串识别各 provider', () => {
    expect(inferProviderFromBaseUrl('https://api.deepseek.com')).toBe('deepseek');
    expect(inferProviderFromBaseUrl('https://api.minimaxi.com')).toBe('minimax');
    expect(inferProviderFromBaseUrl('https://api.siliconflow.cn')).toBe('siliconflow');
    expect(inferProviderFromBaseUrl('https://api.moonshot.cn')).toBe('moonshot');
    expect(inferProviderFromBaseUrl('http://127.0.0.1:3000/v1')).toBe('newapi');
    expect(inferProviderFromBaseUrl('https://newapi.example.com/v1')).toBe('newapi');
    expect(inferProviderFromBaseUrl('https://api.groq.com')).toBe('groq');
    expect(inferProviderFromBaseUrl('http://localhost:11434')).toBe('ollama');
  });

  it('未匹配任何已知子串时回退为 bailian-coding', () => {
    expect(inferProviderFromBaseUrl('https://example.com/v1')).toBe('bailian-coding');
  });
});

describe('detectProviderFromKey', () => {
  it('空或仅空白：null provider、low、空 Key', () => {
    expect(detectProviderFromKey('')).toEqual({
      providerId: null,
      confidence: 'low',
      reason: '空 Key',
    });
    expect(detectProviderFromKey('  \t  ')).toEqual({
      providerId: null,
      confidence: 'low',
      reason: '空 Key',
    });
  });

  it('高置信度：sk-sp- 百炼 Coding', () => {
    expect(detectProviderFromKey('sk-sp-abc')).toMatchObject({
      providerId: 'bailian-coding',
      confidence: 'high',
    });
  });

  it('高置信度：sk-cp- MiniMax', () => {
    expect(detectProviderFromKey('sk-cp-token')).toMatchObject({
      providerId: 'minimax',
      confidence: 'high',
    });
  });

  it('高置信度：gsk_ Groq', () => {
    expect(detectProviderFromKey('gsk_xxx')).toMatchObject({
      providerId: 'groq',
      confidence: 'high',
    });
  });

  it('高置信度：AQ. Vertex', () => {
    expect(detectProviderFromKey('AQ.something')).toMatchObject({
      providerId: 'google',
      confidence: 'high',
    });
  });

  it('高置信度：AIza + 至少 10 位后续字符', () => {
    const valid = 'AIza' + '0'.repeat(10);
    expect(detectProviderFromKey(valid)).toMatchObject({
      providerId: 'google',
      confidence: 'high',
    });
    const tooShort = 'AIza' + '0'.repeat(9);
    expect(detectProviderFromKey(tooShort).providerId).not.toBe('google');
  });

  it('AIza 形态允许字母数字下划线与连字符', () => {
    const k = 'AIza' + 'aB3_-'.repeat(3); // 12 chars suffix
    expect(detectProviderFromKey(k)).toMatchObject({
      providerId: 'google',
      confidence: 'high',
    });
  });

  it('中置信度：sk-or- OpenRouter 走 custom', () => {
    expect(detectProviderFromKey('sk-or-v1')).toMatchObject({
      providerId: 'custom',
      confidence: 'medium',
    });
  });

  it('中置信度：sk-ant- Anthropic 走 custom', () => {
    expect(detectProviderFromKey('sk-ant-api03-xxx')).toMatchObject({
      providerId: 'custom',
      confidence: 'medium',
    });
  });

  it('通用 sk- + 20+ 字母数字：低置信、不猜 provider', () => {
    const generic = 'sk-' + 'a'.repeat(20);
    expect(detectProviderFromKey(generic)).toEqual({
      providerId: null,
      confidence: 'low',
      reason: '通用 sk- 前缀，可能是 DeepSeek / 硅基 / 百炼 / OpenAI 等，需要用户手动选择',
    });
  });

  it('sk- 后不足 20 个字母数字：未识别前缀', () => {
    expect(detectProviderFromKey('sk-' + 'b'.repeat(19))).toMatchObject({
      providerId: null,
      confidence: 'low',
      reason: '未识别前缀',
    });
  });

  it('sk- 含下划线等不符合通用 sk 正则时走未识别', () => {
    expect(detectProviderFromKey('sk-abc_defghijklmnopqrst')).toMatchObject({
      providerId: null,
      confidence: 'low',
      reason: '未识别前缀',
    });
  });

  it('无前缀随机串：未识别', () => {
    expect(detectProviderFromKey('not-a-key')).toMatchObject({
      providerId: null,
      confidence: 'low',
      reason: '未识别前缀',
    });
  });
});
