'use strict';

const assert = require('node:assert');
const { PROVIDERS, resolveProviderRenderCapabilities } = require('../providers');
const config = require('../config');
const ProviderRouter = require('../runtime/providerRouter');

function main() {
  assert.equal(PROVIDERS.google.preferredRenderMode, 'render_blocks');
  assert.equal(PROVIDERS.google.supportsStructuredOutput, true);
  assert.equal(PROVIDERS.deepseek.preferredRenderMode, 'gateway_normalized');
  assert.equal(PROVIDERS.deepseek.supportsRenderBlocks, true);
  assert.equal(PROVIDERS.ollama.preferredRenderMode, 'legacy_tags');

  assert.deepEqual(resolveProviderRenderCapabilities('missing-provider'), {
    supportsStructuredOutput: false,
    supportsRenderBlocks: true,
    preferredRenderMode: 'gateway_normalized',
    renderPromptProfile: 'provider_unknown',
  });

  const googleCaps = config.getModelCaps('gemini-3.1-pro-preview');
  assert.equal(googleCaps.preferredRenderMode, 'render_blocks');
  assert.equal(googleCaps.supportsStructuredOutput, true);
  assert.equal(googleCaps.supportsRenderBlocks, true);
  assert.equal(googleCaps.toolsSupport, 'supported');
  assert.equal(googleCaps.toolReliability, 'loose');

  const deepseekCaps = config.getModelCaps('deepseek-v4-flash');
  assert.equal(deepseekCaps.preferredRenderMode, 'gateway_normalized');
  assert.equal(deepseekCaps.supportsStructuredOutput, false);
  assert.equal(deepseekCaps.supportsRenderBlocks, true);

  const prevProvider = config.currentProvider;
  config.currentProvider = 'google';
  const router = new ProviderRouter({ config });
  const resolved = router.resolve('google/gemini-3.1-pro-preview');
  config.currentProvider = prevProvider;
  assert.equal(resolved.model, 'gemini-3.1-pro-preview');
  assert.equal(resolved.caps.preferredRenderMode, 'render_blocks');
  assert.equal(resolved.caps.renderPromptProfile, 'strict_fenced_json');
  assert.equal(resolved.caps.toolsSupport, 'supported');
  assert.equal(resolved.caps.toolReliability, 'loose');

  const resolvedDeepseekPro = router.resolve('deepseek-v4-pro');
  assert.equal(resolvedDeepseekPro.caps.toolsSupport, 'unknown');
  assert.equal(resolvedDeepseekPro.caps.toolReliability, 'loose');

  console.log('PASS provider render capabilities are normalized');
}

main();
