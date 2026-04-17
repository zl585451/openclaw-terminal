import { Capability, CapabilityId, UserKeyRecord } from './types'
import { PROVIDERS, CAPABILITY_PRIORITY, COMPOSITE_CAPABILITIES } from './providers'

export function resolveCapabilities(userKeys: UserKeyRecord[]): Map<CapabilityId, Capability> {
  const result = new Map<CapabilityId, Capability>()
  const userProviderIds = new Set(userKeys.map(k => k.providerId))
  const allCapIds = new Set<CapabilityId>()
  PROVIDERS.forEach(p => p.capabilities.forEach(c => allCapIds.add(c)))
  Object.keys(COMPOSITE_CAPABILITIES).forEach(c => allCapIds.add(c as CapabilityId))
  allCapIds.add('memory')

  for (const capId of allCapIds) {
    if (capId in COMPOSITE_CAPABILITIES) continue
    if (capId === 'memory') { result.set('memory', { id: 'memory', status: 'available' }); continue }
    const providers = PROVIDERS.filter(p => p.capabilities.includes(capId) && userProviderIds.has(p.id))
    if (providers.length === 0) {
      result.set(capId, { id: capId, status: 'missing_key', requirements: PROVIDERS.filter(p => p.capabilities.includes(capId)).map(p => p.id) })
    } else {
      const priority = CAPABILITY_PRIORITY[capId] || []
      const sorted = [...providers].sort((a, b) => {
        const ai = priority.indexOf(a.id), bi = priority.indexOf(b.id)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
      result.set(capId, { id: capId, status: 'available', activeProvider: sorted[0].id, alternatives: sorted.slice(1).map(p => p.id) })
    }
  }

  for (const [capId, deps] of Object.entries(COMPOSITE_CAPABILITIES)) {
    const allDepsAvailable = deps.every(d => result.get(d)?.status === 'available')
    if (deps.length === 0 || allDepsAvailable) {
      result.set(capId as CapabilityId, { id: capId as CapabilityId, status: 'available' })
    } else {
      const reqs = deps.flatMap(d => result.get(d)?.requirements || [])
      result.set(capId as CapabilityId, { id: capId as CapabilityId, status: 'missing_key', reason: `需先开通: ${deps.join(', ')}`, requirements: [...new Set(reqs)] })
    }
  }
  return result
}

export function guessProviders(key: string): string[] {
  const trimmed = key.trim()
  return PROVIDERS.filter(p => p.keyPattern?.test(trimmed)).map(p => p.id)
}

export function maskKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '***'
  return `${trimmed.slice(0, Math.min(7, trimmed.length - 4))}***${trimmed.slice(-4)}`
}
