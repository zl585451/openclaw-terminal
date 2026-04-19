import { ProviderDefinition, CapabilityId } from './types'

export const PROVIDERS: ProviderDefinition[] = [
  { id: 'anthropic', displayName: 'Anthropic', capabilities: ['chat', 'chat_vision', 'tool_exec'], keyPattern: /^sk-ant-/ },
  { id: 'openai', displayName: 'OpenAI', capabilities: ['chat', 'chat_vision', 'image_gen', 'tool_exec', 'tts'], keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/ },
  { id: 'minimax', displayName: 'MiniMax', capabilities: ['chat', 'chat_vision', 'image_gen', 'music_gen', 'tts'], keyPattern: /^eyJ[A-Za-z0-9_-]+\./ },
  { id: 'siliconflow', displayName: 'SiliconFlow', capabilities: ['chat', 'chat_vision', 'image_gen'], keyPattern: /^sk-[a-z]{20,}$/i },
  { id: 'dashscope', displayName: '阿里云百炼', capabilities: ['chat', 'chat_vision', 'image_gen'], keyPattern: /^sk-[a-f0-9]{32,}$/ },
  { id: 'tavily', displayName: 'Tavily', capabilities: ['web_search'], keyPattern: /^tvly-/ },
]

export const CAPABILITY_PRIORITY: Record<string, string[]> = {
  chat:        ['anthropic', 'openai', 'dashscope', 'minimax', 'siliconflow'],
  chat_vision: ['anthropic', 'openai', 'dashscope', 'minimax', 'siliconflow'],
  image_gen:   ['minimax', 'openai', 'siliconflow', 'dashscope'],
  music_gen:   ['minimax'],
  web_search:  ['tavily'],
  tts:         ['minimax', 'openai'],
  tool_exec:   ['anthropic', 'openai'],
}

export const COMPOSITE_CAPABILITIES: Record<string, CapabilityId[]> = {
  canvas:          ['chat'],
  background_task: ['chat', 'tool_exec'],
  memory:          [],
}
