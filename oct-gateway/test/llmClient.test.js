'use strict';

const { describe, it, expect, beforeEach, afterEach } = globalThis;
const config = require('../config');
const { resolveProviderFor } = require('../services/llmClient');

describe('resolveProviderFor with OmniRoute capabilities', () => {
  const originalEnv = {};
  const envVars = [
    'DASHSCOPE_API_KEY',
    'DASHSCOPE_BASE_URL',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'SUMMARIZER_API_KEY',
    'SUMMARIZER_BASE_URL',
    'SUMMARIZER_MODEL',
    'SCRIPT_ADAPTER_API_KEY',
    'SCRIPT_ADAPTER_BASE_URL',
    'SCRIPT_ADAPTER_MODEL',
    'SCRIPT_ADAPTER_TEXT_REWRITER_MODEL',
    'OMNIROUTE_MODEL',
    'OMNIROUTE_BASE_URL',
    'OMNIROUTE_API_KEY',
    'OCT_USE_EXTERNAL_OMNIROUTE',
  ];

  let originalGetProviderConfig;
  let originalGetEnvOrConfig;
  let originalScriptAdapter;
  let originalMemory;

  beforeEach(() => {
    // Back up process.env
    envVars.forEach((k) => {
      originalEnv[k] = process.env[k];
    });

    // Clean up process.env for deterministic testing
    envVars.forEach((k) => {
      delete process.env[k];
    });

    // Back up config methods/properties
    originalGetProviderConfig = config.getProviderConfig;
    originalGetEnvOrConfig = config.getEnvOrConfig;
    originalScriptAdapter = config.scriptAdapter;
    originalMemory = config.memory;

    // Stub getEnvOrConfig to prioritize process.env during testing
    config.getEnvOrConfig = (key) => {
      return process.env[key] || '';
    };

    // Stub getProviderConfig to return standard test provider values
    config.getProviderConfig = () => {
      const baseUrl = process.env.SCRIPT_ADAPTER_BASE_URL || process.env.DASHSCOPE_BASE_URL || '';
      const apiKey = process.env.SCRIPT_ADAPTER_API_KEY || process.env.DASHSCOPE_API_KEY || '';
      const model = process.env.SCRIPT_ADAPTER_MODEL || process.env.DASHSCOPE_MODEL || 'qwen-plus';
      return { baseUrl, apiKey, model, id: 'bailian', provider: 'bailian' };
    };

    // Reset config states
    config.scriptAdapter = undefined;
    config.memory = undefined;
  });

  afterEach(() => {
    // Restore process.env
    envVars.forEach((k) => {
      if (originalEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = originalEnv[k];
      }
    });

    // Restore config methods/properties
    config.getProviderConfig = originalGetProviderConfig;
    config.getEnvOrConfig = originalGetEnvOrConfig;
    config.scriptAdapter = originalScriptAdapter;
    config.memory = originalMemory;
  });

  it('1. fallback to original logic when no capability is passed', () => {
    // Stub original resolution to throw since nothing is configured
    config.getProviderConfig = () => ({});
    expect(() => resolveProviderFor('script_adapter')).toThrow(/LLM_NOT_CONFIGURED/);

    // Now configure script adapter original logic
    process.env.SCRIPT_ADAPTER_BASE_URL = 'https://original-sa.api/v1';
    process.env.SCRIPT_ADAPTER_API_KEY = 'sa-key-original';
    process.env.SCRIPT_ADAPTER_MODEL = 'sa-model-original';

    const provider = resolveProviderFor('script_adapter');
    expect(provider).toBeDefined();
    expect(provider.baseUrl).toBe('https://original-sa.api/v1');
    expect(provider.apiKey).toBe('sa-key-original');
    expect(provider.model).toBe('sa-model-original');
  });

  it('2. falls back to original logic when a legacy capability alias is passed but OmniRoute is unavailable', () => {
    // Nothing is configured in candidate providers: bailian or deepseek.
    // Configure only original script adapter.
    process.env.SCRIPT_ADAPTER_BASE_URL = 'https://original-sa.api/v1';
    process.env.SCRIPT_ADAPTER_API_KEY = 'sa-key-original';
    process.env.SCRIPT_ADAPTER_MODEL = 'sa-model-original';

    const provider = resolveProviderFor('script_adapter', 'oct-plan');
    expect(provider).toBeDefined();
    expect(provider.baseUrl).toBe('https://original-sa.api/v1');
    expect(provider.apiKey).toBe('sa-key-original');
    expect(provider.model).toBe('sa-model-original');
  });

  it('3. keeps script_adapter on its dedicated provider even when external OmniRoute is configured', () => {
    process.env.OCT_USE_EXTERNAL_OMNIROUTE = 'true';
    process.env.OMNIROUTE_BASE_URL = 'https://omni-test.api/v1';
    process.env.OMNIROUTE_API_KEY = 'sk-omni-secret';
    process.env.OMNIROUTE_MODEL = 'combo-chat';
    process.env.SCRIPT_ADAPTER_BASE_URL = 'https://sa-test.api/v1';
    process.env.SCRIPT_ADAPTER_API_KEY = 'sa-key';
    process.env.SCRIPT_ADAPTER_MODEL = 'sa-model';

    const provider = resolveProviderFor('script_adapter', 'oct-plan');
    expect(provider).toBeDefined();
    expect(provider.baseUrl).toBe('https://sa-test.api/v1');
    expect(provider.apiKey).toBe('sa-key');
    expect(provider.model).toBe('sa-model');
    expect(provider.source).toBe('script_adapter');
  });

  it('4. honors SCRIPT_ADAPTER override when OmniRoute is not configured', () => {
    process.env.SCRIPT_ADAPTER_BASE_URL = 'https://sa-test.api/v1';
    process.env.SCRIPT_ADAPTER_API_KEY = 'sa-key';
    process.env.SCRIPT_ADAPTER_MODEL = 'sa-model';

    const provider = resolveProviderFor('script_adapter');
    expect(provider).toBeDefined();
    expect(provider.baseUrl).toBe('https://sa-test.api/v1');
    expect(provider.apiKey).toBe('sa-key');
    expect(provider.model).toBe('sa-model');
  });

  it('4b. accepts SCRIPT_ADAPTER_TEXT_REWRITER_MODEL as script adapter model fallback', () => {
    process.env.SCRIPT_ADAPTER_BASE_URL = 'https://sa-test.api/v1';
    process.env.SCRIPT_ADAPTER_API_KEY = 'sa-key';
    process.env.SCRIPT_ADAPTER_TEXT_REWRITER_MODEL = 'sa-text-model';

    const provider = resolveProviderFor('script_adapter');
    expect(provider).toBeDefined();
    expect(provider.baseUrl).toBe('https://sa-test.api/v1');
    expect(provider.model).toBe('sa-text-model');
  });

  it('5. does not read new configs outside env or disturb other purpose priorities', () => {
    // SCRIPT_ADAPTER_* still has higher priority than SUMMARIZER_* for purpose='script_adapter'
    process.env.SCRIPT_ADAPTER_BASE_URL = 'https://original-sa.api/v1';
    process.env.SCRIPT_ADAPTER_API_KEY = 'sa-key-original';
    process.env.SCRIPT_ADAPTER_MODEL = 'sa-model-original';

    process.env.SUMMARIZER_BASE_URL = 'https://sum.api/v1';
    process.env.SUMMARIZER_API_KEY = 'sum-key';
    process.env.SUMMARIZER_MODEL = 'sum-model';

    const provider = resolveProviderFor('script_adapter');
    expect(provider.baseUrl).toBe('https://original-sa.api/v1');
    expect(provider.apiKey).toBe('sa-key-original');
  });

  it('6. proves that script_adapter agents no longer request a plan-specific capability', async () => {
    const llmClient = require('../services/llmClient');
    let calledWithCapability = null;
    let calledWithPurpose = null;

    const originalResolveProviderFor = llmClient.resolveProviderFor;
    llmClient.resolveProviderFor = (purpose, capability) => {
      calledWithPurpose = purpose;
      calledWithCapability = capability;
      return { baseUrl: 'http://mock.api', apiKey: 'mock', model: 'mock' };
    };

    try {
      // Require classificationSplitterAgent and run a simple call
      const { runClassificationSplitterAgent } = require('../script_adapter/agents/classificationSplitterAgent');
      // ClassificationSplitterAgent throws immediately if no input is provided, which is perfect since it calls resolveProviderFor first!
      await runClassificationSplitterAgent({ sourceText: '测试' }).catch(() => {});
      
      expect(calledWithPurpose).toBe('script_adapter');
      expect(calledWithCapability).toBeUndefined();
    } finally {
      llmClient.resolveProviderFor = originalResolveProviderFor;
    }
  });

  it('7. proves that services/summarizer no longer requests a plan-specific capability when SUMMARIZER_* not configured', async () => {
    const llmClient = require('../services/llmClient');
    let calledWithCapability = null;
    let calledWithPurpose = null;

    const originalResolveProviderFor = llmClient.resolveProviderFor;
    llmClient.resolveProviderFor = (purpose, capability) => {
      calledWithPurpose = purpose;
      calledWithCapability = capability;
      return { baseUrl: 'http://mock-summarizer.api', apiKey: 'mock', model: 'mock-model' };
    };

    try {
      const summarizer = require('../services/summarizer');
      await summarizer.summarize('test-text').catch(() => {});
      
      expect(calledWithPurpose).toBe('general');
      expect(calledWithCapability).toBeUndefined();
    } finally {
      llmClient.resolveProviderFor = originalResolveProviderFor;
    }
  });

  it('8. prefers SUMMARIZER_* config over oct-plan capability resolution in services/summarizer', async () => {
    process.env.SUMMARIZER_BASE_URL = 'https://sum-override.api/v1';
    process.env.SUMMARIZER_API_KEY = 'sum-override-key';
    process.env.SUMMARIZER_MODEL = 'sum-override-model';

    process.env.DEEPSEEK_BASE_URL = 'https://ds-omni.api/v1';
    process.env.DEEPSEEK_API_KEY = 'ds-key-omni';

    const llmClient = require('../services/llmClient');
    let resolveProviderForCalled = false;
    const originalResolveProviderFor = llmClient.resolveProviderFor;
    llmClient.resolveProviderFor = (purpose, capability) => {
      resolveProviderForCalled = true;
      return originalResolveProviderFor(purpose, capability);
    };

    const originalFetch = globalThis.fetch;
    let fetchedUrl = null;
    let fetchedBody = null;
    globalThis.fetch = async (url, options) => {
      fetchedUrl = url;
      fetchedBody = JSON.parse(options.body || '{}');
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'mocked summary' } }],
        }),
      };
    };

    try {
      const summarizer = require('../services/summarizer');
      const res = await summarizer.summarize('test-text');
      
      expect(resolveProviderForCalled).toBe(false);
      expect(fetchedUrl).toBe('https://sum-override.api/v1/chat/completions');
      expect(fetchedBody.model).toBe('sum-override-model');
      expect(res.summary).toBe('mocked summary');
    } finally {
      globalThis.fetch = originalFetch;
      llmClient.resolveProviderFor = originalResolveProviderFor;
    }
  });

  it('9. falls back to original Gateway provider and chooses fast model when candidates and SUMMARIZER_* are both unavailable', async () => {
    process.env.DASHSCOPE_BASE_URL = 'https://default-gateway.api/v1';
    process.env.DASHSCOPE_API_KEY = 'default-gateway-key';
    process.env.DASHSCOPE_MODEL = 'qwen-max';

    const originalFetch = globalThis.fetch;
    let fetchedUrl = null;
    let fetchedBody = null;
    globalThis.fetch = async (url, options) => {
      fetchedUrl = url;
      fetchedBody = JSON.parse(options.body || '{}');
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'mocked summary' } }],
        }),
      };
    };

    try {
      const summarizer = require('../services/summarizer');
      const res = await summarizer.summarize('test-text');
      
      expect(fetchedUrl).toBe('https://default-gateway.api/v1/chat/completions');
      expect(fetchedBody.model).toBe('qwen-turbo'); // chooses fast model qwen-turbo over configured qwen-max
      expect(res.summary).toBe('mocked summary');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
