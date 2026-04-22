import type React from 'react';

export const scriptStyles = {
  root: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
    fontFamily: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei","Segoe UI",sans-serif',
    fontSize: '14px',
    lineHeight: '1.7',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    textRendering: 'optimizeLegibility',
  } as React.CSSProperties,

  sidebar: (collapsed: boolean): React.CSSProperties => ({
    width: collapsed ? '44px' : '210px',
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle)',
    overflow: 'auto',
    padding: '8px 0',
    background: 'var(--bg-sidebar, #161b22)',
    transition: 'width 0.18s ease',
  }),

  sidebarTitle: {
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    letterSpacing: '0.02em',
    borderBottom: '1px solid var(--border-subtle)',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
  } as React.CSSProperties,

  sidebarTitleText: {
    overflow: 'hidden',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
  } as React.CSSProperties,

  sidebarToggleBtn: {
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    lineHeight: 1,
    padding: '4px 6px',
    cursor: 'pointer',
    flexShrink: 0,
  } as React.CSSProperties,

  chapterItem: (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: active ? 600 : 500,
    letterSpacing: '0.01em',
    color: active ? 'var(--accent-primary, #7EC8E3)' : 'var(--text-secondary)',
    background: active ? 'var(--accent-primary-muted, rgba(126,200,227,0.12))' : 'transparent',
    borderLeft: active ? '2px solid var(--accent-primary, #7EC8E3)' : '2px solid transparent',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: '1.5',
  }),

  content: (fontSize: number): React.CSSProperties => ({
    flex: 1,
    overflow: 'auto',
    padding: '20px 28px',
    fontSize: `${fontSize}px`,
    lineHeight: 1.8,
  }),

  chapterTitle: (fontSize: number): React.CSSProperties => ({
    fontSize: `${Math.max(14, fontSize + 1)}px`,
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '0 0 16px 0',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border-subtle)',
  }),

  lineParagraph: {
    margin: '4px 0',
    padding: 0,
  } as React.CSSProperties,

  charName: (color: string): React.CSSProperties => ({
    color,
    fontWeight: 600,
    marginRight: '8px',
  }),

  charEmotion: (fontSize: number): React.CSSProperties => ({
    color: 'var(--text-tertiary)',
    fontSize: `${Math.max(12, fontSize - 2)}px`,
    flexShrink: 0,
  }),

  charContent: (color: string): React.CSSProperties => ({
    color,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  }),

  dialogueBody: {
    paddingLeft: '16px',
    marginTop: '1px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  } as React.CSSProperties,

  inlineAnnotation: (fontSize: number): React.CSSProperties => ({
    color: 'var(--text-tertiary)',
    fontSize: `${Math.max(12, fontSize - 2)}px`,
    fontWeight: 400,
  }),

  direction: (fontSize: number): React.CSSProperties => ({
    color: 'var(--text-tertiary)',
    fontStyle: 'italic',
    fontSize: `${Math.max(13, fontSize - 1)}px`,
    margin: '4px 0',
  }),

  text: {
    color: 'var(--text-secondary)',
    margin: '2px 0',
  } as React.CSSProperties,

  characterBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '8px 28px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-base)',
    fontFamily: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei","Segoe UI",sans-serif',
    lineHeight: 1.25,
  } as React.CSSProperties,

  characterBarLeft: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
    alignItems: 'center',
  } as React.CSSProperties,

  characterBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginLeft: 'auto',
    flexShrink: 0,
  } as React.CSSProperties,

  fontSizeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginRight: '4px',
  } as React.CSSProperties,

  fontSizeValue: {
    minWidth: '40px',
    textAlign: 'center' as const,
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  } as React.CSSProperties,

  formatStatusText: {
    fontSize: '12px',
    color: 'var(--text-tertiary)',
    maxWidth: '180px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,

  characterChipInteractive: (
    color: string,
    opts: { selected: boolean; dimmed: boolean; editing: boolean },
  ): React.CSSProperties => ({
    fontSize: '12px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    lineHeight: 1.25,
    padding: '4px 10px',
    borderRadius: '10px',
    border: `1px solid ${color}`,
    color,
    background: opts.selected ? `${color}2e` : `${color}18`,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none' as const,
    position: 'relative' as const,
    opacity: opts.dimmed ? 0.35 : 1,
    boxShadow: opts.editing ? `0 0 0 1px ${color}` : 'none',
    transition: 'opacity 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
  }),

  filterAllChip: (active: boolean): React.CSSProperties => ({
    fontSize: '12px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    lineHeight: 1.25,
    padding: '4px 10px',
    borderRadius: '10px',
    border: `1px solid ${active ? 'var(--accent-primary, #7EC8E3)' : 'var(--border-subtle)'}`,
    color: active ? 'var(--accent-primary, #7EC8E3)' : 'var(--text-secondary)',
    background: active ? 'var(--accent-primary-muted, rgba(126,200,227,0.15))' : 'transparent',
    cursor: 'pointer',
    userSelect: 'none' as const,
  }),

  colorPickerPopover: {
    position: 'absolute' as const,
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 20,
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 20px)',
    gap: '6px',
    padding: '8px',
    borderRadius: '8px',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-sidebar, #161b22)',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
  } as React.CSSProperties,

  colorOptionBtn: (color: string, selected: boolean): React.CSSProperties => ({
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: selected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.25)',
    background: color,
    padding: 0,
    cursor: 'pointer',
  }),

  polishTrigger: (top: number, left: number): React.CSSProperties => ({
    position: 'fixed',
    top,
    left,
    transform: 'translateX(-50%)',
    zIndex: 1200,
  }),

  polishButton: (disabled: boolean): React.CSSProperties => ({
    border: '1px solid var(--accent-primary, #7EC8E3)',
    borderRadius: '6px',
    background: 'var(--bg-sidebar, #161b22)',
    color: 'var(--accent-primary, #7EC8E3)',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.75 : 1,
  }),

  polishToolbarButton: (disabled: boolean): React.CSSProperties => ({
    border: '1px solid var(--accent-primary, #7EC8E3)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--accent-primary, #7EC8E3)',
    padding: '5px 11px',
    fontSize: '12px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    lineHeight: 1.25,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    whiteSpace: 'nowrap' as const,
  }),

  polishPanel: {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    width: '420px',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: '70vh',
    minWidth: '320px',
    minHeight: '180px',
    overflow: 'auto',
    background: 'var(--bg-sidebar, #161b22)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.35)',
    zIndex: 13050,
    padding: '12px',
    resize: 'both' as const,
    pointerEvents: 'auto' as const,
  } as React.CSSProperties,

  polishHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    color: 'var(--accent-primary, #7EC8E3)',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'move',
    userSelect: 'none' as const,
  } as React.CSSProperties,

  polishHeaderTitle: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  polishLabel: {
    color: 'var(--text-tertiary)',
    fontSize: '12px',
    marginTop: '8px',
  } as React.CSSProperties,

  polishText: {
    color: 'var(--text-primary)',
    fontSize: '13px',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  } as React.CSSProperties,

  polishActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
  } as React.CSSProperties,

  polishEditor: {
    width: '100%',
    minHeight: '120px',
    marginTop: '8px',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    background: 'var(--bg-base)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '13px',
    lineHeight: 1.6,
    padding: '8px 10px',
    resize: 'vertical' as const,
    outline: 'none',
  } as React.CSSProperties,

  polishActionBtn: {
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    padding: '5px 11px',
    fontSize: '12px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    lineHeight: 1.25,
    cursor: 'pointer',
  } as React.CSSProperties,
} as const;
