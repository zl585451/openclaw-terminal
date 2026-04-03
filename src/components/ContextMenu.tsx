import { memo } from 'react';

export interface ContextMenuState {
  x: number;
  y: number;
  msgId: number;
  text: string;
}

interface ContextMenuProps {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  onCopy: (text: string) => void;
  onResend: (text: string) => void;
  onDelete: (msgId: number) => void;
}

export const ContextMenu = memo(function ContextMenu({
  contextMenu,
  onClose,
  onCopy,
  onResend,
  onDelete,
}: ContextMenuProps) {
  if (!contextMenu) return null;

  const items = [
    {
      icon: '⎘',
      label: '复制消息',
      action: () => onCopy(contextMenu.text),
      danger: false,
    },
    {
      icon: '↺',
      label: '重新发送',
      action: () => { onResend(contextMenu.text); onClose(); },
      danger: false,
    },
    {
      icon: '✕',
      label: '删除消息',
      action: () => { onDelete(contextMenu.msgId); onClose(); },
      danger: true,
    },
  ];

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed',
          left: contextMenu.x,
          top: contextMenu.y,
          zIndex: 100,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-light)',
          borderRadius: '6px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
          minWidth: '160px',
        }}
      >
        {items.map((item) => (
          <div
            key={item.label}
            onClick={item.action}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 16px', cursor: 'pointer',
              color: item.danger ? 'var(--status-error)' : 'var(--text-primary)',
              fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? 'var(--status-error-bg)' : 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: '14px' }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
    </>
  );
});
