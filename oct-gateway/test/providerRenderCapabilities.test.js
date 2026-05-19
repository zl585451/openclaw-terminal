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

  const googleCaps = config.getModelCaps('google/gemini-3.1-pro-preview');
  assert.equal(googleCaps.preferredRenderMode, 'render_blocks');
  assert.equal(googleCaps.supportsStructuredOutput, true);
  assert.equal(googleCaps.supportsRenderBlocks, true);

  const deepseekCaps = config.getModelCaps('deepseek-v4-flash');
  assert.equal(deepseekCaps.preferredRenderMode, 'gateway_normalized');
  assert.equal(deepseekCaps.supportsStructuredOutput, false);
  assert.equal(deepseekCaps.supportsRenderBlocks, true);

  const router = new ProviderRouter({ config });
  const resolved = router.resolve('google/gemini-3.1-pro-preview');
  assert.equal(resolved.caps.preferredRenderMode, 'render_blocks');
  assert.equal(resolved.caps.renderPromptProfile, 'strict_fenced_json');

  console.log('PASS provider render capabilities are normalized');
}

main();
