'use strict';

const { describe, it, expect, beforeEach } = globalThis;
const metrics = require('../runtime/omniRoute.metrics');

describe('OmniRoute Phase 8: Observability, Cost & Rate Limits', () => {

  beforeEach(() => {
    metrics.resetMetrics();
  });

  it('1. registers and aggregates successful requests correctly across capabilities, providers, and models', () => {
    metrics.recordRequest({
      capability: 'oct-chat',
      providerId: 'deepseek',
      model: 'deepseek-v4-flash',
      latencyMs: 150,
      status: 200,
      errorType: null,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
    });

    metrics.recordRequest({
      capability: 'oct-chat',
      providerId: 'deepseek',
      model: 'deepseek-v4-flash',
      latencyMs: 250,
      status: 200,
      errorType: null,
      usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 }
    });

    const data = metrics.getMetrics();
    expect(data.totalRequests).toBe(2);
    expect(data.successfulRequests).toBe(2);
    expect(data.failedRequests).toBe(0);

    // Capability aggregation
    expect(data.capabilities['oct-chat']).toBeDefined();
    expect(data.capabilities['oct-chat'].totalRequests).toBe(2);
    expect(data.capabilities['oct-chat'].successRequests).toBe(2);
    expect(data.capabilities['oct-chat'].avgLatencyMs).toBe(200);

    // Provider aggregation
    expect(data.providers['deepseek']).toBeDefined();
    expect(data.providers['deepseek'].totalRequests).toBe(2);
    expect(data.providers['deepseek'].promptTokens).toBe(220);
    expect(data.providers['deepseek'].completionTokens).toBe(130);
    expect(data.providers['deepseek'].totalTokens).toBe(350);

    // Model aggregation
    expect(data.models['deepseek-v4-flash']).toBeDefined();
    expect(data.models['deepseek-v4-flash'].totalRequests).toBe(2);
    expect(data.models['deepseek-v4-flash'].totalTokens).toBe(350);
  });

  it('2. registers and tracks failed requests and categorizes error types', () => {
    metrics.recordRequest({
      capability: 'oct-plan',
      providerId: 'bailian-coding',
      model: 'qwen3.5-plus',
      latencyMs: 500,
      status: 503,
      errorType: 'LlmClientHttpError',
      usage: null
    });

    metrics.recordRequest({
      capability: 'oct-plan',
      providerId: 'bailian-coding',
      model: 'qwen3.5-plus',
      latencyMs: 30000,
      status: 500,
      errorType: 'LlmClientTimeoutError',
      usage: null
    });

    const data = metrics.getMetrics();
    expect(data.totalRequests).toBe(2);
    expect(data.successfulRequests).toBe(0);
    expect(data.failedRequests).toBe(2);

    expect(data.capabilities['oct-plan'].errorCount).toBe(2);
    expect(data.capabilities['oct-plan'].errorTypes['LlmClientHttpError']).toBe(1);
    expect(data.capabilities['oct-plan'].errorTypes['LlmClientTimeoutError']).toBe(1);

    expect(data.providers['bailian-coding'].errorCount).toBe(2);
    expect(data.providers['bailian-coding'].errorTypes['LlmClientHttpError']).toBe(1);
  });

  it('3. rolling recent requests window is desensitized and strictly protects user content', () => {
    metrics.recordRequest({
      capability: 'oct-tool-safe',
      providerId: 'openai',
      model: 'gpt-4o',
      latencyMs: 800,
      status: 200,
      errorType: null,
      usage: { prompt_tokens: 300, completion_tokens: 150, total_tokens: 450 }
    });

    const data = metrics.getMetrics();
    expect(data.recentRequests.length).toBe(1);

    const entry = data.recentRequests[0];
    // Must contain desensitized metadata
    expect(entry.capability).toBe('oct-tool-safe');
    expect(entry.providerId).toBe('openai');
    expect(entry.model).toBe('gpt-4o');
    expect(entry.latencyMs).toBe(800);
    expect(entry.status).toBe(200);
    expect(entry.tokens).toBe(450);

    // Must NEVER contain user prompt or model response parameters (such as messages, prompt, text, or content)
    expect(entry.messages).toBeUndefined();
    expect(entry.prompt).toBeUndefined();
    expect(entry.content).toBeUndefined();
    expect(entry.text).toBeUndefined();
  });

  it('4. behaves correctly on reset metrics', () => {
    metrics.recordRequest({
      capability: 'oct-chat',
      providerId: 'google',
      model: 'gemini-2.0-flash',
      latencyMs: 120,
      status: 200,
      errorType: null,
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
    });

    metrics.resetMetrics();
    const data = metrics.getMetrics();
    expect(data.totalRequests).toBe(0);
    expect(data.successfulRequests).toBe(0);
    expect(data.failedRequests).toBe(0);
    expect(Object.keys(data.capabilities).length).toBe(0);
    expect(Object.keys(data.providers).length).toBe(0);
    expect(data.recentRequests.length).toBe(0);
  });

  it('5. pre-flight rate limiting reserve interface enforces rolling limits correctly', () => {
    const provider = 'mock-limited-provider';

    // Simulate maxRpm limit of 3 requests
    const opts = { maxRpm: 3 };

    // Request 1, 2, 3 should be allowed (returns false meaning NOT limited)
    expect(metrics.isRateLimited(provider, opts)).toBe(false);
    expect(metrics.isRateLimited(provider, opts)).toBe(false);
    expect(metrics.isRateLimited(provider, opts)).toBe(false);

    // Request 4 should be limited (returns true)
    expect(metrics.isRateLimited(provider, opts)).toBe(true);
  });

  it('6. records standard stream failures (such as 503) correctly to metrics', async () => {
    const { streamChat } = require('../ai');
    const externalOmniRoute = require('../runtime/externalOmniRoute');
    const originalResolveTarget = externalOmniRoute.resolveCapabilityTarget;

    externalOmniRoute.resolveCapabilityTarget = () => {
      return {
        providerId: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-mock-key',
        model: 'deepseek-v4-flash',
        source: 'external_omniroute_config',
        capability: 'oct-chat'
      };
    };

    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options) => {
      return {
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      };
    };

    try {
      let errorTriggered = false;
      await streamChat({
        messages: [{ role: 'user', content: 'test-stream-metrics-fail' }],
        capability: 'oct-chat',
        onDelta: () => {},
        onDone: () => {},
        onError: (err) => {
          errorTriggered = true;
        },
      });

      expect(errorTriggered).toBe(true);

      const data = metrics.getMetrics();
      expect(data.totalRequests).toBeGreaterThan(0);
      expect(data.failedRequests).toBeGreaterThan(0);
      expect(data.successfulRequests).toBe(0);

      // Verify the recentRequests metadata desensitization and properties
      const recent = data.recentRequests[data.recentRequests.length - 1];
      expect(recent).toBeDefined();
      expect(recent.status).toBe(503);
      expect(recent.errorType).toBe('ApiError');

      // Check strictly no leakage of user contents
      expect(recent.prompt).toBeUndefined();
      expect(recent.messages).toBeUndefined();
      expect(recent.content).toBeUndefined();
      expect(recent.text).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      externalOmniRoute.resolveCapabilityTarget = originalResolveTarget;
    }
  }, 20000);
});
