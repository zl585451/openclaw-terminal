'use strict';

const MODEL_REGISTRY = {
  'qwen3.5-plus': { provider: 'bailian', label: 'Qwen 3.5 Plus（推荐，支持工具）', supportsTools: true, supportsStreamOptions: true, supportsThinking: true, maxTokens: 4096 },
  'qwen3-max': { provider: 'bailian', label: 'Qwen 3 Max（最强推理）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'qwen3-max-2026-01-23': { provider: 'bailian', label: 'Qwen 3 Max（最强推理）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'qwen-plus': { provider: 'bailian', label: 'Qwen Plus（稳定通用）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'qwen-max': { provider: 'bailian', label: 'Qwen Max（最强推理）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'qwen-turbo': { provider: 'bailian', label: 'Qwen Turbo（快速便宜）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'qwen3-coder-next': { provider: 'bailian', label: 'Qwen 3 Coder Next（代码专用）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'qwen3-coder-plus': { provider: 'bailian', label: 'Qwen 3 Coder Plus（代码专用）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'kimi-k2.6': { provider: 'bailian', label: 'Kimi K2.6（月之暗面）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'kimi-k2.5': { provider: 'bailian', label: 'Kimi K2.5（月之暗面）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'MiniMax-M2.5': { provider: 'bailian', label: 'MiniMax M2.5', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'MiniMax-M2.7': { provider: 'minimax', label: 'MiniMax M2.7（最新，自我迭代）', supportsTools: true, supportsStreamOptions: true, supportsThinking: true, thinkingFormat: 'think_tags', maxTokens: 8192 },
  'MiniMax-M2.7-highspeed': { provider: 'minimax', label: 'MiniMax M2.7 极速版（100tps）', supportsTools: true, supportsStreamOptions: true, supportsThinking: true, thinkingFormat: 'think_tags', maxTokens: 8192 },
  'MiniMax-M2.5-standalone': { provider: 'minimax', label: 'MiniMax M2.5（顶尖性能）', supportsTools: true, supportsStreamOptions: true, supportsThinking: true, thinkingFormat: 'think_tags', maxTokens: 8192 },
  'MiniMax-M2.5-highspeed': { provider: 'minimax', label: 'MiniMax M2.5 极速版（100tps）', supportsTools: true, supportsStreamOptions: true, supportsThinking: true, thinkingFormat: 'think_tags', maxTokens: 8192 },
  'MiniMax-M2.1': { provider: 'minimax', label: 'MiniMax M2.1（多语言编程）', supportsTools: true, supportsStreamOptions: true, supportsThinking: true, thinkingFormat: 'think_tags', maxTokens: 4096 },
  'MiniMax-M2.1-highspeed': { provider: 'minimax', label: 'MiniMax M2.1 极速版（100tps）', supportsTools: true, supportsStreamOptions: true, supportsThinking: true, thinkingFormat: 'think_tags', maxTokens: 4096 },
  'MiniMax-M2': { provider: 'minimax', label: 'MiniMax M2（高效编码）', supportsTools: true, supportsStreamOptions: true, supportsThinking: true, thinkingFormat: 'think_tags', maxTokens: 4096 },
  'glm-5': { provider: 'bailian', label: 'GLM 5（智谱）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'glm-4.7': { provider: 'bailian', label: 'GLM 4.7（智谱）', supportsTools: true, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'deepseek-v3': { provider: 'bailian', label: 'DeepSeek V3（百炼版，不支持工具）', supportsTools: false, supportsStreamOptions: true, supportsThinking: false, maxTokens: 4096 },
  'deepseek-r1': { provider: 'bailian', label: 'DeepSeek R1（百炼版，深度推理）', supportsTools: false, supportsStreamOptions: true, supportsThinking: true, maxTokens: 4096 },
  'deepseek-v4-flash': { provider: 'deepseek', label: 'DeepSeek V4 Flash（通用，推荐）', supportsTools: true, supportsStreamOptions: false, supportsThinking: false, maxTokens: 8192 },
  'deepseek-v4-pro': { provider: 'deepseek', label: 'DeepSeek V4 Pro（深度推理）', supportsTools: false, supportsStreamOptions: false, supportsThinking: true, maxTokens: 8192 },
  'deepseek-chat': { provider: 'deepseek', label: 'DeepSeek Chat（旧版，2026/07/24 弃用）', supportsTools: true, supportsStreamOptions: false, supportsThinking: false, maxTokens: 4096 },
  'deepseek-reasoner': { provider: 'deepseek', label: 'DeepSeek Reasoner（旧版，2026/07/24 弃用）', supportsTools: false, supportsStreamOptions: false, supportsThinking: true, maxTokens: 4096 },
  'gemini-2.5-flash': { provider: 'google', label: 'Gemini 2.5 Flash', supportsTools: false, supportsStreamOptions: false, supportsThinking: true, maxTokens: 8192 },
  'gemini-2.5-flash-lite': { provider: 'google', label: 'Gemini 2.5 Flash-Lite', supportsTools: false, supportsStreamOptions: false, supportsThinking: true, maxTokens: 8192 },
  'gemini-2.5-pro': { provider: 'google', label: 'Gemini 2.5 Pro', supportsTools: false, supportsStreamOptions: false, supportsThinking: true, maxTokens: 8192 },
  'gemini-3-flash-preview': { provider: 'google', label: 'Gemini 3 Flash Preview', supportsTools: false, supportsStreamOptions: false, supportsThinking: true, maxTokens: 8192 },
  'gemini-3.1-pro-preview': { provider: 'google', label: 'Gemini 3.1 Pro Preview', supportsTools: false, supportsStreamOptions: false, supportsThinking: true, maxTokens: 8192 },
  'gemini-3.1-flash-lite-preview': { provider: 'google', label: 'Gemini 3.1 Flash-Lite Preview', supportsTools: false, supportsStreamOptions: false, supportsThinking: true, maxTokens: 8192 },
  'gemini-2.0-flash': { provider: 'google', label: 'Gemini 2.0 Flash', supportsTools: false, supportsStreamOptions: false, supportsThinking: false, maxTokens: 8192 },
  'gemini-2.0-flash-lite': { provider: 'google', label: 'Gemini 2.0 Flash-Lite', supportsTools: false, supportsStreamOptions: false, supportsThinking: false, maxTokens: 8192 },
  'gemini-1.5-flash': { provider: 'google', label: 'Gemini 1.5 Flash', supportsTools: false, supportsStreamOptions: false, supportsThinking: false, maxTokens: 8192 },
  'gemini-1.5-flash-8b': { provider: 'google', label: 'Gemini 1.5 Flash-8B', supportsTools: false, supportsStreamOptions: false, supportsThinking: false, maxTokens: 8192 },
  'gemini-1.5-pro': { provider: 'google', label: 'Gemini 1.5 Pro', supportsTools: false, supportsStreamOptions: false, supportsThinking: false, maxTokens: 8192 },
};

function createModelRegistryHelpers({ loadOpenClawJson }) {
  function normalizeModelId(modelId) {
    const raw = String(modelId || '').trim();
    if (!raw) return '';
    const slashParts = raw.split('/').map((item) => item.trim()).filter(Boolean);
    const tail = slashParts.length > 0 ? slashParts[slashParts.length - 1] : raw;
    return tail.toLowerCase().replace(/\s+/g, '').replace(/_/g, '-').replace(/^pro\//, '').replace(/-online$/g, '').replace(/:free$/g, '');
  }

  function detectModelFamily(modelId) {
    const normalized = normalizeModelId(modelId);
    if (!normalized) return 'unknown';
    if (normalized.includes('qwen')) return 'qwen';
    if (normalized.includes('glm')) return 'glm';
    if (normalized.includes('deepseek')) return 'deepseek';
    if (normalized.includes('gemini')) return 'gemini';
    if (normalized.includes('minimax')) return 'minimax';
    if (normalized.includes('kimi') || normalized.includes('moonshot')) return 'kimi';
    if (normalized.includes('gpt') || normalized.includes('o1') || normalized.includes('o3')) return 'openai';
    return 'unknown';
  }

  function buildModelIdCandidates(modelId) {
    const raw = String(modelId || '').trim();
    if (!raw) return [];
    const out = new Set([raw, raw.toLowerCase(), normalizeModelId(raw)]);
    const slashParts = raw.split('/').map((item) => item.trim()).filter(Boolean);
    if (slashParts.length > 0) {
      const tail = slashParts[slashParts.length - 1];
      out.add(tail);
      out.add(tail.toLowerCase());
      out.add(normalizeModelId(tail));
    }
    return Array.from(out).filter(Boolean);
  }

  function normalizeToolReliability(raw, { toolsSupport, provider } = {}) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'strict' || value === 'loose' || value === 'none') return value;
    if (toolsSupport !== 'supported') return 'none';
    const strictProviders = new Set(['bailian', 'deepseek', 'minimax']);
    return strictProviders.has(String(provider || '').toLowerCase()) ? 'strict' : 'loose';
  }

  function normalizeModelCaps(caps, source, modelId) {
    const toolsSupport = caps?.toolsSupport || (caps?.supportsTools === true ? 'supported' : caps?.supportsTools === false ? 'unsupported' : 'unknown');
    return {
      ...caps,
      label: caps?.label || modelId,
      normalizedModelId: normalizeModelId(modelId),
      family: caps?.family || detectModelFamily(modelId),
      toolsSupport,
      supportsTools: toolsSupport === 'supported',
      toolReliability: normalizeToolReliability(caps?.toolReliability, { toolsSupport, provider: caps?.provider }),
      capabilitySource: source,
    };
  }

  function isRegistryPrefixMatch(modelId, key) {
    if (modelId === key) return true;
    return modelId.startsWith(`${key}-`) || modelId.startsWith(`${key}/`);
  }

  function getModelCaps(modelId) {
    const candidates = buildModelIdCandidates(modelId);
    for (const candidate of candidates) {
      if (MODEL_REGISTRY[candidate]) return normalizeModelCaps(MODEL_REGISTRY[candidate], 'registry_exact', modelId);
    }
    if (MODEL_REGISTRY[modelId]) return normalizeModelCaps(MODEL_REGISTRY[modelId], 'registry_exact', modelId);
    for (const [key, caps] of Object.entries(MODEL_REGISTRY)) {
      for (const candidate of candidates) {
        if (isRegistryPrefixMatch(candidate, key)) {
          return normalizeModelCaps({ ...caps, label: modelId }, 'registry_prefix', modelId);
        }
      }
    }
    return normalizeModelCaps({
      provider: 'unknown',
      label: modelId,
      toolsSupport: 'unknown',
      supportsTools: false,
      supportsStreamOptions: false,
      supportsThinking: false,
      thinkingFormat: null,
      maxTokens: 4096,
    }, 'fallback_unknown', modelId);
  }

  function loadAvailableModels() {
    const cfg = loadOpenClawJson();
    const providers = cfg?.models?.providers || {};
    const bailian = providers.bailian || {};
    const deepseek = providers.deepseek || {};
    const models = [];
    for (const model of (bailian.models || [])) {
      if (model?.id) models.push({ id: model.id, provider: 'bailian' });
    }
    for (const model of (deepseek.models || [])) {
      if (model?.id) models.push({ id: model.id, provider: 'deepseek' });
    }
    if (models.length === 0) {
      return [
        { id: 'qwen3.5-plus', provider: 'bailian' },
        { id: 'qwen3-max-2026-01-23', provider: 'bailian' },
        { id: 'qwen3-coder-next', provider: 'bailian' },
        { id: 'qwen3-coder-plus', provider: 'bailian' },
        { id: 'kimi-k2.6', provider: 'bailian' },
        { id: 'kimi-k2.5', provider: 'bailian' },
        { id: 'MiniMax-M2.5', provider: 'bailian' },
        { id: 'glm-5', provider: 'bailian' },
        { id: 'glm-4.7', provider: 'bailian' },
        { id: 'deepseek-v4-flash', provider: 'deepseek' },
        { id: 'deepseek-v4-pro', provider: 'deepseek' },
        { id: 'deepseek-chat', provider: 'deepseek' },
      ];
    }
    return models;
  }

  return {
    MODEL_REGISTRY,
    detectModelFamily,
    getModelCaps,
    loadAvailableModels,
    normalizeModelId,
  };
}

module.exports = {
  createModelRegistryHelpers,
  MODEL_REGISTRY,
};
