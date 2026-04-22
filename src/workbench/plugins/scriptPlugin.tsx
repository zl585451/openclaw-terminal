/**
 * scriptPlugin.tsx
 * 剧本渲染插件 —— 角色台词染色 + 章节导航 + 按章节分页（不一次渲染全文）
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  normalizeScriptText,
  parseScript,
  type ScriptLine,
} from '../../utils/scriptParser';
import { mergeCharacterColors } from '../../utils/characterExtractor';
import { exportScriptToText } from '../../utils/scriptExporter';
import { buildChapterLineRanges } from '../../utils/chapterParser';
import { useWorkbench } from '../WorkbenchContext';
import type { WorkbenchRendererPlugin } from './types';
import type { WorkbenchDocument } from '../types';
import { ScriptCharacterBar } from './script/ScriptCharacterBar';
import { ScriptContent } from './script/ScriptContent';
import { ScriptPolishPanel } from './script/ScriptPolishPanel';
import { ScriptSidebar } from './script/ScriptSidebar';
import { scriptStyles } from './script/styles';

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
    let chapterRange: { start: number; end: number } | null = null;

    const chapterRanges = buildChapterLineRanges(
      normalizedLines,
      beforeParsed.chapters.map((c) => c.title.trim()),
    );

    if (chapterRanges.length === beforeParsed.chapters.length && chapterRanges.length > 0) {
      const activeRange = chapterRanges[activeIdx];
      if (activeRange) {
        chapterRange = {
          start: activeRange.lineIndex,
          end: activeRange.endLineIndex,
        };
      }
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
    <ScriptPolishPanel
      panelRef={polishPanelRef}
      panelPosition={panelPosition}
      onMouseDown={swallowPanelMouseEvent}
      onClick={swallowPanelMouseEvent}
      onDragStart={handlePolishPanelDragStart}
      onClose={() => {
        setIsPolishPanelOpen(false);
        setPolishError(null);
      }}
      polishDraft={polishDraft}
      polishError={polishError}
      onChangeDraft={setPolishDraft}
      onApply={handleApplyPolishToSource}
    />
  ) : null;

  return (
    <div style={scriptStyles.root}>
      <ScriptSidebar
        collapsed={isSidebarCollapsed}
        chapters={parsed.chapters}
        activeIdx={activeIdx}
        onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
        onSelectChapter={setActiveIdx}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ScriptCharacterBar
          characters={parsed.characters}
          selectedCharacters={selectedCharacters}
          editingCharacter={editingCharacter}
          effectiveColors={effectiveColors}
          pickerContainerRef={pickerContainerRef}
          formatStatus={formatStatus}
          isFormatting={isFormatting}
          onAIFormat={handleAIFormat}
          contentFontSize={contentFontSize}
          onDecreaseFontSize={decreaseContentFontSize}
          onIncreaseFontSize={increaseContentFontSize}
          selectedText={selectedText}
          isPolishing={isPolishing}
          onPolish={handlePolish}
          replaceHistoryLength={replaceHistory.length}
          onUndoLastApply={handleUndoLastApply}
          onClearCharacterFilter={clearCharacterFilter}
          onToggleCharacterFilter={toggleCharacterFilter}
          onToggleEditingCharacter={(name) => setEditingCharacter((prev) => (prev === name ? null : name))}
          onChangeCharacterColor={(name, color) => {
            setCustomColors((prev) => ({ ...prev, [name]: color }));
            setEditingCharacter(null);
          }}
        />

        <ScriptContent
          contentRef={contentRef}
          chapter={chapter ?? undefined}
          activeIdx={activeIdx}
          visibleLineEntries={visibleLineEntries}
          effectiveColors={effectiveColors}
          contentFontSize={contentFontSize}
          onMouseUp={scheduleSelectionUpdate}
          onKeyUp={scheduleSelectionUpdate}
          onContextMenu={handleContentContextMenu}
        />
      </div>

      {selectionPosition && selectedText && (
        <div style={scriptStyles.polishTrigger(selectionPosition.top, selectionPosition.left)}>
          <button
            type="button"
            style={scriptStyles.polishButton(isPolishing)}
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
