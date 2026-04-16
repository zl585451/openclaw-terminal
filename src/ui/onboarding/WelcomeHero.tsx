import React, { useState } from 'react'
import { CapabilityCards } from './CapabilityCards'
import { CapabilitySetupDrawer } from './CapabilitySetupDrawer'
import { CapabilityStatusBar } from './CapabilityStatusBar'
import { CapabilityId } from '../../core/capabilities/types'
import './onboarding.css'

interface Props { onSend: (prompt: string) => void; onSkip: () => void }

export const WelcomeHero: React.FC<Props> = ({ onSend, onSkip }) => {
  const [setupTarget, setSetupTarget] = useState<CapabilityId | null>(null)
  return (
    <>
      <div className="oct-welcome-hero">
        <div className="oct-welcome-brand">
          <div className="oct-welcome-logo">{'\u2726'} OCT</div>
          <div className="oct-welcome-tagline">你的桌面 AI 工作台,会自己跑腿</div>
        </div>
        <div className="oct-welcome-hint">点一下试试 {'\u2193'}</div>
        <CapabilityStatusBar onRequestSetup={setSetupTarget} />
        <CapabilityCards onSend={onSend} onRequestSetup={(capId) => setSetupTarget(capId)} />
        <button className="oct-welcome-skip" onClick={onSkip} type="button">跳过,直接开聊</button>
      </div>
      <CapabilitySetupDrawer capabilityId={setupTarget} onClose={() => setSetupTarget(null)} />
    </>
  )
}
