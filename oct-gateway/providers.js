/**
 * AI 服务商预设注册表 — 市场化改造
 * 每个服务商声明：baseUrl、模型列表、能力（tools/thinking/stream_options）
 */

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
  },

  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    keyLink: 'https://platform.deepseek.com/',
    keyEnvVars: ['DEEPSEEK_API_KEY'],
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat',     label: 'DeepSeek Chat（通用）',     tools: true,  thinking: false },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner（推理）', tools: false, thinking: true  },
    ],
    supportsStreamOptions: false,
  },

  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    keyLink: 'https://cloud.siliconflow.cn/',
    keyEnvVars: ['SILICONFLOW_API_KEY', 'DASHSCOPE_API_KEY'],
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
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    keyLink: 'https://platform.moonshot.cn/',
    keyEnvVars: ['MOONSHOT_API_KEY', 'DASHSCOPE_API_KEY'],
    defaultModel: 'moonshot-v1-8k',
    models: [
      { id: 'moonshot-v1-8k',    label: 'Moonshot 8K',   tools: true, thinking: false },
      { id: 'moonshot-v1-32k',   label: 'Moonshot 32K',  tools: true, thinking: false },
      { id: 'moonshot-v1-128k',  label: 'Moonshot 128K', tools: true, thinking: false },
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
    keyLink: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
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

module.exports = { PROVIDERS };
