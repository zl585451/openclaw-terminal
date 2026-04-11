import React from 'react';
import { useSettings } from '../contexts/SettingsContext';

interface HeartbeatWaveProps {
  connected: boolean;
  pulse: boolean;
}

const HeartbeatWave: React.FC<HeartbeatWaveProps> = ({ connected, pulse }) => {
  const { settings } = useSettings();
  const assistantName = settings.aiName || 'OpenClaw';
  const dotColor = connected ? 'var(--status-success)' : 'var(--text-tertiary)';
  const lineColor = connected ? 'var(--accent-primary-muted)' : 'var(--border-subtle)';
  const statusText = connected ? `${assistantName} 在线 · 就绪` : `${assistantName} 离线 · 等待连接`;
  return (
    <div
      style={{
        height: '65px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '10px',
        padding: '0 12px',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: '1px',
          background: lineColor,
          overflow: 'visible',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: connected ? '72%' : '18%',
            top: '50%',
            width: pulse ? '16px' : '12px',
            height: pulse ? '16px' : '12px',
            transform: 'translate(-50%, -50%)',
            borderRadius: '999px',
            background: dotColor,
            boxShadow: connected ? '0 0 10px var(--accent-primary-glow)' : 'none',
            transition: 'left 0.35s ease, width 0.18s ease, height 0.18s ease',
            animation: connected ? 'pulse-dot 1.6s ease-in-out infinite' : 'none',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
          letterSpacing: '0.8px',
        }}
      >
        <span>{statusText}</span>
        <span style={{ color: connected ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}>
          {connected ? 'ACTIVE' : 'IDLE'}
        </span>
      </div>
    </div>
  );
};

export default HeartbeatWave;
