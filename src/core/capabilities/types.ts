export type CapabilityId =
  | 'chat'
  | 'chat_vision'
  | 'image_gen'
  | 'music_gen'
  | 'canvas'
  | 'background_task'
  | 'web_search'
  | 'tool_exec'
  | 'tts'
  | 'asr'
  | 'memory'

export type CapabilityStatus =
  | 'available'
  | 'missing_key'
  | 'incompatible'
  | 'degraded'
  | 'disabled'

export interface Capability {
  id: CapabilityId
  status: CapabilityStatus
  activeProvider?: string
  alternatives?: string[]
  reason?: string
  requirements?: string[]
}

export interface ProviderDefinition {
  id: string
  displayName: string
  capabilities: CapabilityId[]
  keyPattern?: RegExp
}

export interface UserKeyRecord {
  providerId: string
  maskedKey: string
  addedAt: number
}
