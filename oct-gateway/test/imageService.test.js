const assert = require('assert');
const ImageService = require('../services/imageService');

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

function createProviderConfig(model) {
  return {
    id: 'custom',
    name: 'Custom',
    apiKey: 'key',
    baseUrl: 'https://example.test/v1',
    models: [model],
  };
}

async function testInlineVisionDoesNotLoadAnalyzer() {
  let loads = 0;
  const service = new ImageService({
    getImageAnalyzer: () => {
      loads += 1;
      return {
        analyzeImages: async () => 'should not run',
      };
    },
    logger: createLogger(),
  });

  const result = await service.processImageAttachments(
    '看图',
    [{ mimeType: 'image/png', content: 'abc' }],
    'qwen-vl-max',
    createProviderConfig({ id: 'qwen-vl-max', vision: true }),
  );

  assert.equal(loads, 0);
  assert.equal(result.visionModel, 'qwen-vl-max');
  assert.equal(Array.isArray(result.content), true);
}

async function testFallbackVisionLoadsAnalyzerOnDemand() {
  let loads = 0;
  const service = new ImageService({
    getImageAnalyzer: () => {
      loads += 1;
      return {
        analyzeImages: async (attachments, options) => {
          assert.equal(attachments.length, 1);
          assert.equal(options.currentProviderId, 'custom');
          return '图片摘要';
        },
      };
    },
    logger: createLogger(),
  });

  const result = await service.processImageAttachments(
    '请解释',
    [{ mimeType: 'image/png', content: 'abc' }],
    'text-only-model',
    createProviderConfig({ id: 'text-only-model', vision: false }),
  );

  assert.equal(loads, 1);
  assert.equal(result.content, '请解释\n\n图片摘要');
}

async function testFallbackFailureKeepsTextOnlyPrompt() {
  const service = new ImageService({
    getImageAnalyzer: () => {
      throw new Error('boom');
    },
    logger: createLogger(),
  });

  const result = await service.processImageAttachments(
    '请解释',
    [{ mimeType: 'image/png', content: 'abc' }],
    'text-only-model',
    createProviderConfig({ id: 'text-only-model', vision: false }),
  );

  assert.equal(result.content, '请解释');
}

(async () => {
  await testInlineVisionDoesNotLoadAnalyzer();
  await testFallbackVisionLoadsAnalyzerOnDemand();
  await testFallbackFailureKeepsTextOnlyPrompt();
  console.log('PASS image service lazy analyzer behavior is covered');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
