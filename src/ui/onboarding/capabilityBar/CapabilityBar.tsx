import React, { useState } from 'react';
import { useCapabilities } from '../../../hooks/useCapabilities';
import { DEFAULT_CARDS, CardDef } from '../CapabilityCards';
import type { CapabilityId, CapabilityStatus } from '../../../core/capabilities/types';
import { CapabilityBoundarySheet } from './CapabilityBoundarySheet';
import './CapabilityBar.css';

interface Props {
  onCapabilityClick: (card: CardDef, status: CapabilityStatus) => void;
  onRequestSetup: (capabilityId: CapabilityId) => void;
  disabled?: boolean;
}

export const CapabilityBar: React.FC<Props> = ({ onCapabilityClick, onRequestSetup, disabled }) => {
  const { getCapability } = useCapabilities();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleClick = (card: CardDef) => {
    if (disabled) return;
    const cap = getCapability(card.capabilityId);
    if (cap.status === 'missing_key' && card.action.type === 'send_prompt') {
      onRequestSetup(card.capabilityId);
      return;
    }
    onCapabilityClick(card, cap.status);
  };

  return (
    <>
      <div className={`oct-cap-bar ${disabled ? 'is-disabled' : ''}`}>
        <div className="oct-cap-bar-prefix">我能帮你</div>
        <div className="oct-cap-bar-scroll">
          {DEFAULT_CARDS.map((card) => {
            const cap = getCapability(card.capabilityId);
            const isAvailable = cap.status === 'available';
            return (
              <button
                key={card.id}
                type="button"
                className={`oct-cap-chip ${isAvailable ? '' : 'is-locked'}`}
                onClick={() => handleClick(card)}
                disabled={disabled}
                title={isAvailable ? card.subtitle : `${card.title} · 需先配置`}
              >
                <span className="oct-cap-chip-icon">{card.icon}</span>
                <span>{card.title}</span>
                {!isAvailable && <span className="oct-cap-chip-lock">🔒</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="oct-cap-bar-help"
          onClick={() => setSheetOpen(true)}
          disabled={disabled}
          title="能做什么 / 不能做什么"
        >
          ?
        </button>
      </div>
      <CapabilityBoundarySheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
};
