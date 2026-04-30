/**
 * AI 服务商预设注册表 — 市场化改造
 * 每个服务商声明：baseUrl、模型列表、能力（tools/thinking/stream_options）
 */

const TOOL_RELIABILITY_BY_PROVIDER = {
  bailian: 'strict',
  'bailian-coding': 'strict',
  deepseek: 'strict',
  moonshot: 'strict',
  openai: 'strict',
  minimax: 'strict',
  siliconflow: 'loose',
  groq: 'loose',
  newapi: 'loose',
  custom: 'loose',
  ollama: 'none',
};

function resolveDefaultToolReliability(providerId) {
  return TOOL_RELIABILITY_BY_PROVIDER[providerId] || 'loose';
}

function withToolReliability(providerId, models) {
  return (models || []).map((model) => {
    if (!model || model.tools !== true) return model;
    return {
      ...model,
      toolReliability: model.toolReliability || resolveDefaultToolReliability(providerId),
    };
  });
}

const PROVIDERS = {
  bailian: {
    id: 'bailian',
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    keyLink: 'https://bailian.console.aliyun.com/',
    keyEnvVars: ['DASHSCOPE_API_KEY'],
    defaultModel: 'qwen-plus',
    models: [
      { id: 'qwen3.5-plus',  label: 'Qwen 3.5 Plus（最新，支持工具+思考）', tools: true,  thinking: true  },
      { id: 'qwen-plus',     label: 'Qwen Plus（稳定通用）',                tools: true,  thinking: false },
      { id: 'qwen-max',      label: 'Qwen Max（最强推理）',                 tools: true,  thinking: false },
      { id: 'qwen-turbo',    label: 'Qwen Turbo（快速便宜）',               tools: true,  thinking: false },
      { id: 'qwen-vl-max',   label: 'Qwen VL Max（图片理解）',              tools: false, thinking: false, vision: true },
    ],
    supportsStreamOptions: true,
    supportsToolChoiceFunction: true,
  },

  'bailian-coding': {
    id: 'bailian-coding',
    name: '阿里云百炼 Coding Plan',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    keyPlaceholder: 'sk-sp-xxxxxxxxxxxxxxxx',
    keyLink: 'https://bailian.console.aliyun.com/',
    keyEnvVars: ['DASHSCOPE_API_KEY'],
    defaultModel: 'qwen3.5-plus',
    models: [
      { id: 'qwen3.5-plus',       label: 'Qwen 3.5 Plus（推荐）',        tools: true,  thinking: true  },
      { id: 'qwen3-max-2026-01-23', label: 'Qwen 3 Max（最强推理）',     tools: true,  thinking: false },
      { id: 'qwen3-coder-next',   label: 'Qwen 3 Coder Next（代码）',   tools: true,  thinking: false },
      { id: 'qwen3-coder-plus',   label: 'Qwen 3 Coder Plus（代码）',   tools: true,  thinking: false },
      { id: 'kimi-k2.5',         label: 'Kimi K2.5（月之暗面）',        tools: true,  thinking: false },
      { id: 'MiniMax-M2.5',      label: 'MiniMax M2.5',                 tools: true,  thinking: false },
      { id: 'glm-5',             label: 'GLM 5（智谱）',                tools: true,  thinking: false },
      { id: 'glm-4.7',           label: 'GLM 4.7（智谱）',              tools: true,  thinking: false },
      { id: 'deepseek-v3',       label: 'DeepSeek V3（不支持工具）',    tools: false, thinking: false },
      { id: 'deepseek-r1',       label: 'DeepSeek R1（深度推理）',      tools: false, thinking: true  },
    ],
    supportsStreamOptions: true,
    supportsToolChoiceFunction: true,
  },

  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    keyLink: 'https://platform.deepseek.com/',
    keyEnvVars: ['DEEPSEEK_API_KEY'],
    defaultModel: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash（通用，推荐）', tools: true,  thinking: false },
      { id: 'deepseek-v4-pro',   label: 'DeepSeek V4 Pro（深度推理）',    tools: false, thinking: true  },
      // 以下旧模型将于 2026/07/24 弃用，仅作兼容保留
      { id: 'deepseek-chat',     label: 'DeepSeek Chat（旧版）',         tools: true,  thinking: false },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner（旧版）',     tools: false, thinking: true  },
    ],
    supportsStreamOptions: false,
  },

  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    keyLink: 'https://cloud.siliconflow.cn/',
    // 与设置面板一致：连接页「API Key」写入 DASHSCOPE_API_KEY；若仍优先读 SILICONFLOW_API_KEY，
    // 用户 config 里残留的旧 SILICONFLOW 值会覆盖新保存的 Key，导致 401。
    keyEnvVars: ['DASHSCOPE_API_KEY', 'SILICONFLOW_API_KEY'],
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    models: [
      { id: 'Qwen/Qwen2.5-72B-Instruct',    label: 'Qwen 2.5 72B（免费）',      tools: true,  thinking: false },
      { id: 'deepseek-ai/DeepSeek-V3',      label: 'DeepSeek V3',              tools: false, thinking: false },
      { id: 'deepseek-ai/DeepSeek-R1',      label: 'DeepSeek R1（推理）',       tools: false, thinking: true  },
      { id: 'Pro/Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B（免费快速）',   tools: true,  thinking: false },
    ],
    supportsStreamOptions: true,
  },

  moonshot: {
    id: 'moonshot',
    name: 'Kimi 开放平台',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    keyLink: 'https://platform.kimi.com/',
    keyEnvVars: ['MOONSHOT_API_KEY'],
    defaultModel: 'kimi-k2.6',
    models: [
      { id: 'kimi-k2.6',                 label: 'Kimi K2.6（官方最新）',      tools: true, thinking: false, vision: true },
      { id: 'kimi-k2.5',                 label: 'Kimi K2.5（稳定）',         tools: true, thinking: false, vision: true },
      { id: 'kimi-k2-turbo-preview',     label: 'Kimi K2 Turbo（高速）',     tools: true, thinking: false },
      { id: 'kimi-k2-thinking',          label: 'Kimi K2 Thinking（长思考）', tools: true, thinking: false },
      { id: 'kimi-k2-thinking-turbo',    label: 'Kimi K2 Thinking Turbo',   tools: true, thinking: false },
      { id: 'moonshot-v1-8k',            label: 'Moonshot V1 8K（兼容）',    tools: true, thinking: false },
      { id: 'moonshot-v1-32k',           label: 'Moonshot V1 32K（兼容）',   tools: true, thinking: false },
      { id: 'moonshot-v1-128k',          label: 'Moonshot V1 128K（兼容）',  tools: true, thinking: false },
    ],
    supportsStreamOptions: false,
  },

  groq: {
    id: 'groq',
    name: 'Groq（免费极速）',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'gsk_xxxxxxxxxxxxxxxx',
    keyLink: 'https://console.groq.com/',
    keyEnvVars: ['GROQ_API_KEY', 'DASHSCOPE_API_KEY'],
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B（推荐）',  tools: true, thinking: false },
      { id: 'gemma2-9b-it',            label: 'Gemma2 9B',              tools: true, thinking: false },
      { id: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B',           tools: true, thinking: false },
    ],
    supportsStreamOptions: false,
  },

  openai: {
    id: 'openai',
    name: 'OpenAI（需翻墙）',
    baseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    keyLink: 'https://platform.openai.com/',
    keyEnvVars: ['OPENAI_API_KEY', 'DASHSCOPE_API_KEY'],
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o',      label: 'GPT-4o（推荐）',    tools: true,  thinking: false },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini（便宜）', tools: true, thinking: false },
      { id: 'o1',          label: 'O1（深度推理）',     tools: false, thinking: true  },
    ],
    supportsStreamOptions: true,
    supportsToolChoiceFunction: true,
  },

  newapi: {
    id: 'newapi',
    name: 'New API 外部分发网关',
    baseUrl: 'http://127.0.0.1:3000/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    keyLink: 'https://docs.newapi.ai/',
    keyEnvVars: ['NEWAPI_API_KEY'],
    defaultModel: '__custom__',
    models: [
      { id: '__custom__', label: '✏️ New API 模型 ID（后台渠道模型名）', tools: true, thinking: false, custom: true },
      { id: 'qwen-plus', label: 'qwen-plus（百炼｜稳定通用）', tools: true, thinking: false },
      { id: 'qwen-turbo', label: 'qwen-turbo（百炼｜低延迟）', tools: true, thinking: false },
      { id: 'qwen-max', label: 'qwen-max（百炼｜高质量）', tools: true, thinking: false },
      { id: 'qwen3.5-plus', label: 'qwen3.5-plus（百炼｜新一代通用）', tools: true, thinking: false },
      { id: 'qwen3.6-flash-2026-04-16', label: 'qwen3.6-flash-2026-04-16（百炼｜高速）', tools: true, thinking: false },
      { id: 'qwen3.6-plus-2026-04-02', label: 'qwen3.6-plus-2026-04-02（百炼｜通用增强）', tools: true, thinking: false },
      { id: 'qwen3-coder-plus-2025-09-23', label: 'qwen3-coder-plus-2025-09-23（百炼｜代码）', tools: true, thinking: false },
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash（百炼｜快速）', tools: true, thinking: false },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro（百炼｜高质量）', tools: true, thinking: false },
      { id: 'doubao-seed-2-0-lite-260215', label: 'doubao-seed-2-0-lite-260215（火山｜高速）', tools: true, thinking: false },
      { id: 'doubao-seed-2-0-pro-260215', label: 'doubao-seed-2-0-pro-260215（火山｜高质量）', tools: true, thinking: false },
      { id: 'doubao-1-5-lite-32k-250115', label: 'doubao-1-5-lite-32k-250115（火山｜稳定）', tools: true, thinking: false },
      { id: 'doubao-1-5-pro-32k-250115', label: 'doubao-1-5-pro-32k-250115（火山｜稳定增强）', tools: true, thinking: false },
    ],
    supportsStreamOptions: true,
    allowCustomModel: true,
  },

  ollama: {
    id: 'ollama',
    name: 'Ollama 本地（完全离线免费）',
    baseUrl: 'http://localhost:11434/v1',
    keyPlaceholder: 'ollama',
    keyLink: 'https://ollama.com/',
    keyEnvVars: [],
    defaultModel: 'qwen2.5:7b',
    models: [],  // 动态获取
    supportsStreamOptions: false,
    fixedApiKey: 'ollama',
  },

  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    keyPlaceholder: 'sk-cp-xxxxxxxxxxxxxxxx',
    keyLink: 'https://platform.minimaxi.com/docs/token-plan/intro',
    keyEnvVars: ['MINIMAX_API_KEY', 'DASHSCOPE_API_KEY'],
    defaultModel: 'MiniMax-M2.7',
    models: [
      { id: 'MiniMax-M2.7',           label: 'MiniMax M2.7（最新，自我迭代）',        tools: true,  thinking: false },
      { id: 'MiniMax-M2.7-highspeed', label: 'MiniMax M2.7 极速版（100tps）',        tools: true,  thinking: false },
      { id: 'MiniMax-M2.5',           label: 'MiniMax M2.5（顶尖性能）',             tools: true,  thinking: false },
      { id: 'MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 极速版（100tps）',        tools: true,  thinking: false },
      { id: 'MiniMax-M2.1',           label: 'MiniMax M2.1（多语言编程）',           tools: true,  thinking: false },
      { id: 'MiniMax-M2.1-highspeed', label: 'MiniMax M2.1 极速版（100tps）',        tools: true,  thinking: false },
      { id: 'MiniMax-M2',             label: 'MiniMax M2（高效编码）',               tools: true,  thinking: false },
    ],
    supportsStreamOptions: true,
  },

  /**
   * Google Gemini：默认走 Vertex AI 原生 SDK（@google/genai）。
   * - Key 格式：AQ.xxxx（Vertex API Key / Express Mode API Key），也支持 Vertex 标准项目认证
   * - Base URL 主要用于解析项目与区域：
   *   https://aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/endpoints/openapi
   * - 若显式设置 GOOGLE_API_MODE=openai_compat，可退回旧的 OpenAI 兼容层
   * @see https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart?usertype=apikey
   */
  google: {
    id: 'google',
    name: 'Google Gemini（Vertex AI 原生）',
    baseUrl: 'https://aiplatform.googleapis.com/v1beta1/projects/gemini-key-493216/locations/us-central1/endpoints/openapi',
    keyPlaceholder: 'AQ.xxxxxxxxxxxxxxxxxx（Vertex AI API Key）',
    keyLink: 'https://console.cloud.google.com/vertex-ai/studio/settings/api-keys',
    keyEnvVars: ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'],
    defaultModel: 'google/gemini-2.5-flash',
    models: [
      { id: 'google/gemini-2.5-flash',           label: 'Gemini 2.5 Flash（推荐）', tools: false, thinking: true },
      { id: 'google/gemini-2.5-flash-lite',      label: 'Gemini 2.5 Flash-Lite（低延迟）', tools: false, thinking: true },
      { id: 'google/gemini-2.5-pro',             label: 'Gemini 2.5 Pro（深度推理）', tools: false, thinking: true },
      { id: 'google/gemini-3-flash-preview',     label: 'Gemini 3 Flash（预览）', tools: false, thinking: true },
      { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite（预览）', tools: false, thinking: true },
      { id: 'google/gemini-3.1-pro-preview',     label: 'Gemini 3.1 Pro（预览）', tools: false, thinking: true },
      { id: 'google/gemini-2.0-flash',           label: 'Gemini 2.0 Flash（兼容）', tools: false, thinking: false },
      { id: 'google/gemini-2.0-flash-lite',      label: 'Gemini 2.0 Flash-Lite（低成本）', tools: false, thinking: false },
      { id: '__custom__', label: '✏️ 自定义模型 ID', tools: false, thinking: false, custom: true },
    ],
    supportsStreamOptions: false,
    allowCustomModel: true,
  },

  custom: {
    id: 'custom',
    name: '自定义 OpenAI 兼容服务',
    baseUrl: '',
    keyPlaceholder: 'your-api-key',
    keyLink: '',
    keyEnvVars: ['CUSTOM_API_KEY', 'DASHSCOPE_API_KEY'],
    defaultModel: 'gpt-3.5-turbo',
    models: [
      { id: '__custom__', label: '✏️ 自定义模型（手动输入）', tools: true, thinking: false, custom: true },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', tools: true, thinking: false },
      { id: 'gpt-4', label: 'GPT-4', tools: true, thinking: false },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', tools: true, thinking: false },
      { id: 'claude-3-sonnet', label: 'Claude 3 Sonnet', tools: true, thinking: false },
      { id: 'claude-3-opus', label: 'Claude 3 Opus', tools: true, thinking: false },
      { id: 'gemini-pro', label: 'Gemini Pro', tools: true, thinking: false },
    ],
    supportsStreamOptions: true,
    allowCustomModel: true, // 允许自定义模型名称
  },
};

for (const [providerId, provider] of Object.entries(PROVIDERS)) {
  provider.models = withToolReliability(providerId, provider.models);
}

module.exports = { PROVIDERS };
