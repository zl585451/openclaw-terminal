class ProviderRouter {
  constructor({ config }) {
    this.config = config;
  }

  resolve(modelId = this.config.DASHSCOPE_MODEL) {
    const provider = this.config.getProviderConfig();
    const model = modelId || this.config.DASHSCOPE_MODEL;
    const apiKey = provider.apiKey;
    const baseUrl = provider.baseUrl;
    const modelDef = provider.models.find((entry) => entry.id === model);
    const registryCaps = this.config.getModelCaps(model);
    const caps = modelDef
      ? {
          supportsTools: modelDef.tools !== undefined ? modelDef.tools : registryCaps.supportsTools,
          supportsStreamOptions: provider.supportsStreamOptions,
          supportsThinking: registryCaps.supportsThinking ?? false,
          thinkingFormat: registryCaps.thinkingFormat ?? null,
          maxTokens: modelDef.maxTokens || registryCaps.maxTokens || 4096,
        }
      : registryCaps;

    return {
      provider,
      model,
      apiKey,
      baseUrl,
      modelDef,
      caps: {
        ...caps,
        supportsStreamOptions: caps?.supportsStreamOptions ?? provider.supportsStreamOptions,
      },
      fallback: {
        canFallbackToDeepseek: !!this.config.DEEPSEEK_API_KEY && !baseUrl.includes('deepseek'),
        canFallbackToBailian: baseUrl.includes('minimaxi.com') && !!this.config.DASHSCOPE_API_KEY,
      },
    };
  }
}

module.exports = ProviderRouter;
