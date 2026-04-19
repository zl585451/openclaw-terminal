import { useState, useEffect, useMemo, useCallback } from 'react'
import { Capability, CapabilityId, UserKeyRecord } from '../core/capabilities/types'
import { resolveCapabilities } from '../core/capabilities/resolver'

const STORAGE_KEY_METADATA = 'oct.capabilities.userKeys'
const STORAGE_KEY_SECRETS = 'oct.capabilities.secrets'

function loadUserKeys(): UserKeyRecord[] {
  try { const raw = localStorage.getItem(STORAGE_KEY_METADATA); return raw ? JSON.parse(raw) as UserKeyRecord[] : [] } catch { return [] }
}
function saveUserKeys(keys: UserKeyRecord[]) { localStorage.setItem(STORAGE_KEY_METADATA, JSON.stringify(keys)) }
function loadSecret(providerId: string): string | null {
  try { const raw = localStorage.getItem(STORAGE_KEY_SECRETS); const s = raw ? JSON.parse(raw) as Record<string,string> : {}; return s[providerId] || null } catch { return null }
}
function saveSecret(providerId: string, key: string) {
  const raw = localStorage.getItem(STORAGE_KEY_SECRETS); const s = raw ? JSON.parse(raw) as Record<string,string> : {}; s[providerId] = key; localStorage.setItem(STORAGE_KEY_SECRETS, JSON.stringify(s))
}
function removeSecret(providerId: string) {
  const raw = localStorage.getItem(STORAGE_KEY_SECRETS); const s = raw ? JSON.parse(raw) as Record<string,string> : {}; delete s[providerId]; localStorage.setItem(STORAGE_KEY_SECRETS, JSON.stringify(s))
}

function hasValue(input: unknown): boolean {
  return typeof input === 'string' && input.trim().length > 0
}

function asBool(input: unknown): boolean {
  if (typeof input === 'boolean') return input
  if (typeof input !== 'string') return false
  const normalized = input.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

function computeImageGenReadyFromApiKeys(data: Record<string, unknown>): boolean {
  const provider = String(data.IMAGE_PROVIDER || 'minimax').trim().toLowerCase()
  const providerScopedKey =
    provider === 'openai'
      ? data.IMAGE_OPENAI_API_KEY
      : provider === 'siliconflow'
        ? data.IMAGE_SILICONFLOW_API_KEY
        : data.IMAGE_MINIMAX_API_KEY
  if (hasValue(providerScopedKey)) return true
  if (hasValue(data.IMAGE_API_KEY)) return true
  if (!asBool(data.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY)) return false
  if (provider === 'minimax') return hasValue(data.MINIMAX_API_KEY) || hasValue(data.DASHSCOPE_API_KEY)
  return hasValue(data.CUSTOM_API_KEY) || hasValue(data.DASHSCOPE_API_KEY) || hasValue(data.DEEPSEEK_API_KEY) || hasValue(data.MINIMAX_API_KEY)
}

function computeMusicGenReadyFromApiKeys(data: Record<string, unknown>): boolean {
  // 音乐链路采用严格判定：当前仅 MINIMAX_API_KEY 视为可用凭据。
  return hasValue(data.MINIMAX_API_KEY)
}

export function useCapabilities() {
  const [userKeys, setUserKeys] = useState<UserKeyRecord[]>(() => loadUserKeys())
  const [imageGenReady, setImageGenReady] = useState<boolean | null>(null)
  const [musicGenReady, setMusicGenReady] = useState<boolean | null>(null)

  const refreshImageCapability = useCallback(async () => {
    try {
      const result = await (window as any).electronAPI?.getApiKeys?.()
      const data = (result?.data || {}) as Record<string, unknown>
      setImageGenReady(computeImageGenReadyFromApiKeys(data))
      setMusicGenReady(computeMusicGenReadyFromApiKeys(data))
    } catch {
      setImageGenReady(null)
      setMusicGenReady(null)
    }
  }, [])

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY_METADATA) setUserKeys(loadUserKeys()) }
    const handleCustom = () => {
      setUserKeys(loadUserKeys())
      void refreshImageCapability()
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('oct:capabilities-updated', handleCustom as EventListener)
    void refreshImageCapability()
    return () => { window.removeEventListener('storage', handleStorage); window.removeEventListener('oct:capabilities-updated', handleCustom as EventListener) }
  }, [refreshImageCapability])
  const capabilities = useMemo(() => {
    const resolved = resolveCapabilities(userKeys)

    if (imageGenReady !== null && imageGenReady) {
      resolved.set('image_gen', {
        id: 'image_gen',
        status: 'available',
        activeProvider: 'panel_config',
      })
    } else if (imageGenReady !== null) {
      resolved.set('image_gen', {
        id: 'image_gen',
        status: 'missing_key',
        reason: '需先在设置中完成生图配置',
      })
    }

    if (musicGenReady !== null && musicGenReady) {
      resolved.set('music_gen', {
        id: 'music_gen',
        status: 'available',
        activeProvider: 'minimax_config',
      })
    } else if (musicGenReady !== null) {
      resolved.set('music_gen', {
        id: 'music_gen',
        status: 'missing_key',
        reason: '需先在设置中配置 MINIMAX_API_KEY',
      })
    }

    return resolved
  }, [imageGenReady, musicGenReady, userKeys])
  const getCapability = useCallback((id: CapabilityId): Capability => capabilities.get(id) || { id, status: 'missing_key' }, [capabilities])
  const addUserKey = useCallback((providerId: string, key: string, maskedKey: string) => {
    const record: UserKeyRecord = { providerId, maskedKey, addedAt: Date.now() }
    const next = [...userKeys.filter(k => k.providerId !== providerId), record]
    saveUserKeys(next); saveSecret(providerId, key); setUserKeys(next)
    window.dispatchEvent(new CustomEvent('oct:capabilities-updated'))
  }, [userKeys])
  const removeUserKey = useCallback((providerId: string) => {
    const next = userKeys.filter(k => k.providerId !== providerId)
    saveUserKeys(next); removeSecret(providerId); setUserKeys(next)
    window.dispatchEvent(new CustomEvent('oct:capabilities-updated'))
  }, [userKeys])
  return { capabilities, getCapability, userKeys, addUserKey, removeUserKey, getSecretKey: loadSecret }
}
