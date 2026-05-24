import { describe, expect, it } from 'vitest';
import {
  applyMemorySummarizerConfig,
  buildMemorySummarizerConfigData,
} from './memorySummarizer';

describe('electron memory summarizer config helpers', () => {
  it('builds UI config data with defaults', () => {
    expect(buildMemorySummarizerConfigData({})).toEqual({
      enabled: true,
      baseUrl: '',
      apiKey: '',
      model: '',
    });
  });

  it('builds UI config data from nested memory config', () => {
    expect(buildMemorySummarizerConfigData({
      memory: {
        summarizer: {
          enabled: false,
          api: {
            baseUrl: 'https://example.com/v1',
            apiKey: 'sk-test',
            model: 'summary-model',
          },
        },
      },
    })).toEqual({
      enabled: false,
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk-test',
      model: 'summary-model',
    });
  });

  it('applies trimmed API updates while preserving unrelated memory config', () => {
    const cfg = applyMemorySummarizerConfig({
      memory: {
        vectorRecall: { enabled: true },
        summarizer: {
          schedule: { intervalMs: 1000 },
          api: { timeoutMs: 15000 },
        },
      },
    }, {
      enabled: false,
      baseUrl: ' https://summary.example/v1 ',
      apiKey: ' sk-summary ',
      model: ' model-x ',
    });

    expect(cfg.memory.vectorRecall).toEqual({ enabled: true });
    expect(cfg.memory.summarizer.schedule).toEqual({ intervalMs: 1000 });
    expect(cfg.memory.summarizer.enabled).toBe(false);
    expect(cfg.memory.summarizer.api).toEqual({
      timeoutMs: 15000,
      baseUrl: 'https://summary.example/v1',
      apiKey: 'sk-summary',
      model: 'model-x',
    });
  });

  it('treats non-false enabled payload as enabled', () => {
    const cfg = applyMemorySummarizerConfig({}, { enabled: true });
    expect(cfg.memory.summarizer.enabled).toBe(true);
  });
});
