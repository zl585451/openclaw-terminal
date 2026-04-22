import type React from 'react';

export const documentWorkbenchStyles = {
  root: {
    display: 'flex',
    minHeight: '100%',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-base)',
  } as React.CSSProperties,

  sidebar: {
    width: '220px',
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle)',
    background: 'var(--bg-sidebar, #161b22)',
    overflow: 'auto',
    padding: '10px 0',
  } as React.CSSProperties,

  sidebarCollapsed: {
    width: '52px',
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle)',
    background: 'var(--bg-sidebar, #161b22)',
    overflow: 'hidden',
    padding: '10px 0',
  } as React.CSSProperties,

  sidebarTitle: {
    padding: '0 14px 10px',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  railButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '8px 0',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '12px',
    letterSpacing: '0.04em',
  } as React.CSSProperties,

  sidebarItem: (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: '13px',
    lineHeight: 1.45,
    color: active ? 'var(--accent-primary, #7EC8E3)' : 'var(--text-secondary)',
    background: active ? 'var(--accent-primary-muted, rgba(126,200,227,0.12))' : 'transparent',
    borderLeft: active ? '2px solid var(--accent-primary, #7EC8E3)' : '2px solid transparent',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),

  contentShell: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,

  topbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'rgba(255,255,255,0.01)',
    flexShrink: 0,
  } as React.CSSProperties,

  topbarButton: (active: boolean): React.CSSProperties => ({
    border: '1px solid var(--border-subtle)',
    borderRadius: '999px',
    background: active ? 'var(--accent-primary-muted, rgba(126,200,227,0.12))' : 'transparent',
    color: active ? 'var(--accent-primary, #7EC8E3)' : 'var(--text-secondary)',
    padding: '5px 10px',
    fontSize: '12px',
    cursor: 'pointer',
  }),

  topbarTitle: {
    fontSize: '12px',
    color: 'var(--text-tertiary)',
    marginLeft: 'auto',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,

  section: {
    padding: '28px 32px 8px',
  } as React.CSSProperties,

  sectionTitle: {
    margin: '0 0 18px',
    fontSize: '20px',
    lineHeight: 1.35,
    color: 'var(--text-primary)',
    fontWeight: 700,
    letterSpacing: '0.01em',
    borderBottom: '1px solid var(--border-subtle)',
    paddingBottom: '10px',
  } as React.CSSProperties,

  reader: {
    maxWidth: '860px',
    margin: '0 auto',
    width: '100%',
    overflow: 'auto',
    height: '100%',
  } as React.CSSProperties,

  aside: {
    width: '220px',
    flexShrink: 0,
    borderLeft: '1px solid var(--border-subtle)',
    background: 'var(--bg-sidebar, #161b22)',
    overflow: 'auto',
    padding: '10px 0',
  } as React.CSSProperties,

  asideCollapsed: {
    width: '52px',
    flexShrink: 0,
    borderLeft: '1px solid var(--border-subtle)',
    background: 'var(--bg-sidebar, #161b22)',
    overflow: 'hidden',
    padding: '10px 0',
  } as React.CSSProperties,

  asideBlock: {
    padding: '0 14px 14px',
  } as React.CSSProperties,

  asideTitle: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase' as const,
    marginBottom: '10px',
  } as React.CSSProperties,

  characterItem: (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '7px 0',
    background: 'transparent',
    border: 'none',
    color: active ? 'var(--accent-primary, #7EC8E3)' : 'var(--text-secondary)',
    cursor: 'pointer',
    textAlign: 'left' as const,
  }),

  characterDot: (color: string): React.CSSProperties => ({
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
    boxShadow: `0 0 0 1px ${color}33`,
  }),

  characterName: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '13px',
  } as React.CSSProperties,

  characterCount: {
    fontSize: '11px',
    color: 'var(--text-tertiary)',
    flexShrink: 0,
  } as React.CSSProperties,

  emptyText: {
    fontSize: '12px',
    lineHeight: 1.6,
    color: 'var(--text-tertiary)',
  } as React.CSSProperties,

  chapterMeta: {
    marginTop: '10px',
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
  } as React.CSSProperties,

  chapterMetaChip: {
    border: '1px solid var(--border-subtle)',
    borderRadius: '999px',
    padding: '3px 8px',
    fontSize: '11px',
    color: 'var(--text-tertiary)',
    background: 'rgba(255,255,255,0.02)',
  } as React.CSSProperties,

  sectionEmpty: {
    color: 'var(--text-tertiary)',
    fontSize: '14px',
    lineHeight: 1.8,
  } as React.CSSProperties,
} as const;
