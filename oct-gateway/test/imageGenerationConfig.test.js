const assert = require('assert');
const { buildImageGenerationConfig } = require('../runtime/imageGenerationConfig');

function configFrom(values) {
  return {
    getEnvOrConfig(key) {
      return values[key];
    },
  };
}

function testDefaultMinimaxProjection() {
  const imageConfig = buildImageGenerationConfig(configFrom({}));
  assert.equal(imageConfig.IMAGE_PROVIDER, 'minimax');
  assert.equal(imageConfig.IMAGE_BASE_URL, 'https://api.minimax.chat');
  assert.equal(imageConfig.IMAGE_MODEL, 'image-01');
  assert.equal(imageConfig.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY, 'false');
  assert.equal(imageConfig.IMAGE_SIZE, '1024x1024');
  assert.equal(imageConfig.GOOGLE_API_MODE, 'native');
}

function testProviderDefaults() {
  assert.equal(
    buildImageGenerationConfig(configFrom({ IMAGE_PROVIDER: 'openai' })).IMAGE_BASE_URL,
    'https://api.openai.com',
  );
  assert.equal(
    buildImageGenerationConfig(configFrom({ IMAGE_PROVIDER: 'siliconflow' })).IMAGE_MODEL,
    'Kwai-Kolors/Kolors',
  );
  const googleConfig = buildImageGenerationConfig(configFrom({
    IMAGE_PROVIDER: 'google',
    GOOGLE_AI_BASE_URL: 'https://generativelanguage.googleapis.com',
  }));
  assert.equal(googleConfig.IMAGE_BASE_URL, 'https://generativelanguage.googleapis.com');
  assert.equal(googleConfig.IMAGE_MODEL, 'gemini-3.1-flash-image-preview');
}

function testExplicitValuesWin() {
  const imageConfig = buildImageGenerationConfig(configFrom({
    IMAGE_PROVIDER: ' OPENAI ',
    IMAGE_BASE_URL: 'https://proxy.example/v1',
    IMAGE_MODEL: 'custom-image-model',
    IMAGE_API_KEY: 'image-key',
    CUSTOM_API_KEY: 'chat-key',
  }));
  assert.equal(imageConfig.IMAGE_PROVIDER, 'openai');
  assert.equal(imageConfig.IMAGE_BASE_URL, 'https://proxy.example/v1');
  assert.equal(imageConfig.IMAGE_MODEL, 'custom-image-model');
  assert.equal(imageConfig.IMAGE_API_KEY, 'image-key');
  assert.equal(imageConfig.CUSTOM_API_KEY, 'chat-key');
}

testDefaultMinimaxProjection();
testProviderDefaults();
testExplicitValuesWin();

console.log('PASS image generation config projection is isolated');
