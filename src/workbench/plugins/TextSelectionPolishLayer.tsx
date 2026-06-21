import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import { useWorkbench } from '../WorkbenchContext';
import type { WorkbenchDocument } from '../types';
import { workbenchBus } from '../WorkbenchBus';
import { ScriptPolishPanel } from './script/ScriptPolishPanel';
import { scriptStyles } from './script/styles';

interface TextSelectionPolishLayerProps {
  document: WorkbenchDocument;
  className?: string;
  style?: React.CSSProperties;
  discussLabel?: string;
  children: React.ReactNode;
}

interface BoundSelection {
  text: string;
}

function locateCollapsedRange(fullText: string, segment: string): { start: number; end: number } | null {
  const query = segment.replace(/\s+/g, ' ').trim();
  if (!query) return null;

  let normalized = '';
  const map: number[] = [];
  let prevSpace = false;
  for (let index = 0; index < fullText.length; index += 1) {
    const char = fullText[index];
    if (/\s/.test(char)) {
      if (!prevSpace) {
        normalized += ' ';
        map.push(index);
        prevSpace = true;
      }
    } else {
      normalized += char;
      map.push(index);
      prevSpace = false;
    }
  }

  const normalizedIndex = normalized.indexOf(query);
  if (normalizedIndex < 0) return null;
  const start = map[normalizedIndex];
  const endMapIndex = normalizedIndex + query.length - 1;
  const end = map[endMapIndex] + 1;
  return { start, end };
}

export function TextSelectionPolishLayer({
  document,
  className,
  style,
  discussLabel = '当前文稿',
  children,
}: TextSelectionPolishLayerProps) {
  const workbench = useWorkbench();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const polishPanelRef = useRef<HTMLDivElement | null>(null);
  const panelDragRef = useRef<{
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState<{ top: number; left: number } | null>(null);
  const [boundSelection, setBoundSelection] = useState<BoundSelection | null>(null);
  const [polishDraft, setPolishDraft] = useState('');
  const [polishError, setPolishError] = useState<string | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isPolishPanelOpen, setIsPolishPanelOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);

  const updateTextSelection = useCallback(() => {
    const root = contentRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) {
      setSelectedText('');
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
      setSelectionPosition(null);
      return;
    }

    const text = selection.toString().trim();
    if (selection.isCollapsed || text.length < 1) {
      setSelectedText('');
      setSelectionPosition(null);
      return;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setSelectedText(text);
    setSelectionPosition({
      top: Math.max(8, rect.top - 36),
      left: rect.left + rect.width / 2,
    });
  }, []);

  useEffect(() => {
    const onSelectionLikeEvent = () => updateTextSelection();
    globalThis.document.addEventListener('selectionchange', onSelectionLikeEvent);
    globalThis.document.addEventListener('mouseup', onSelectionLikeEvent);
    globalThis.document.addEventListener('keyup', onSelectionLikeEvent);

    return () => {
      globalThis.document.removeEventListener('selectionchange', onSelectionLikeEvent);
      globalThis.document.removeEventListener('mouseup', onSelectionLikeEvent);
      globalThis.document.removeEventListener('keyup', onSelectionLikeEvent);
    };
  }, [updateTextSelection]);

  useEffect(() => {
    setSelectedText('');
    setSelectionPosition(null);
    setBoundSelection(null);
    setPolishDraft('');
    setPolishError(null);
    setIsPolishPanelOpen(false);
  }, [document.id]);

  const openPolishPanelForSelection = useCallback((text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    setBoundSelection({ text: normalized });
    setPolishDraft(normalized);
    setPolishError(null);
    setIsPolishPanelOpen(true);
    setPanelPosition((current) => current || null);
  }, []);

  const handleContentContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
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

    event.preventDefault();
    event.stopPropagation();
    setSelectedText(text);
    setSelectionPosition({
      top: Math.max(8, event.clientY - 36),
      left: event.clientX,
    });
    openPolishPanelForSelection(text);
  }, [openPolishPanelForSelection]);

  const runPolish = useCallback(async () => {
    const sourceText = String(polishDraft || boundSelection?.text || '').trim();
    if (!sourceText || isPolishing) return;
    setIsPolishing(true);
    setIsPolishPanelOpen(true);
    setPolishError(null);

    try {
      const response = await fetch('http://127.0.0.1:18790/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const result = String(data?.result || '').trim();
      setPolishDraft(result || '（未返回润色结果）');
    } catch (error) {
      setPolishError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPolishing(false);
    }
  }, [boundSelection?.text, isPolishing, polishDraft]);

  const handleDiscussInChat = useCallback(() => {
    const originalText = String(boundSelection?.text || '').trim();
    if (!originalText) return;

    const draftText = String(polishDraft || '').trim();
    const prompt = [
      `我们正在修改${discussLabel}中的一段选中文本，请只围绕这段内容讨论，不要改整篇内容。`,
      '',
      '【当前选段】',
      originalText,
      ...(draftText && draftText !== originalText
        ? ['', '【当前编辑稿】', draftText]
        : []),
      '',
      '请先给我 2-3 个修改方向，并说明各自适合的语气或效果。暂时不要直接改全文。',
    ].join('\n');

    workbenchBus.requestSendMessage({
      text: prompt,
      intent: 'rewrite',
    });
  }, [boundSelection?.text, discussLabel, polishDraft]);

  const handleApplyPolishToSource = useCallback(() => {
    const draftToApply = polishDraft.trim();
    const sourceSelectionText = String(boundSelection?.text || '').trim();
    if (!draftToApply || !sourceSelectionText) return;

    const source = document.content;
    let replaceStart = source.indexOf(sourceSelectionText);
    let replaceEnd = replaceStart >= 0 ? replaceStart + sourceSelectionText.length : -1;

    if (replaceStart < 0) {
      const collapsedRange = locateCollapsedRange(source, sourceSelectionText);
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

    workbench.updateDocument(document.id, { content: nextContent });
    setBoundSelection({ text: draftToApply });
  }, [boundSelection?.text, document.content, document.id, polishDraft, workbench]);

  const handlePolishPanelDragStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
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
  }, []);

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

  const swallowPanelMouseEvent = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const polishPanelElement = isPolishPanelOpen ? (
    <ScriptPolishPanel
      panelRef={polishPanelRef}
      panelPosition={panelPosition}
      onMouseDown={swallowPanelMouseEvent}
      onClick={swallowPanelMouseEvent}
      onDragStart={handlePolishPanelDragStart}
      onClose={() => {
        setIsPolishPanelOpen(false);
        setPanelPosition(null);
      }}
      originalText={boundSelection?.text || ''}
      polishDraft={polishDraft}
      polishError={polishError}
      onChangeDraft={setPolishDraft}
      onPolishWithAI={runPolish}
      onDiscussInChat={handleDiscussInChat}
      isPolishing={isPolishing}
      onApply={handleApplyPolishToSource}
    />
  ) : null;

  return (
    <div
      ref={contentRef}
      className={className}
      style={style}
      onMouseUp={() => window.setTimeout(updateTextSelection, 0)}
      onKeyUp={() => window.setTimeout(updateTextSelection, 0)}
      onContextMenu={handleContentContextMenu}
    >
      {children}

      {selectionPosition && selectedText && !isPolishPanelOpen && (
        <div style={scriptStyles.polishTrigger(selectionPosition.top, selectionPosition.left)}>
          <button
            type="button"
            style={scriptStyles.polishButton(false)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openPolishPanelForSelection(selectedText)}
          >
            打开编辑面板
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
