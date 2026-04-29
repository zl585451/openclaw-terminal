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
import {
  DEFAULT_CHARACTER_COLORS,
  extractDocumentCharacterMentions,
  mergeCharacterColors,
} from '../../utils/characterExtractor';
import { exportScriptToText } from '../../utils/scriptExporter';
import { buildChapterLineRanges } from '../../utils/chapterParser';
import { normalizeSpeakerCueName } from '../../utils/speakerCueNormalizer';
import { useWorkbench } from '../WorkbenchContext';
import { workbenchBus } from '../WorkbenchBus';
import type { WorkbenchRendererPlugin } from './types';
import type {
  ScriptCharacterProfile,
  ScriptLineAttribution,
  ScriptStructuredLineMarker,
  ScriptVoiceFragmentMarker,
  WorkbenchDocument,
} from '../types';
import { ScriptCharacterBar } from './script/ScriptCharacterBar';
import { ScriptContent } from './script/ScriptContent';
import { ScriptPolishPanel } from './script/ScriptPolishPanel';
import { ScriptRoleDetectPanel } from './script/ScriptRoleDetectPanel';
import { ScriptSidebar } from './script/ScriptSidebar';
import { scriptStyles } from './script/styles';
import { useProjectChapterLink } from '../useProjectChapterLink';
import {
  buildRoleDetectPanelResult,
  extractStructuredRecordCandidates,
  extractQuoteCandidateLines,
  type RoleDetectPanelResult,
} from './script/roleDetect';

interface BoundSelection {
  text: string;
  lineRange: { start: number; end: number } | null;
  chapterIndex: number;
}

function buildScriptChapterKey(chapterIndex: number, chapterTitle: string): string {
  return `${chapterIndex}:${String(chapterTitle || '').trim()}`;
}

function mergeCharacterLibrary(
  existing: ScriptCharacterProfile[] | undefined,
  names: string[],
): ScriptCharacterProfile[] {
  const next: ScriptCharacterProfile[] = [];
  const seen = new Set<string>();

  (Array.isArray(existing) ? existing : []).forEach((entry) => {
    const name = normalizeSpeakerCueName(entry?.name) || String(entry?.name || '').trim();
    const color = String(entry?.color || '').trim();
    if (!name || !color || seen.has(name)) return;
    seen.add(name);
    next.push({ name, color });
  });

  const paletteOffset = next.length;

  names.forEach((rawName, index) => {
    const name = normalizeSpeakerCueName(rawName) || String(rawName || '').trim();
    if (!name || seen.has(name)) return;
    next.push({
      name,
      color: DEFAULT_CHARACTER_COLORS[(paletteOffset + index) % DEFAULT_CHARACTER_COLORS.length],
    });
    seen.add(name);
  });

  return next;
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

function ScriptViewer({ document }: { document: WorkbenchDocument }) {
  const workbench = useWorkbench();
  const {
    linkedProject,
    currentProjectChapterIndex,
    isSwitchingChapter,
    chapterSwitchError,
    switchToProjectChapter,
  } = useProjectChapterLink(document);
  const parsed = useMemo(() => parseScript(document.content), [document.content]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [contentFontSize, setContentFontSize] = useState(16);
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
  const [selectedText, setSelectedText] = useState('');
  const [selectedLineRange, setSelectedLineRange] = useState<{ start: number; end: number } | null>(null);
  const [boundSelection, setBoundSelection] = useState<BoundSelection | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<{ top: number; left: number } | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [isDetectingRoles, setIsDetectingRoles] = useState(false);
  const [formatStatus, setFormatStatus] = useState('');
  const [roleDetectStatus, setRoleDetectStatus] = useState('');
  const [isRoleListOpen, setIsRoleListOpen] = useState(false);
  const [isRoleDetectPanelOpen, setIsRoleDetectPanelOpen] = useState(false);
  const [roleDetectPanelResult, setRoleDetectPanelResult] = useState<RoleDetectPanelResult | null>(null);
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

  const libraryColorMap = useMemo(
    () => Object.fromEntries(
      (document.scriptCharacterLibrary || []).map((entry) => [entry.name, entry.color]),
    ),
    [document.scriptCharacterLibrary],
  );

  const effectiveColors = useMemo(
    () => mergeCharacterColors(
      mergeCharacterColors(parsed.characterColors, libraryColorMap),
      customColors,
    ),
    [parsed.characterColors, libraryColorMap, customColors],
  );

  useEffect(() => {
    setCustomColors({});
    setEditingCharacter(null);
    setSelectedCharacters(new Set());
    setSelectedText('');
    setSelectedLineRange(null);
    setBoundSelection(null);
    setSelectionPosition(null);
    setPolishDraft('');
    setPolishError(null);
    setReplaceHistory([]);
    setPanelPosition(null);
    setRoleDetectStatus('');
    setIsRoleListOpen(false);
    setIsRoleDetectPanelOpen(false);
    setRoleDetectPanelResult(null);
    setActiveIdx(0);
    setIsSidebarCollapsed(false);
    setContentFontSize(16);
  }, [document.id]);

  useEffect(() => {
    if (parsed.chapters.length === 0) {
      setActiveIdx(0);
      return;
    }
    setActiveIdx((prev) => Math.min(prev, parsed.chapters.length - 1));
  }, [parsed.chapters.length]);

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
  const sidebarChapters = linkedProject?.chapters?.length
    ? linkedProject.chapters.map((entry) => ({
        title: entry.title || `第 ${entry.chapter_index + 1} 章`,
      }))
    : parsed.chapters;
  const sidebarActiveIdx = linkedProject?.chapters?.length && currentProjectChapterIndex != null
    ? linkedProject.chapters.findIndex((entry) => entry.chapter_index === currentProjectChapterIndex)
    : activeIdx;
  const sidebarStatus = isSwitchingChapter
    ? '正在切换章节...'
    : (chapterSwitchError || null);
  const chapterKey = useMemo(
    () => buildScriptChapterKey(activeIdx, chapter?.title || ''),
    [activeIdx, chapter?.title],
  );
  const currentChapterAttributions = useMemo<ScriptLineAttribution[]>(
    () => document.scriptChapterAttributions?.[chapterKey] || [],
    [document.scriptChapterAttributions, chapterKey],
  );
  const currentChapterStructuredLines = useMemo<ScriptStructuredLineMarker[]>(
    () => document.scriptChapterStructuredLines?.[chapterKey] || [],
    [document.scriptChapterStructuredLines, chapterKey],
  );
  const currentChapterVoiceFragments = useMemo<ScriptVoiceFragmentMarker[]>(
    () => document.scriptChapterVoiceFragments?.[chapterKey] || [],
    [document.scriptChapterVoiceFragments, chapterKey],
  );
  const structuredLineIndices = useMemo(
    () => new Set(currentChapterStructuredLines.map((entry) => entry.lineIndex)),
    [currentChapterStructuredLines],
  );
  const voiceFragmentSpeakers = useMemo(
    () => Object.fromEntries(currentChapterVoiceFragments.map((entry) => [entry.lineIndex, entry.speaker])),
    [currentChapterVoiceFragments],
  );
  const inferredSpeakers = useMemo(
    () => Object.fromEntries(currentChapterAttributions.map((entry) => [entry.lineIndex, entry.speaker])),
    [currentChapterAttributions],
  );
  const currentChapterRoleNames = useMemo(
    () => Array.from(
      new Set([
        ...(chapter?.lines || [])
          .filter((line, lineIndex) =>
            (line.type === 'dialogue' || line.type === 'narrator')
            && !structuredLineIndices.has(lineIndex))
          .map((line) => String(line.character || '').trim())
          .filter(Boolean),
        ...currentChapterAttributions.map((entry) => entry.speaker).filter(Boolean),
      ]),
    ),
    [chapter?.lines, currentChapterAttributions, structuredLineIndices],
  );
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

  const openPolishPanelForSelection = (
    text: string,
    lineRange: { start: number; end: number } | null,
  ) => {
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    setBoundSelection({
      text: cleanText,
      lineRange,
      chapterIndex: activeIdx,
    });
    setIsPolishPanelOpen(true);
    setPolishError(null);
    setPolishDraft(cleanText);
  };

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

    // 右键命中选中文本时，直接打开编辑面板，规避浮动按钮显示不稳定
    event.preventDefault();
    event.stopPropagation();
    setSelectedText(text);
    let lineRange: { start: number; end: number } | null = null;
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
      lineRange = { start: index, end: index };
      setSelectedLineRange(lineRange);
    } else {
      setSelectedLineRange(null);
    }
    setSelectionPosition({
      top: Math.max(8, event.clientY - 36),
      left: event.clientX,
    });
    openPolishPanelForSelection(text, lineRange);
  };

  const runPolish = async () => {
    const sourceText = String(polishDraft || boundSelection?.text || '').trim();
    if (!sourceText || isPolishing) return;
    setIsPolishing(true);
    setIsPolishPanelOpen(true);
    setPolishError(null);

    try {
      const response = await fetch('http://127.0.0.1:18790/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
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

  const handleOpenPolishPanel = () => {
    if (!selectedText) return;
    openPolishPanelForSelection(selectedText, selectedLineRange);
  };

  const handleDiscussInChat = () => {
    const originalText = String(boundSelection?.text || '').trim();
    if (!originalText) return;

    const draftText = String(polishDraft || '').trim();
    const prompt = [
      '我们正在修改剧本中的一段选中文本，请只围绕这段内容讨论，不要改整篇文档。',
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
  };

  const handleDetectCurrentChapterRoles = async () => {
    if (isDetectingRoles || !chapter) return;

    const chapterLines = chapter.lines || [];
    const candidateLines = extractQuoteCandidateLines(chapterLines);
    const structuredCandidates = extractStructuredRecordCandidates(chapterLines);
    if (candidateLines.length === 0 && structuredCandidates.length === 0) {
      setRoleDetectStatus('当前章节没有可识别的对白或结构化候选');
      window.setTimeout(() => setRoleDetectStatus(''), 2800);
      return;
    }

    const chapterText = chapterLines
      .map((line) => String(line.raw || line.content || ''))
      .join('\n')
      .trim();
    const existingRoles = [
      ...(document.scriptCharacterLibrary || []).map((entry) => entry.name),
      ...parsed.characters,
      ...extractDocumentCharacterMentions(chapterText).map((entry) => entry.name),
    ];

    setIsDetectingRoles(true);
    setRoleDetectStatus('识别当前章节角色中...');
    try {
      const response = await fetch('http://127.0.0.1:18790/api/script-role-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterTitle: chapter.title,
          chapterText,
          existingRoles: Array.from(
            new Set(
              existingRoles
                .map((name) => normalizeSpeakerCueName(name) || String(name || '').trim())
                .filter(Boolean),
            ),
          ),
          candidateLines,
          structuredCandidates,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.result) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      const roles = Array.isArray(data.result.roles)
        ? data.result.roles.map((name: unknown) => String(name || '').trim()).filter(Boolean)
        : [];
      const attributions = Array.isArray(data.result.attributions)
        ? data.result.attributions
          .map((entry: any) => ({
            lineIndex: Number(entry?.lineIndex),
            speaker: normalizeSpeakerCueName(entry?.speaker) || String(entry?.speaker || '').trim(),
            confidence: entry?.confidence === 'high' || entry?.confidence === 'low'
              ? entry.confidence
              : 'medium',
          }))
          .filter((entry: ScriptLineAttribution) =>
            Number.isInteger(entry.lineIndex)
            && entry.lineIndex >= 0
            && entry.speaker)
        : [];
      const structuredLines = Array.isArray(data.result.structuredLines)
        ? data.result.structuredLines
          .map((entry: any) => ({
            lineIndex: Number(entry?.lineIndex),
            label: normalizeSpeakerCueName(entry?.label) || String(entry?.label || '').trim(),
          }))
          .filter((entry: ScriptStructuredLineMarker) => Number.isInteger(entry.lineIndex) && entry.lineIndex >= 0)
        : [];
      const voiceFragments = Array.isArray(data.result.voiceFragments)
        ? data.result.voiceFragments
          .map((entry: any) => ({
            lineIndex: Number(entry?.lineIndex),
            speaker: normalizeSpeakerCueName(entry?.speaker) || String(entry?.speaker || '').trim(),
            mentionedNames: Array.isArray(entry?.mentionedNames)
              ? entry.mentionedNames
                .map((name: unknown) => normalizeSpeakerCueName(name) || String(name || '').trim())
                .filter(Boolean)
              : [],
          }))
          .filter((entry: ScriptVoiceFragmentMarker) => Number.isInteger(entry.lineIndex) && entry.lineIndex >= 0)
        : [];
      const structuredLineIndexSet = new Set(structuredLines.map((entry: ScriptStructuredLineMarker) => entry.lineIndex));

      const explicitChapterRoles = chapterLines
        .filter((line, lineIndex) =>
          (line.type === 'dialogue' || line.type === 'narrator')
          && !structuredLineIndexSet.has(lineIndex))
        .map((line) => normalizeSpeakerCueName(line.character) || String(line.character || '').trim())
        .filter(Boolean);
      const mergedNames = Array.from(new Set([
        ...explicitChapterRoles,
        ...roles.map((name: string) => normalizeSpeakerCueName(name) || name),
        ...attributions.map((entry: ScriptLineAttribution) => entry.speaker),
      ]));
      const nextLibrary = mergeCharacterLibrary(document.scriptCharacterLibrary, mergedNames);
      const nextAttributions = {
        ...(document.scriptChapterAttributions || {}),
        [chapterKey]: attributions,
      };
      const nextStructuredLines = {
        ...(document.scriptChapterStructuredLines || {}),
        [chapterKey]: structuredLines,
      };
      const nextVoiceFragments = {
        ...(document.scriptChapterVoiceFragments || {}),
        [chapterKey]: voiceFragments,
      };

      workbench.updateDocument(document.id, {
        scriptCharacterLibrary: nextLibrary,
        scriptChapterAttributions: nextAttributions,
        scriptChapterStructuredLines: nextStructuredLines,
        scriptChapterVoiceFragments: nextVoiceFragments,
      });
      setRoleDetectPanelResult(buildRoleDetectPanelResult({
        chapterTitle: chapter.title,
        roleLibrary: nextLibrary,
        candidateLines,
        structuredCandidates,
        attributions,
        structuredLines,
        voiceFragments,
      }));
      setIsRoleDetectPanelOpen(true);
      setRoleDetectStatus(`识别到 ${mergedNames.length} 个角色，并标出 OS 片段与结构化内容`);
    } catch (error) {
      setRoleDetectStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDetectingRoles(false);
      window.setTimeout(() => setRoleDetectStatus(''), 3200);
    }
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
    const sourceSelectionText = String(boundSelection?.text || '').trim();
    const sourceLineRange = boundSelection?.lineRange || null;
    const sourceChapterIndex = boundSelection?.chapterIndex;
    if (!draftToApply || !sourceSelectionText) return;
    const source = document.content;

    // 优先按“选中行块”定位，避免渲染文本与原文存在格式差异时 indexOf 失败
    if (chapter && sourceLineRange && sourceChapterIndex === activeIdx) {
      const { start, end } = sourceLineRange;
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

    const targetIndex = source.indexOf(sourceSelectionText);

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
    let replaceEnd = targetIndex >= 0 ? targetIndex + sourceSelectionText.length : -1;

    if (targetIndex < 0) {
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

    setReplaceHistory((prev) => [...prev, { before: source, after: nextContent }]);
    workbench.updateDocument(document.id, { content: nextContent });
    setBoundSelection({
      text: draftToApply,
      lineRange: sourceLineRange,
      chapterIndex: sourceChapterIndex ?? activeIdx,
    });
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
        setBoundSelection(null);
      }}
      originalText={boundSelection?.text || ''}
      polishDraft={polishDraft}
      polishError={polishError}
      onChangeDraft={(value) => {
        setPolishDraft(value);
        if (polishError) setPolishError(null);
      }}
      onPolishWithAI={runPolish}
      onDiscussInChat={handleDiscussInChat}
      isPolishing={isPolishing}
      onApply={handleApplyPolishToSource}
    />
  ) : null;
  const roleDetectPanelElement = isRoleDetectPanelOpen && roleDetectPanelResult ? (
    <ScriptRoleDetectPanel
      result={roleDetectPanelResult}
      onClose={() => setIsRoleDetectPanelOpen(false)}
    />
  ) : null;

  return (
    <div style={scriptStyles.root}>
      <ScriptSidebar
        collapsed={isSidebarCollapsed}
        chapters={sidebarChapters}
        activeIdx={sidebarActiveIdx >= 0 ? sidebarActiveIdx : 0}
        onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
        onSelectChapter={(idx) => {
          if (linkedProject?.chapters?.length) {
            const nextChapter = linkedProject.chapters[idx];
            if (nextChapter) {
              void switchToProjectChapter(nextChapter.chapter_index);
            }
            return;
          }
          setActiveIdx(idx);
        }}
        statusText={sidebarStatus}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ScriptCharacterBar
          roleLibrary={document.scriptCharacterLibrary || []}
          currentChapterRoleNames={currentChapterRoleNames}
          roleListOpen={isRoleListOpen}
          onToggleRoleList={() => setIsRoleListOpen((prev) => !prev)}
          roleDetectStatus={roleDetectStatus}
          isDetectingRoles={isDetectingRoles}
          onDetectRoles={handleDetectCurrentChapterRoles}
          formatStatus={formatStatus}
          isFormatting={isFormatting}
          onAIFormat={handleAIFormat}
          contentFontSize={contentFontSize}
          onDecreaseFontSize={decreaseContentFontSize}
          onIncreaseFontSize={increaseContentFontSize}
          selectedText={selectedText}
          isPolishing={isPolishing}
          onPolish={handleOpenPolishPanel}
          replaceHistoryLength={replaceHistory.length}
          onUndoLastApply={handleUndoLastApply}
        />

        <ScriptContent
          contentRef={contentRef}
          chapter={chapter ?? undefined}
          activeIdx={activeIdx}
          visibleLineEntries={visibleLineEntries}
          effectiveColors={effectiveColors}
          inferredSpeakers={inferredSpeakers}
          structuredLineIndices={structuredLineIndices}
          voiceFragmentSpeakers={voiceFragmentSpeakers}
          contentFontSize={contentFontSize}
          boundLineRange={boundSelection && boundSelection.chapterIndex === activeIdx
            ? boundSelection.lineRange
            : null}
          onMouseUp={scheduleSelectionUpdate}
          onKeyUp={scheduleSelectionUpdate}
          onContextMenu={handleContentContextMenu}
        />
      </div>

      {selectionPosition && selectedText && !isPolishPanelOpen && (
        <div style={scriptStyles.polishTrigger(selectionPosition.top, selectionPosition.left)}>
          <button
            type="button"
            style={scriptStyles.polishButton(false)}
            onClick={handleOpenPolishPanel}
          >
            打开编辑面板
          </button>
        </div>
      )}

      {polishPanelElement
        && typeof window !== 'undefined'
        && globalThis.document?.body
        && createPortal(polishPanelElement, globalThis.document.body)}
      {roleDetectPanelElement
        && typeof window !== 'undefined'
        && globalThis.document?.body
        && createPortal(roleDetectPanelElement, globalThis.document.body)}
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
