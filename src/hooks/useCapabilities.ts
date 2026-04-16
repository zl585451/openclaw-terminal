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

export function useCapabilities() {
  const [userKeys, setUserKeys] = useState<UserKeyRecord[]>(() => loadUserKeys())
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY_METADATA) setUserKeys(loadUserKeys()) }
    const handleCustom = () => setUserKeys(loadUserKeys())
    window.addEventListener('storage', handleStorage)
    window.addEventListener('oct:capabilities-updated', handleCustom as EventListener)
    return () => { window.removeEventListener('storage', handleStorage); window.removeEventListener('oct:capabilities-updated', handleCustom as EventListener) }
  }, [])
  const capabilities = useMemo(() => resolveCapabilities(userKeys), [userKeys])
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
