import { describe, expect, it } from 'vitest';
import {
  applyMemoryVectorRecallConfig,
  buildMemoryVectorRecallConfigData,
  inferVectorProvider,
} from './vectorRecall';

describe('electron memory vector recall config helpers', () => {
  it('infers vector provider from baseUrl or model', () => {
    expect(inferVectorProvider('https://dashscope.aliyuncs.com/compatible-mode/v1', '')).toBe('bailian');
    expect(inferVectorProvider('', 'text-embedding-v4')).toBe('bailian');
    expect(inferVectorProvider('https://ark.cn-beijing.volces.com/api/v3', '')).toBe('volcengine');
    expect(inferVectorProvider('https://example.com/v1', 'custom-embedding')).toBe('custom');
  });

  it('builds UI config data from nested memory config with defaults', () => {
    expect(buildMemoryVectorRecallConfigData({})).toEqual({
      enabled: false,
      provider: 'custom',
      baseUrl: '',
      apiKey: '',
      model: '',
      dimensions: 1024,
      threshold: 0.75,
      topK: 3,
    });

    expect(buildMemoryVectorRecallConfigData({
      memory: {
        vectorRecall: {
          enabled: true,
          embedding: {
            baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            apiKey: 'sk-test',
            model: 'text-embedding-v4',
            dimensions: 1536,
          },
          recall: {
            threshold: 0.7,
            topK: 5,
          },
        },
      },
    })).toEqual({
      enabled: true,
      provider: 'bailian',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-test',
      model: 'text-embedding-v4',
      dimensions: 1536,
      threshold: 0.7,
      topK: 5,
    });
  });

  it('applies bailian preset and clamps recall settings', () => {
    const cfg = applyMemoryVectorRecallConfig({}, {
      enabled: true,
      provider: 'bailian',
      apiKey: ' sk-test ',
      dimensions: 768,
      threshold: 2,
      topK: 99,
    });

    expect(cfg.memory.vectorRecall).toMatchObject({
      enabled: true,
      provider: 'bailian',
      embedding: {
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-test',
        model: 'text-embedding-v4',
        dimensions: 768,
        version: 1,
        timeoutMs: 30000,
      },
      recall: {
        threshold: 0.99,
        topK: 10,
      },
    });
  });

  it('preserves unrelated memory config and applies custom values', () => {
    const cfg = applyMemoryVectorRecallConfig({
      memory: {
        summarizer: { enabled: true },
        vectorRecall: {
          embedding: { version: 2, timeoutMs: 15000 },
        },
      },
    }, {
      provider: 'custom',
      baseUrl: ' https://example.com/v1 ',
      apiKey: ' key ',
      model: ' embed ',
      dimensions: 2048,
      threshold: 0.05,
      topK: 0,
    });

    expect(cfg.memory.summarizer).toEqual({ enabled: true });
    expect(cfg.memory.vectorRecall.embedding).toMatchObject({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      model: 'embed',
      dimensions: 2048,
      version: 2,
      timeoutMs: 15000,
    });
    expect(cfg.memory.vectorRecall.recall).toEqual({
      threshold: 0.1,
      topK: 1,
    });
  });
});
