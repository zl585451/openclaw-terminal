const assert = require('assert');
const { createLazyAiLibrary } = require('../runtime/lazyAiLibrary');

async function testDoesNotLoadUntilMethodCall() {
  let loads = 0;
  const aiLibrary = createLazyAiLibrary({
    loadModule: () => {
      loads += 1;
      return {
        searchKnowledge: async () => ({ results: [] }),
        formatKnowledgeForPrompt: () => '',
        checkHealth: async () => true,
        clearCache: () => {},
      };
    },
  });

  assert.equal(aiLibrary.isLoaded(), false);
  assert.equal(loads, 0);

  const result = await aiLibrary.searchKnowledge('demo');
  assert.deepEqual(result, { results: [] });
  assert.equal(aiLibrary.isLoaded(), true);
  assert.equal(loads, 1);

  await aiLibrary.checkHealth();
  aiLibrary.formatKnowledgeForPrompt([]);
  aiLibrary.clearCache();
  assert.equal(loads, 1);
}

function testRequiresLoaderFunction() {
  assert.throws(() => createLazyAiLibrary(), /loadModule/);
}

(async () => {
  await testDoesNotLoadUntilMethodCall();
  testRequiresLoaderFunction();
  console.log('PASS AI.library lazy proxy defers module load');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
