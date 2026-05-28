import { describe, it, expect } from 'vitest';
import { parseSystemReplyStatus } from './systemReplyParser';

describe('parseSystemReplyStatus', () => {
  describe('非系统回复返回空对象', () => {
    it('空字符串', () => {
      expect(parseSystemReplyStatus('')).toEqual({});
    });

    it('不以 🦞 开头', () => {
      expect(parseSystemReplyStatus('Model: qwen')).toEqual({});
    });

    it('null / undefined', () => {
      expect(parseSystemReplyStatus(null as unknown as string)).toEqual({});
      expect(parseSystemReplyStatus(undefined as unknown as string)).toEqual({});
    });
  });

  describe('Model 解析', () => {
    it('提取 Model 字段', () => {
      const result = parseSystemReplyStatus('🦞 Model: qwen3.5-plus');
      expect(result.modelName).toBe('qwen3.5-plus');
    });

    it('Model 字段带额外空格', () => {
      const result = parseSystemReplyStatus('🦞 Model:   qwen-max  ');
      expect(result.modelName).toBe('qwen-max');
    });
  });

  describe('Tokens 解析', () => {
    it('提取 Tokens 字段（k 格式）', () => {
      const result = parseSystemReplyStatus('🦞 Tokens: 1.5k / 32k');
      expect(result.tokenIn).toBe(1500);
      expect(result.ctxMax).toBe(32000);
    });

    it('提取 Tokens 字段（纯数字）', () => {
      const result = parseSystemReplyStatus('🦞 Tokens: 500 / 32k');
      expect(result.tokenIn).toBe(500000);
      expect(result.ctxMax).toBe(32000);
    });
  });

  describe('Context 解析', () => {
    it('百分比格式 (Context: X / Yk (Z%))', () => {
      const result = parseSystemReplyStatus('🦞 Context: 1.2 / 32k (4%)');
      expect(result.ctxUsed).toBe(1200);
      expect(result.ctxMax).toBe(32000);
    });

    it('tokens 格式 (Context: Xk tokens)', () => {
      const result = parseSystemReplyStatus('🦞 Context: 5.5k tokens');
      expect(result.ctxUsed).toBe(5500);
      expect(result.ctxMax).toBeUndefined();
    });
  });

  describe('Reasoning / Think 解析', () => {
    it('提取 Reasoning 字段', () => {
      const result = parseSystemReplyStatus('🦞 Reasoning: enabled');
      expect(result.thinkMode).toBe('enabled');
    });

    it('提取 Think 字段', () => {
      const result = parseSystemReplyStatus('🦞 Think: silent');
      expect(result.thinkMode).toBe('silent');
    });
  });

  describe('Runtime 解析', () => {
    it('提取 Runtime 字段', () => {
      const result = parseSystemReplyStatus('🦞 Runtime: direct');
      expect(result.runtimeMode).toBe('direct');
    });
  });

  describe('Queue 解析', () => {
    it('提取 Queue 字段', () => {
      const result = parseSystemReplyStatus('🦞 Queue: 0 pending');
      expect(result.queueInfo).toBe('0 pending');
    });
  });

  describe('api-key 解析', () => {
    it('提取 api-key 字段', () => {
      const result = parseSystemReplyStatus('🦞 api-key (sk-xxx123)');
      expect(result.apiKeyInfo).toBe('api-key (sk-xxx123)');
    });
  });

  describe('Compactions 解析', () => {
    it('提取 Compactions 字段', () => {
      const result = parseSystemReplyStatus('🦞 Compactions: 3');
      expect(result.compactions).toBe(3);
    });
  });

  describe('综合解析', () => {
    it('同时提取多个字段', () => {
      const text = '🦞 Model: qwen3.5-plus\nTokens: 2.5k / 32k\nContext: 1.0 / 32k (3%)\nReasoning: enabled\nRuntime: direct\nQueue: 0 pending';
      const result = parseSystemReplyStatus(text);

      expect(result.modelName).toBe('qwen3.5-plus');
      expect(result.tokenIn).toBe(2500);
      expect(result.ctxMax).toBe(32000);
      expect(result.ctxUsed).toBe(1000);
      expect(result.thinkMode).toBe('enabled');
      expect(result.runtimeMode).toBe('direct');
      expect(result.queueInfo).toBe('0 pending');
    });

    it('缺失字段返回 undefined', () => {
      const result = parseSystemReplyStatus('🦞 Model: qwen3.5-plus');
      expect(result.modelName).toBe('qwen3.5-plus');
      expect(result.tokenIn).toBeUndefined();
      expect(result.ctxUsed).toBeUndefined();
      expect(result.thinkMode).toBeUndefined();
      expect(result.runtimeMode).toBeUndefined();
      expect(result.compactions).toBeUndefined();
      expect(result.queueInfo).toBeUndefined();
    });
  });
});
