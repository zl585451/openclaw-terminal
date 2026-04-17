import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CapabilityId } from '../../core/capabilities/types'
import { guessProviders, maskKey } from '../../core/capabilities/resolver'
import { PROVIDERS } from '../../core/capabilities/providers'
import { useCapabilities } from '../../hooks/useCapabilities'

interface Props { capabilityId: CapabilityId | null; onClose: () => void; onSetupDone?: () => void }

const CAP_NAME: Record<string, string> = {
  chat:'对话', chat_vision:'看图', image_gen:'生图', canvas:'画布',
  background_task:'后台任务', web_search:'联网搜索', music_gen:'音乐生成', tts:'语音合成', asr:'语音识别',
}

export const CapabilitySetupDrawer: React.FC<Props> = ({ capabilityId, onClose, onSetupDone }) => {
  const { addUserKey } = useCapabilities()
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState('')
  const providersForCap = useMemo(() => capabilityId ? PROVIDERS.filter(p => p.capabilities.includes(capabilityId)) : [], [capabilityId])
  const guessed = useMemo(() => keyInput.trim() ? guessProviders(keyInput) : [], [keyInput])

  useEffect(() => {
    setKeyInput('')
    setError('')
  }, [capabilityId])

  const handleSubmit = () => {
    const key = keyInput.trim()
    if (!key) { setError('请粘贴一个 Key'); return }
    const matched = guessed.find(pid => providersForCap.some(p => p.id === pid)) || guessed[0]
    if (!matched) { setError('暂时识别不出这个 Key 属于哪家服务,可先在"高级设置"里手动选择'); return }
    addUserKey(matched, key, maskKey(key))
    onSetupDone?.(); onClose()
  }

  if (!capabilityId || typeof document === 'undefined') return null

  const modal = (
    <div className="oct-drawer-backdrop" onClick={onClose} role="presentation">
      <div className="oct-drawer" role="dialog" aria-modal="true" aria-labelledby="oct-cap-drawer-title" onClick={e => e.stopPropagation()}>
        <div className="oct-drawer-header">
          <div id="oct-cap-drawer-title" className="oct-drawer-title">开启「{CAP_NAME[capabilityId] || capabilityId}」能力</div>
          <button type="button" className="oct-drawer-close" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="oct-drawer-body">
          <div className="oct-drawer-hint">粘贴任意一家的 Key，OCT 会自动识别:</div>
          <textarea className="oct-drawer-input" placeholder="sk-..." value={keyInput}
            onChange={e => { setKeyInput(e.target.value); setError('') }} rows={3} autoFocus />
          {guessed.length > 0 && <div className="oct-drawer-detected">已识别: {guessed.map(pid => PROVIDERS.find(p => p.id === pid)?.displayName).filter(Boolean).join(' / ')}</div>}
          {error && <div className="oct-drawer-error">{error}</div>}
          <div className="oct-drawer-supported">{'\u{1F4A1}'} 支持: {providersForCap.map(p => p.displayName).join(' / ')}</div>
        </div>
        <div className="oct-drawer-footer">
          <button type="button" className="oct-btn-secondary" onClick={onClose}>取消</button>
          <button type="button" className="oct-btn-primary" onClick={handleSubmit}>确认</button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
