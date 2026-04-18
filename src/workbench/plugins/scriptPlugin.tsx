/**
 * scriptPlugin.tsx
 * 剧本渲染插件 —— 角色台词染色 + 章节导航 + 按章节分页（不一次渲染全文）
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_SCRIPT_COLORS,
  mergeCharacterColors,
  normalizeScriptText,
  parseScript,
  ScriptLine,
} from '../../utils/scriptParser';
import { exportScriptToText } from '../../utils/scriptExporter';
import { useWorkbench } from '../WorkbenchContext';
import type { WorkbenchRendererPlugin } from './types';
import type { WorkbenchDocument } from '../types';

// ─── 样式（内联，避免新增 CSS 文件） ────────────────────────────────────────

const styles = {
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
    color: 'var(--text-muted)',
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
    color: 'var(--text-muted)',
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
    color: 'var(--text-muted)',
    fontSize: `${Math.max(12, fontSize - 2)}px`,
    fontWeight: 400,
  }),

  direction: (fontSize: number): React.CSSProperties => ({
    color: 'var(--text-muted)',
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
    color: 'var(--text-muted)',
  } as React.CSSProperties,

  formatStatusText: {
    fontSize: '12px',
    color: 'var(--text-muted)',
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
    color: 'var(--text-muted)',
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

// ─── 内联括号拆分工具 ─────────────────────────────────────────────────────────

function splitDialogueContent(
  content: string,
): Array<{ text: string; isAnnotation: boolean }> {
  if (!content) return [];

  // 匹配全角/半角圆括号，允许较长说明文本；不跨行
  const re = /[（(]([^）)\n]+)[）)]/g;
  const segments: Array<{ text: string; isAnnotation: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index);
      if (before) segments.push({ text: before, isAnnotation: false });
    }
    segments.push({ text: match[0], isAnnotation: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const tail = content.slice(lastIndex);
    if (tail) segments.push({ text: tail, isAnnotation: false });
  }

  if (segments.length === 0) {
    segments.push({ text: content, isAnnotation: false });
  }

  return segments;
}

// ─── 单行渲染 ────────────────────────────────────────────────────────────────

function ScriptLineView({
  line,
  colorMap,
  fontSize,
}: {
  line: ScriptLine;
  colorMap: Record<string, string>;
  fontSize: number;
}) {
  if (line.type === 'blank') return <div style={{ height: '8px' }} />;

  if (line.type === 'dialogue' || line.type === 'narrator') {
    const displayName = line.character || '旁白';
    const color = colorMap[displayName] || 'var(--text-primary)';
    const contentToRender = line.content || '';
    const hasExplicitEmotion = !!line.emotion;
    const segments = splitDialogueContent(contentToRender);

    return (
      <div style={styles.lineParagraph}>
        <div>
          <span style={styles.charName(color)}>{displayName}：</span>
          {hasExplicitEmotion && (
            <span style={styles.inlineAnnotation(fontSize)}>（{line.emotion}）</span>
          )}
        </div>
        <div style={styles.dialogueBody}>
          {segments.map((seg, i) =>
            seg.isAnnotation ? (
              <span key={i} style={styles.inlineAnnotation(fontSize)}>{seg.text}</span>
            ) : (
              <span key={i} style={styles.charContent(color)}>{seg.text}</span>
            ),
          )}
        </div>
      </div>
    );
  }

  if (line.type === 'direction') {
    return <div style={styles.direction(fontSize)}>{line.raw.trim()}</div>;
  }

  if (line.type === 'chapter') {
    return null;
  }

  return <div style={styles.text}>{line.content || line.raw}</div>;
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

function ScriptViewer({ document }: { document: WorkbenchDocument }) {
  const workbench = useWorkbench();
  const parsed = useMemo(() => parseScript(document.content), [document.content]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [contentFontSize, setContentFontSize] = useState(16);
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
  const [selectedText, setSelectedText] = useState('');
  const [selectedLineRange, setSelectedLineRange] = useState<{ start: number; end: number } | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<{ top: number; left: number } | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [formatStatus, setFormatStatus] = useState('');
  const [polishDraft, setPolishDraft] = useState('');
  const [polishError, setPolishError] = useState<string | null>(null);
  const [isPolishPanelOpen, setIsPolishPanelOpen] = useState(false);
  const [replaceHistory, setReplaceHistory] = useState<Array<{ before: string; after: string }>>([]);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const pickerContainerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const polishPanelRef = useRef<HTMLDivElement | null>(null);
  const panelDragRef = useRef<{
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);

  const electronApi =
    typeof window !== 'undefined'
    ? (window as any).electronAPI
    : null;

  const effectiveColors = useMemo(
    () => mergeCharacterColors(parsed.characterColors, customColors),
    [parsed.characterColors, customColors],
  );

  useEffect(() => {
    setCustomColors({});
    setEditingCharacter(null);
    setSelectedCharacters(new Set());
    setSelectedText('');
    setSelectedLineRange(null);
    setSelectionPosition(null);
    setPolishDraft('');
    setPolishError(null);
    setReplaceHistory([]);
    setPanelPosition(null);
    setActiveIdx(0);
    setIsSidebarCollapsed(false);
    setContentFontSize(16);
  }, [document.id]);

  useEffect(() => {
    if (document.artifactType !== 'script') return;
    if (!document.draftCachePath) return;
    if (!electronApi?.saveScriptDraftCache) return;

    const timer = window.setTimeout(() => {
      void electronApi.saveScriptDraftCache({
        content: document.content,
        draftCachePath: document.draftCachePath,
        sourcePath: document.sourcePath,
        title: document.title,
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    document.id,
    document.content,
    document.title,
    document.sourcePath,
    document.draftCachePath,
    document.artifactType,
    electronApi,
  ]);

  const increaseContentFontSize = () => {
    setContentFontSize((prev) => Math.min(24, prev + 1));
  };

  const decreaseContentFontSize = () => {
    setContentFontSize((prev) => Math.max(13, prev - 1));
  };

  useEffect(() => {
    if (!editingCharacter) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (pickerContainerRef.current && !pickerContainerRef.current.contains(target)) {
        setEditingCharacter(null);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [editingCharacter]);

  const chapter = parsed.chapters[activeIdx];
  const toggleCharacterFilter = (name: string) => {
    setSelectedCharacters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const clearCharacterFilter = () => {
    setSelectedCharacters(new Set());
  };

  const isLineVisible = (line: ScriptLine): boolean => {
    if (selectedCharacters.size === 0) return true;
    if (line.type === 'dialogue') {
      return !!line.character && selectedCharacters.has(line.character);
    }
    return true;
  };

  const visibleLineEntries = chapter
    ? chapter.lines
      .map((line, chapterLineIndex) => ({ line, chapterLineIndex }))
      .filter(({ line }) => isLineVisible(line))
    : [];

  const updateTextSelection = () => {
    const root = contentRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) {
      setSelectedText('');
      setSelectedLineRange(null);
      setSelectionPosition(null);
      return;
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const inRoot =
      !!anchorNode
      && !!focusNode
      && root.contains(anchorNode)
      && root.contains(focusNode);
    if (!inRoot) {
      setSelectedText('');
      setSelectedLineRange(null);
      setSelectionPosition(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (selection.isCollapsed || text.length < 1) {
      setSelectedText('');
      setSelectedLineRange(null);
      setSelectionPosition(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const lineEls = Array.from(root.querySelectorAll('[data-script-line-index]')) as HTMLDivElement[];
    const hitIndices = lineEls
      .filter((el) => {
        try {
          return range.intersectsNode(el);
        } catch {
          return false;
        }
      })
      .map((el) => Number(el.dataset.scriptLineIndex))
      .filter((v) => Number.isFinite(v));

    if (hitIndices.length > 0) {
      setSelectedLineRange({
        start: Math.min(...hitIndices),
        end: Math.max(...hitIndices),
      });
    } else {
      setSelectedLineRange(null);
    }

    setSelectedText(text);
    setSelectionPosition({
      top: Math.max(8, rect.top - 36),
      left: rect.left + rect.width / 2,
    });
  };

  useEffect(() => {
    const onSelectionLikeEvent = () => {
      updateTextSelection();
    };

    globalThis.document.addEventListener('selectionchange', onSelectionLikeEvent);
    globalThis.document.addEventListener('mouseup', onSelectionLikeEvent);
    globalThis.document.addEventListener('keyup', onSelectionLikeEvent);

    return () => {
      globalThis.document.removeEventListener('selectionchange', onSelectionLikeEvent);
      globalThis.document.removeEventListener('mouseup', onSelectionLikeEvent);
      globalThis.document.removeEventListener('keyup', onSelectionLikeEvent);
    };
  }, [document.id, document.content, activeIdx, selectedCharacters, customColors]);

  const scheduleSelectionUpdate = () => {
    window.setTimeout(() => {
      updateTextSelection();
    }, 0);
  };

  const handleContentContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const root = contentRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) return;

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const inRoot =
      !!anchorNode
      && !!focusNode
      && root.contains(anchorNode)
      && root.contains(focusNode);
    if (!inRoot) return;

    const text = selection.toString().trim();
    if (!text) return;

    // 右键命中选中文本时，直接触发润色，规避浮动按钮显示不稳定
    event.preventDefault();
    event.stopPropagation();
    setSelectedText(text);
    const lineEls = Array.from(root.querySelectorAll('[data-script-line-index]')) as HTMLDivElement[];
    const hitIndices = lineEls
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return event.clientY >= rect.top && event.clientY <= rect.bottom;
      })
      .map((el) => Number(el.dataset.scriptLineIndex))
      .filter((v) => Number.isFinite(v));
    if (hitIndices.length > 0) {
      const index = hitIndices[0];
      setSelectedLineRange({ start: index, end: index });
    }
    setSelectionPosition({
      top: Math.max(8, event.clientY - 36),
      left: event.clientX,
    });
    void runPolish(text);
  };

  const runPolish = async (text: string) => {
    if (!text || isPolishing) return;
    setIsPolishing(true);
    setIsPolishPanelOpen(true);
    setPolishError(null);
    setPolishDraft('');

    try {
      const response = await fetch('http://127.0.0.1:18790/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          instruction: '请润色以下台词，保持角色语气和风格，使表达更生动自然。',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      const result = String(data?.result || '').trim();
      const finalResult = result || '（未返回润色结果）';
      setPolishDraft(finalResult);
    } catch (error) {
      setPolishError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPolishing(false);
    }
  };

  const handlePolish = async () => {
    if (!selectedText || isPolishing) return;
    await runPolish(selectedText);
  };

  const handleAIFormat = async () => {
    if (isFormatting) return;
    const raw = String(document.content || '');
    if (!raw.trim()) return;

    const localNormalized = normalizeScriptText(raw);
    const beforeParsed = parseScript(raw);
    const beforeChapterCount = beforeParsed.chapters.length;
    const chapterTitles = beforeParsed.chapters.map((c) => c.title).filter(Boolean);

    // 优先只格式化当前章节，减少耗时并降低误改范围
    const normalizedLines = localNormalized.split('\n');
    const trimmedTitles = beforeParsed.chapters.map((c) => c.title.trim());
    const chapterStarts: number[] = [];
    let searchFrom = 0;
    let chapterRange: { start: number; end: number } | null = null;

    for (const title of trimmedTitles) {
      const idx = normalizedLines.findIndex((line, i) => i >= searchFrom && line.trim() === title);
      if (idx < 0) {
        chapterStarts.length = 0;
        break;
      }
      chapterStarts.push(idx);
      searchFrom = idx + 1;
    }

    if (chapterStarts.length === trimmedTitles.length && chapterStarts.length > 0) {
      const start = chapterStarts[activeIdx] ?? 0;
      const nextStart = chapterStarts[activeIdx + 1];
      const end = typeof nextStart === 'number' ? (nextStart - 1) : (normalizedLines.length - 1);
      chapterRange = { start, end };
    }

    const formatSourceText = chapterRange
      ? normalizedLines.slice(chapterRange.start, chapterRange.end + 1).join('\n')
      : localNormalized;
    const formatChapterTitles = chapterRange && chapter ? [chapter.title] : chapterTitles;

    const normalizeTitle = (s: string) =>
      String(s || '')
        .replace(/[\s：:·・—\-（）()【】\[\]《》“”"'`]/g, '')
        .trim();

    const normalizeSemanticText = (s: string) =>
      String(s || '')
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, '')
        .toLowerCase();

    const diceSimilarity = (a: string, b: string): number => {
      if (a === b) return 1;
      if (!a.length || !b.length) return 0;
      if (a.length === 1 || b.length === 1) return a === b ? 1 : 0;

      const makeBigrams = (text: string) => {
        const map = new Map<string, number>();
        for (let i = 0; i < text.length - 1; i += 1) {
          const g = text.slice(i, i + 2);
          map.set(g, (map.get(g) || 0) + 1);
        }
        return map;
      };

      const aMap = makeBigrams(a);
      const bMap = makeBigrams(b);
      let overlap = 0;
      for (const [g, countA] of aMap.entries()) {
        const countB = bMap.get(g) || 0;
        overlap += Math.min(countA, countB);
      }
      const aSize = Math.max(0, a.length - 1);
      const bSize = Math.max(0, b.length - 1);
      return (2 * overlap) / (aSize + bSize);
    };

    const containsNonScriptPatterns = (text: string): boolean => {
      const patterns = [
        /^#{1,6}\s/m,          // markdown heading
        /^\s*[-*]\s+/m,        // bullet
        /^\s*\d+\.\s+/m,       // numbered list
        /```/,                 // code fence
        /推荐方案|我的建议|方案[A-ZＡ-Ｚ]/, // explanatory proposal text
      ];
      return patterns.some((re) => re.test(text));
    };

    setIsFormatting(true);
    setFormatStatus(chapterRange ? '当前章节格式化中...' : '全本格式化中...');
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      const response = await fetch('http://127.0.0.1:18790/api/script-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: formatSourceText,
          chapterTitles: formatChapterTitles,
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      const data = await response.json();
      if (!response.ok || !data?.success || !String(data?.result || '').trim()) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      const formatted = String(data.result).trim();
      if (!formatted) {
        throw new Error('AI 返回空内容');
      }

      let nextContent = formatted;
      if (chapterRange) {
        const safeSegment = formatted.split('\n');
        const before = normalizedLines.slice(0, chapterRange.start);
        const after = normalizedLines.slice(chapterRange.end + 1);
        nextContent = [...before, ...safeSegment, ...after].join('\n');
      }

      const afterParsed = parseScript(nextContent);
      // 章节保护：当前章格式化时，章节总数必须保持一致
      if (chapterRange && afterParsed.chapters.length !== beforeChapterCount) {
        throw new Error('AI 输出改变了章节结构，已拒绝覆盖');
      }
      // 全本兜底：不允许章节减少
      if (!chapterRange && beforeChapterCount > 1 && afterParsed.chapters.length < beforeChapterCount) {
        throw new Error('AI 输出导致章节减少，已拒绝覆盖');
      }
      // 当前章标题保护：索引对应章节标题应保持一致（忽略标点空白）
      if (chapterRange) {
        const beforeTitle = normalizeTitle(beforeParsed.chapters[activeIdx]?.title || '');
        const afterTitle = normalizeTitle(afterParsed.chapters[activeIdx]?.title || '');
        if (beforeTitle && afterTitle && beforeTitle !== afterTitle) {
          throw new Error('AI 输出改动了当前章节标题，已拒绝覆盖');
        }
      }
      // 结果清洁度保护：检测到方案/列表/代码块痕迹则拒绝应用
      if (containsNonScriptPatterns(formatted)) {
        throw new Error('AI 输出包含非剧本文本痕迹，已拒绝覆盖');
      }
      // 内容保真门禁：格式化不应改写正文语义
      const beforeSemantic = normalizeSemanticText(formatSourceText);
      const afterSemantic = normalizeSemanticText(formatted);
      const semanticScore = diceSimilarity(beforeSemantic, afterSemantic);
      if (semanticScore < 0.985) {
        throw new Error(`AI 输出改写正文内容（相似度 ${semanticScore.toFixed(3)}），已拒绝覆盖`);
      }
      workbench.updateDocument(document.id, { content: nextContent });
      setFormatStatus(chapterRange ? '当前章节格式化完成' : '全本格式化完成');
    } catch (error) {
      console.error('[ScriptFormat] format failed:', error);
      // 失败回退到本地规范化，至少保证稳定可用
      workbench.updateDocument(document.id, { content: localNormalized });
      setFormatStatus('AI 格式化失败，已回退为本地规范化');
    } finally {
      setIsFormatting(false);
      window.setTimeout(() => setFormatStatus(''), 2800);
    }
  };

  const handlePolishPanelDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-no-drag="true"]')) return;

    const panelEl = polishPanelRef.current;
    if (!panelEl) return;

    const rect = panelEl.getBoundingClientRect();
    panelDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
    };
    setPanelPosition({ left: rect.left, top: rect.top });
    event.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = panelDragRef.current;
      const panelEl = polishPanelRef.current;
      if (!drag || !panelEl) return;

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      const maxLeft = Math.max(8, window.innerWidth - panelEl.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - panelEl.offsetHeight - 8);
      const nextLeft = Math.min(maxLeft, Math.max(8, drag.originLeft + deltaX));
      const nextTop = Math.min(maxTop, Math.max(8, drag.originTop + deltaY));

      setPanelPosition({ left: nextLeft, top: nextTop });
    };

    const onMouseUp = () => {
      panelDragRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleApplyPolishToSource = () => {
    const draftToApply = polishDraft.trim();
    if (!draftToApply || !selectedText || polishError) return;
    const source = document.content;

    // 优先按“选中行块”定位，避免渲染文本与原文存在格式差异时 indexOf 失败
    if (chapter && selectedLineRange) {
      const { start, end } = selectedLineRange;
      if (
        Number.isInteger(start)
        && Number.isInteger(end)
        && start >= 0
        && end >= start
        && end < chapter.lines.length
      ) {
        const block = chapter.lines.slice(start, end + 1).map((l) => l.raw).join('\n');
        const blockIndex = source.indexOf(block);
        if (block && blockIndex >= 0) {
          const nextContent =
            source.slice(0, blockIndex)
            + draftToApply
            + source.slice(blockIndex + block.length);
          setReplaceHistory((prev) => [...prev, { before: source, after: nextContent }]);
          workbench.updateDocument(document.id, { content: nextContent });
          return;
        }
      }
    }

    const targetIndex = source.indexOf(selectedText);

    const locateCollapsedRange = (fullText: string, segment: string): { start: number; end: number } | null => {
      const query = segment.replace(/\s+/g, ' ').trim();
      if (!query) return null;

      let normalized = '';
      const map: number[] = [];
      let prevSpace = false;
      for (let i = 0; i < fullText.length; i += 1) {
        const ch = fullText[i];
        if (/\s/.test(ch)) {
          if (!prevSpace) {
            normalized += ' ';
            map.push(i);
            prevSpace = true;
          }
        } else {
          normalized += ch;
          map.push(i);
          prevSpace = false;
        }
      }

      const normalizedIndex = normalized.indexOf(query);
      if (normalizedIndex < 0) return null;
      const start = map[normalizedIndex];
      const endMapIdx = normalizedIndex + query.length - 1;
      const end = map[endMapIdx] + 1;
      return { start, end };
    };

    let replaceStart = targetIndex;
    let replaceEnd = targetIndex >= 0 ? targetIndex + selectedText.length : -1;

    if (targetIndex < 0) {
      const collapsedRange = locateCollapsedRange(source, selectedText);
      if (collapsedRange) {
        replaceStart = collapsedRange.start;
        replaceEnd = collapsedRange.end;
      }
    }

    if (replaceStart < 0 || replaceEnd < 0) {
      setPolishError('未在原文中定位到选中文本，无法自动替换。请复制后手动粘贴。');
      return;
    }

    const nextContent =
      source.slice(0, replaceStart)
      + draftToApply
      + source.slice(replaceEnd);

    setReplaceHistory((prev) => [...prev, { before: source, after: nextContent }]);
    workbench.updateDocument(document.id, { content: nextContent });
  };

  const handleUndoLastApply = () => {
    const last = replaceHistory[replaceHistory.length - 1];
    if (!last) return;
    if (document.content !== last.after) {
      setPolishError('文档内容已变化，无法自动撤销最近替换。');
      return;
    }
    workbench.updateDocument(document.id, { content: last.before });
    setReplaceHistory((prev) => prev.slice(0, -1));
  };

  const swallowPanelMouseEvent = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const polishPanelElement = isPolishPanelOpen ? (
    <div
      ref={polishPanelRef}
      onMouseDown={swallowPanelMouseEvent}
      onClick={swallowPanelMouseEvent}
      style={{
        ...styles.polishPanel,
        ...(panelPosition
          ? {
            left: `${panelPosition.left}px`,
            top: `${panelPosition.top}px`,
            right: 'auto',
            bottom: 'auto',
          }
          : {}),
      }}
    >
      <div style={styles.polishHeader} onMouseDown={handlePolishPanelDragStart}>
        <div style={styles.polishHeaderTitle}>
          AI 润色结果
        </div>
        <button
          type="button"
          data-no-drag="true"
          style={styles.polishActionBtn}
          onClick={() => {
            setIsPolishPanelOpen(false);
            setPolishError(null);
          }}
        >
          关闭
        </button>
      </div>

      <div style={styles.polishLabel}>润色内容（可编辑）</div>
      {polishError ? (
        <div style={styles.polishText}>{`失败：${polishError}`}</div>
      ) : (
        <textarea
          style={styles.polishEditor}
          value={polishDraft}
          onChange={(e) => setPolishDraft(e.target.value)}
          placeholder="润色结果会显示在这里，你可以直接编辑后再应用到原文"
        />
      )}

      <div style={styles.polishActions}>
        <button
          type="button"
          style={styles.polishActionBtn}
          onClick={handleApplyPolishToSource}
          disabled={!polishDraft.trim() || !!polishError}
          title={polishDraft.trim() ? '将当前编辑框内容替换回选中的原文片段' : '暂无可回填结果'}
        >
          应用到原文
        </button>
        <button
          type="button"
          style={styles.polishActionBtn}
          onClick={async () => {
            if (!polishDraft.trim()) return;
            try {
              await navigator.clipboard.writeText(polishDraft);
            } catch {
              // ignore clipboard failure
            }
          }}
        >
          复制润色结果
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div style={styles.root}>
      {/* 左侧章节目录 */}
      <div style={styles.sidebar(isSidebarCollapsed)}>
        <div style={styles.sidebarTitle}>
          {!isSidebarCollapsed && <span style={styles.sidebarTitleText}>章节目录</span>}
          <button
            type="button"
            style={styles.sidebarToggleBtn}
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            title={isSidebarCollapsed ? '展开目录' : '收起目录'}
          >
            {isSidebarCollapsed ? '›' : '‹'}
          </button>
        </div>
        {!isSidebarCollapsed && parsed.chapters.map((ch, idx) => (
          <div
            key={idx}
            style={styles.chapterItem(idx === activeIdx)}
            onClick={() => setActiveIdx(idx)}
            title={ch.title}
          >
            {ch.title}
          </div>
        ))}
      </div>

      {/* 右侧内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 角色颜色标识条 */}
        {parsed.characters.length > 0 && (
          <div style={styles.characterBar}>
            <div style={styles.characterBarLeft}>
              <span
                style={styles.filterAllChip(selectedCharacters.size === 0)}
                onClick={(e) => {
                  e.stopPropagation();
                  clearCharacterFilter();
                }}
                title="清除筛选，显示全部角色"
              >
                全部
              </span>

              {parsed.characters.map((name) => {
                const chipColor = effectiveColors[name] || 'var(--text-secondary)';
                const isEditing = editingCharacter === name;
                const isSelected = selectedCharacters.has(name);
                const isDimmed = selectedCharacters.size > 0 && !isSelected;

                return (
                  <span
                    key={name}
                    style={styles.characterChipInteractive(chipColor, {
                      selected: isSelected,
                      dimmed: isDimmed,
                      editing: isEditing,
                    })}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCharacterFilter(name);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingCharacter((prev) => (prev === name ? null : name));
                    }}
                    title="左键：筛选角色；右键：修改颜色"
                  >
                    {name}
                    {isEditing && (
                      <div
                        ref={pickerContainerRef}
                        style={styles.colorPickerPopover}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {DEFAULT_SCRIPT_COLORS.map((color) => (
                          <button
                            key={`${name}-${color}`}
                            type="button"
                            style={styles.colorOptionBtn(color, chipColor === color)}
                            onClick={() => {
                              setCustomColors((prev) => ({ ...prev, [name]: color }));
                              setEditingCharacter(null);
                            }}
                            aria-label={`将 ${name} 颜色设为 ${color}`}
                            title={color}
                          />
                        ))}
                      </div>
                    )}
                  </span>
                );
              })}
            </div>

            <div style={styles.characterBarRight}>
              {formatStatus && (
                <span style={styles.formatStatusText} title={formatStatus}>{formatStatus}</span>
              )}
              <button
                type="button"
                style={styles.polishToolbarButton(isFormatting)}
                onClick={handleAIFormat}
                disabled={isFormatting}
                title="使用 AI 仅对当前章节做格式规范化（只改缓存副本）"
              >
                {isFormatting ? '格式化中...' : '🔄 AI 格式化当前章'}
              </button>
              <div style={styles.fontSizeGroup}>
                <button
                  type="button"
                  style={styles.polishToolbarButton(contentFontSize <= 13)}
                  onClick={decreaseContentFontSize}
                  disabled={contentFontSize <= 13}
                  title="减小正文字号"
                >
                  A-
                </button>
                <span style={styles.fontSizeValue}>{contentFontSize}px</span>
                <button
                  type="button"
                  style={styles.polishToolbarButton(contentFontSize >= 24)}
                  onClick={increaseContentFontSize}
                  disabled={contentFontSize >= 24}
                  title="增大正文字号"
                >
                  A+
                </button>
              </div>
              <button
                type="button"
                style={styles.polishToolbarButton(!selectedText || isPolishing)}
                onClick={handlePolish}
                disabled={!selectedText || isPolishing}
                title={selectedText ? '对当前选中文本进行 AI 润色' : '请先在正文中选中文本'}
              >
                {isPolishing ? '润色中...' : '✨ AI 润色'}
              </button>
              <button
                type="button"
                style={styles.polishToolbarButton(replaceHistory.length === 0)}
                onClick={handleUndoLastApply}
                disabled={replaceHistory.length === 0}
                title={replaceHistory.length > 0 ? '撤销最近一次“应用到原文”' : '暂无可撤销的替换'}
              >
                撤销替换
              </button>
            </div>
          </div>
        )}

        {/* 当前章节正文 */}
        <div
          ref={contentRef}
          style={styles.content(contentFontSize)}
          onMouseUp={scheduleSelectionUpdate}
          onKeyUp={scheduleSelectionUpdate}
          onContextMenu={handleContentContextMenu}
        >
          {chapter && (
            <>
              <div style={styles.chapterTitle(contentFontSize)}>{chapter.title}</div>
              {visibleLineEntries.map(({ line, chapterLineIndex }, i) => (
                <div
                  key={`${activeIdx}-${i}-${line.raw}`}
                  data-script-line-index={chapterLineIndex}
                >
                  <ScriptLineView
                    line={line}
                    colorMap={effectiveColors}
                    fontSize={contentFontSize}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {selectionPosition && selectedText && (
        <div style={styles.polishTrigger(selectionPosition.top, selectionPosition.left)}>
          <button
            type="button"
            style={styles.polishButton(isPolishing)}
            onClick={handlePolish}
            disabled={isPolishing}
          >
            {isPolishing ? '润色中...' : '✨ AI 润色'}
          </button>
        </div>
      )}

      {polishPanelElement
        && typeof window !== 'undefined'
        && globalThis.document?.body
        && createPortal(polishPanelElement, globalThis.document.body)}
    </div>
  );
}

// ─── 插件注册 ────────────────────────────────────────────────────────────────

export const scriptPlugin: WorkbenchRendererPlugin = {
  id: 'script',
  canRender: (doc: WorkbenchDocument) => doc.artifactType === 'script',
  render: (doc: WorkbenchDocument) => <ScriptViewer document={doc} />,
  getExportContent: (doc: WorkbenchDocument) => exportScriptToText(parseScript(doc.content)),
  getExportFilename: (doc: WorkbenchDocument) =>
    `${doc.title || '剧本'}.txt`,
};
