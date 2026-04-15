import React from 'react'
import { CapabilityCards } from './CapabilityCards'
import './onboarding.css'

interface Props {
  onCardClick: (prompt: string, capabilityId: string) => void
  onSkip: () => void
}

export const WelcomeHero: React.FC<Props> = ({ onCardClick, onSkip }) => {
  const handleCardClick = (prompt: string, capabilityId: string) => {
    console.log('[oct] welcome card click', { prompt, capabilityId })
    onCardClick(prompt, capabilityId)
  }

  return (
    <div className="oct-welcome-hero">
      <div className="oct-welcome-brand">
        <div className="oct-welcome-logo">{'\u2726'} OCT</div>
        <div className="oct-welcome-tagline">
          你的桌面 AI 工作台,会自己跑腿
        </div>
      </div>

      <div className="oct-welcome-hint">点一下试试 {'\u2193'}</div>

      <CapabilityCards onCardClick={handleCardClick} />

      <button
        className="oct-welcome-skip"
        onClick={onSkip}
        type="button"
      >
        跳过,直接开聊
      </button>
    </div>
  )
}
