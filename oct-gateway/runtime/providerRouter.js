class ProviderRouter {
  constructor({ config }) {
    this.config = config;
  }

  resolve(modelId = this.config.DASHSCOPE_MODEL) {
    const provider = this.config.getProviderConfig();
    const requestedModel = modelId || this.config.DASHSCOPE_MODEL;
    // Vertex OpenAI 兼容层的 Gemini 模型通常使用 google/gemini-...。
    // 兼容历史配置：若用户存的是 gemini-...（无前缀），自动补上 google/。
    const model = (() => {
      if (provider.id !== 'google') return requestedModel;
      const raw = String(requestedModel || '').trim();
      if (!raw) return raw;
      if (raw.startsWith('__')) return raw;
      const canonical = raw.toLowerCase().startsWith('google/')
        ? raw
        : raw.includes('/')
          ? raw
          : `google/${raw}`;
      const aliasMap = {
        'google/gemini-2.5-pro-preview-03-25': 'google/gemini-2.5-pro',
        'google/gemini-2.5-flash-preview-04-17': 'google/gemini-2.5-flash',
        'google/gemini-2.0-flash-001': 'google/gemini-2.0-flash',
        'google/gemini-3-pro-preview': 'google/gemini-3.1-pro-preview',
      };
      return aliasMap[canonical] || canonical;
    })();
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
    const hasExplicitToolBlock = modelDef?.toolReliability === 'none';
    const googleToolsMode = String(this.config.GOOGLE_TOOLS_MODE || 'auto').toLowerCase();
    if (provider.id === 'google') {
      if (googleToolsMode === 'on') {
        resolvedToolsSupport = 'supported';
        capabilitySource = 'google_tools_mode_forced_on';
      } else if (googleToolsMode === 'off') {
        resolvedToolsSupport = 'unsupported';
        capabilitySource = 'google_tools_mode_forced_off';
      } else if (resolvedToolsSupport === 'unsupported') {
        // Google 默认改为可探测，避免 provider 模型静态声明阻断工具调用。
        resolvedToolsSupport = 'unknown';
        capabilitySource = 'google_tools_mode_auto_probe';
      }
    }
    if (resolvedToolsSupport === 'unsupported' && googleToolsMode !== 'off' && !hasExplicitToolBlock) {
      // 做减法：静态表里的“不支持工具”先不再作为硬封禁。
      // 统一降级为 unknown，让运行时 tool_calls 和探测结果来证明能力。
      resolvedToolsSupport = 'unknown';
      capabilitySource = provider.id === 'google'
        ? 'google_tools_mode_auto_probe'
        : 'static_tools_decl_softened';
    }
    if (resolvedToolsSupport === 'unknown' && this.config.getProbeCacheEntry) {
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
    const resolvedToolReliability = (() => {
      if (provider.id === 'google' && (googleToolsMode === 'on' || (googleToolsMode === 'auto' && resolvedToolsSupport === 'unknown'))) {
        return 'loose';
      }
      if (modelDef?.toolReliability) return modelDef.toolReliability;
      if (registryCaps?.toolReliability && !(registryCaps.toolReliability === 'none' && resolvedToolsSupport !== 'unsupported')) {
        return registryCaps.toolReliability;
      }
      if (resolvedToolsSupport === 'unsupported') return 'none';
      return 'loose';
    })();
    const caps = modelDef
      ? {
          toolsSupport: resolvedToolsSupport,
          capabilitySource,
          supportsTools: resolvedToolsSupport === 'supported',
          toolReliability: resolvedToolReliability,
          supportsStreamOptions: provider.supportsStreamOptions,
          supportsThinking: registryCaps.supportsThinking ?? false,
          thinkingFormat: registryCaps.thinkingFormat ?? null,
          supportsStructuredOutput: registryCaps.supportsStructuredOutput ?? provider.supportsStructuredOutput ?? false,
          supportsRenderBlocks: registryCaps.supportsRenderBlocks ?? provider.supportsRenderBlocks ?? true,
          preferredRenderMode: registryCaps.preferredRenderMode || provider.preferredRenderMode || 'gateway_normalized',
          renderPromptProfile: registryCaps.renderPromptProfile || provider.renderPromptProfile || 'provider_unknown',
          maxTokens: modelDef.maxTokens || registryCaps.maxTokens || 4096,
        }
      : {
          ...registryCaps,
          toolsSupport: resolvedToolsSupport,
          capabilitySource,
          supportsTools: resolvedToolsSupport === 'supported',
          toolReliability: resolvedToolReliability,
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
