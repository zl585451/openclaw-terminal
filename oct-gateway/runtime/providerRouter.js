class ProviderRouter {
  constructor({ config }) {
    this.config = config;
  }

  resolve(modelId = this.config.DASHSCOPE_MODEL) {
    const provider = this.config.getProviderConfig();
    const model = modelId || this.config.DASHSCOPE_MODEL;
    const apiKey = provider.apiKey;
    const baseUrl = provider.baseUrl;
    const normalized = this.config.normalizeModelId ? this.config.normalizeModelId(model) : String(model || '').toLowerCase();
    const modelDef = provider.models.find((entry) => {
      if (entry.id === model) return true;
      const entryNormalized = this.config.normalizeModelId
        ? this.config.normalizeModelId(entry.id)
        : String(entry.id || '').toLowerCase();
      return entryNormalized && entryNormalized === normalized;
    });
    const registryCaps = this.config.getModelCaps(model);
    const toolsSupport = modelDef && modelDef.tools !== undefined
      ? (modelDef.tools ? 'supported' : 'unsupported')
      : (registryCaps.toolsSupport || (registryCaps.supportsTools ? 'supported' : 'unknown'));
    let capabilitySource = modelDef
      ? 'provider_model_def'
      : (registryCaps.capabilitySource || 'fallback_unknown');
    let resolvedToolsSupport = toolsSupport;
    if (!modelDef && resolvedToolsSupport === 'unknown' && this.config.getProbeCacheEntry) {
      const probe = this.config.getProbeCacheEntry({
        providerId: provider.id,
        baseUrl,
        modelId: model,
      });
      if (probe?.toolsSupport) {
        resolvedToolsSupport = probe.toolsSupport;
        capabilitySource = probe.capabilitySource || 'runtime_probe_cache';
      }
    }
    const caps = modelDef
      ? {
          toolsSupport: resolvedToolsSupport,
          capabilitySource,
          supportsTools: resolvedToolsSupport === 'supported',
          supportsStreamOptions: provider.supportsStreamOptions,
          supportsThinking: registryCaps.supportsThinking ?? false,
          thinkingFormat: registryCaps.thinkingFormat ?? null,
          maxTokens: modelDef.maxTokens || registryCaps.maxTokens || 4096,
        }
      : {
          ...registryCaps,
          toolsSupport: resolvedToolsSupport,
          capabilitySource,
          supportsTools: resolvedToolsSupport === 'supported',
        };

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
