function createLazyAiLibrary({ loadModule } = {}) {
  if (typeof loadModule !== 'function') {
    throw new TypeError('loadModule must be a function');
  }

  let moduleInstance = null;

  function getModule() {
    if (!moduleInstance) {
      moduleInstance = loadModule();
    }
    return moduleInstance;
  }

  return {
    searchKnowledge(...args) {
      return getModule().searchKnowledge(...args);
    },
    formatKnowledgeForPrompt(...args) {
      return getModule().formatKnowledgeForPrompt(...args);
    },
    checkHealth(...args) {
      return getModule().checkHealth(...args);
    },
    clearCache(...args) {
      return getModule().clearCache(...args);
    },
    isLoaded() {
      return Boolean(moduleInstance);
    },
  };
}

module.exports = {
  createLazyAiLibrary,
};
