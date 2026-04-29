import React from 'react';

export interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({ visible, onClick }) => {
  if (!visible) return null;
  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: '90px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 0',
        cursor: 'pointer',
        gap: '2px',
        zIndex: 10,
        pointerEvents: 'auto',
      }}
    >
      {[0, 1, 2].map((i) => (
        <svg key={i} width="28" height="16" viewBox="0 0 28 16" style={{
          display: 'block',
          animation: 'chevronGlow 1.4s ease-in-out infinite',
          animationDelay: `${i * 0.2}s`,
          filter: `drop-shadow(0 0 ${4 + i * 2}px var(--accent-primary-glow))`,
        }}>
          <polyline
            points="2,2 14,13 26,2"
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  );
};
