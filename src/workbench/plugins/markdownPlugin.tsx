import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import MermaidRenderer from '../../components/canvas/MermaidRendererLazy';
import { markdownComponents } from '../../ui/chat/markdownComponents';
import { diagramSpecToMermaid, parseDiagramSpec } from '../../utils/diagramSchema';
import { buildChapterLineRangesFromLines } from '../../utils/chapterParser';
import { createCharacterRegistry, extractDocumentCharacterMentions } from '../../utils/characterExtractor';
import { DocumentChapterSidebar } from './document/DocumentChapterSidebar';
import { DocumentCharacterPanel } from './document/DocumentCharacterPanel';
import { documentWorkbenchStyles } from './document/styles';
import type { WorkbenchDocument } from '../types';
import type { WorkbenchRendererPlugin } from './types';
import { useProjectChapterLink } from '../useProjectChapterLink';
import { TextSelectionPolishLayer } from './TextSelectionPolishLayer';

const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeKatex];
const baseMarkdownComponents = markdownComponents ?? {};

interface DocumentSection {
  id: string;
  title: string;
  content: string;
  characters: Array<{ name: string; count: number }>;
}

const workbenchMarkdownComponents = {
  ...baseMarkdownComponents,
  code: ({ children, className, inline }: { children?: React.ReactNode; className?: string; inline?: boolean }) => {
    const language = className?.replace('language-', '').toLowerCase() || '';
    const code = String(children ?? '').replace(/\n$/, '');
    const isBlock = !inline && (className?.includes('language-') || code.includes('\n'));

    if (isBlock && language === 'mermaid') {
      return <MermaidRenderer content={code} />;
    }
    if (isBlock && language === 'json') {
      const spec = parseDiagramSpec(code);
      if (spec) {
        return <MermaidRenderer content={diagramSpecToMermaid(spec)} />;
      }
    }

    const DefaultCode = baseMarkdownComponents.code;
    if (DefaultCode) {
      return React.createElement(DefaultCode as React.ElementType, { children, className, inline });
    }
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }: { children?: React.ReactNode }) => {
    const child = React.Children.toArray(children)[0] as React.ReactElement | undefined;
    if (child?.type === 'code') {
      const { className, children: codeChildren } = child.props as { className?: string; children?: React.ReactNode };
      const language = className?.replace('language-', '').toLowerCase() || '';
      const code = String(codeChildren ?? '').replace(/\n$/, '');
      if (language === 'mermaid') {
        return <MermaidRenderer content={code} />;
      }
      if (language === 'json') {
        const spec = parseDiagramSpec(code);
        if (spec) {
          return <MermaidRenderer content={diagramSpecToMermaid(spec)} />;
        }
      }
    }

    const DefaultPre = baseMarkdownComponents.pre;
    if (DefaultPre) {
      return React.createElement(DefaultPre as React.ElementType, { children });
    }
    return <pre>{children}</pre>;
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = haystack.match(new RegExp(escaped, 'gu'));
  return matches?.length ?? 0;
}

function buildDocumentSections(document: WorkbenchDocument): {
  sections: DocumentSection[];
  characters: Array<{ name: string; count: number; color: string; firstChapterId: string | null }>;
} {
  const raw = String(document.content || '');
  const lines = raw.split(/\r?\n/);
  const chapterRanges = buildChapterLineRangesFromLines(lines);
  const mentions = extractDocumentCharacterMentions(raw);
  const registry = createCharacterRegistry();
  mentions.forEach((mention) => registry.add(mention.name));
  const colors = registry.getCharacterColors();

  const sections: DocumentSection[] = [];
  if (chapterRanges.length === 0) {
    sections.push({
      id: 'document-full',
      title: document.title || '全文',
      content: raw,
      characters: mentions.map((mention) => ({ name: mention.name, count: mention.count })),
    });
  } else {
    const firstRange = chapterRanges[0];
    if (firstRange.lineIndex > 0) {
      const introContent = lines.slice(0, firstRange.lineIndex).join('\n').trim();
      if (introContent) {
        sections.push({
          id: 'document-intro',
          title: document.title || '前言',
          content: introContent,
          characters: mentions
            .map((mention) => ({ name: mention.name, count: countOccurrences(introContent, mention.name) }))
            .filter((entry) => entry.count > 0),
        });
      }
    }

    chapterRanges.forEach((range, idx) => {
      const content = lines.slice(range.lineIndex + 1, range.endLineIndex + 1).join('\n').trim();
      const sectionText = [range.title, content].filter(Boolean).join('\n');
      sections.push({
        id: `document-chapter-${idx}`,
        title: range.title,
        content: content || '',
        characters: mentions
          .map((mention) => ({ name: mention.name, count: countOccurrences(sectionText, mention.name) }))
          .filter((entry) => entry.count > 0),
      });
    });
  }

  const characters = mentions.map((mention) => ({
    name: mention.name,
    count: mention.count,
    color: colors[mention.name] || 'var(--text-secondary)',
    firstChapterId: sections.find((section) => section.characters.some((entry) => entry.name === mention.name))?.id ?? null,
  }));

  return { sections, characters };
}

function ReadingViewer({ document }: { document: WorkbenchDocument }) {
  const {
    linkedProject,
    currentProjectChapterIndex,
    isSwitchingChapter,
    chapterSwitchError,
    switchToProjectChapter,
  } = useProjectChapterLink(document);
  const { sections, characters } = useMemo(() => buildDocumentSections(document), [document]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(sections[0]?.id ?? null);
  const [activeCharacter, setActiveCharacter] = useState<string | null>(null);
  const [isChapterSidebarCollapsed, setIsChapterSidebarCollapsed] = useState(false);
  const [isCharacterPanelCollapsed, setIsCharacterPanelCollapsed] = useState(true);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveChapterId(sections[0]?.id ?? null);
    setActiveCharacter(null);
    setIsChapterSidebarCollapsed(false);
    setIsCharacterPanelCollapsed(true);
  }, [document.id, sections]);

  const jumpToChapter = (chapterId: string | null) => {
    if (!chapterId) return;
    if (linkedProject?.chapters?.length) {
      const nextIndex = Number(chapterId);
      if (Number.isInteger(nextIndex)) {
        void switchToProjectChapter(nextIndex);
      }
      return;
    }
    setActiveChapterId(chapterId);
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeSection = sections.find((section) => section.id === activeChapterId) ?? sections[0] ?? null;
  const sidebarChapters = linkedProject?.chapters?.length
    ? linkedProject.chapters.map((chapter) => ({
        id: String(chapter.chapter_index),
        title: chapter.title || `第 ${chapter.chapter_index + 1} 章`,
      }))
    : sections.map((section) => ({ id: section.id, title: section.title }));
  const effectiveActiveChapterId = linkedProject?.chapters?.length && currentProjectChapterIndex != null
    ? String(currentProjectChapterIndex)
    : activeChapterId;
  const topbarTitle = linkedProject?.chapters?.length
    ? `${linkedProject.chapters.find((chapter) => chapter.chapter_index === currentProjectChapterIndex)?.title || activeSection?.title || '当前章节'} · 当前项目章节`
    : (activeSection ? `${activeSection.title} · 仅渲染当前章节` : '正文阅读视图');

  return (
    <div style={documentWorkbenchStyles.root}>
      <DocumentChapterSidebar
        chapters={sidebarChapters}
        activeChapterId={effectiveActiveChapterId}
        onSelectChapter={jumpToChapter}
        collapsed={isChapterSidebarCollapsed}
        onToggleCollapsed={() => setIsChapterSidebarCollapsed((prev) => !prev)}
      />

      <div style={documentWorkbenchStyles.contentShell}>
        <div style={documentWorkbenchStyles.topbar}>
          <button
            type="button"
            style={documentWorkbenchStyles.topbarButton(!isChapterSidebarCollapsed)}
            onClick={() => setIsChapterSidebarCollapsed((prev) => !prev)}
          >
            {isChapterSidebarCollapsed ? '显示目录' : '隐藏目录'}
          </button>
          <button
            type="button"
            style={documentWorkbenchStyles.topbarButton(!isCharacterPanelCollapsed)}
            onClick={() => setIsCharacterPanelCollapsed((prev) => !prev)}
          >
            {isCharacterPanelCollapsed ? '显示角色' : '隐藏角色'}
          </button>
          <div style={documentWorkbenchStyles.topbarTitle}>
            {isSwitchingChapter ? '正在切换章节...' : topbarTitle}
          </div>
          {chapterSwitchError && (
            <div style={documentWorkbenchStyles.topbarHint}>{chapterSwitchError}</div>
          )}
        </div>

        <div className="canvas-preview canvas-preview--document" style={{ height: '100%' }}>
          <div
            className="canvas-document-reader"
            style={documentWorkbenchStyles.reader}
            ref={contentScrollRef}
          >
            {activeSection && (
              <section style={documentWorkbenchStyles.section}>
                <h2 style={documentWorkbenchStyles.sectionTitle}>{activeSection.title}</h2>
                <TextSelectionPolishLayer
                  document={document}
                  className="msg-content markdown-body"
                  discussLabel="当前项目章节"
                >
                  <ReactMarkdown
                    remarkPlugins={MARKDOWN_REMARK_PLUGINS}
                    rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
                    components={workbenchMarkdownComponents}
                  >
                    {activeSection.content}
                  </ReactMarkdown>
                </TextSelectionPolishLayer>
                {!activeSection.content.trim() && (
                  <div style={documentWorkbenchStyles.sectionEmpty}>
                    当前章节暂无正文内容。
                  </div>
                )}
                {activeSection.characters.length > 0 && (
                  <div style={documentWorkbenchStyles.chapterMeta}>
                    {activeSection.characters.slice(0, 8).map((entry) => (
                      <span key={`${activeSection.id}-${entry.name}`} style={documentWorkbenchStyles.chapterMetaChip}>
                        {entry.name} · {entry.count}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      <DocumentCharacterPanel
        characters={characters}
        activeCharacter={activeCharacter}
        collapsed={isCharacterPanelCollapsed}
        onToggleCollapsed={() => setIsCharacterPanelCollapsed((prev) => !prev)}
        onSelectCharacter={(name) => {
          setActiveCharacter(name);
          const firstChapterId = characters.find((entry) => entry.name === name)?.firstChapterId ?? null;
          jumpToChapter(firstChapterId);
        }}
      />
    </div>
  );
}

export const markdownPlugin: WorkbenchRendererPlugin = {
  id: 'reading',
  canRender: (document) => document.artifactType === 'reading',
  render: (document) => <ReadingViewer document={document} />,
  getExportFilename: (document) =>
    `${document.title.replace(/\s+/g, '-').toLowerCase() || 'reading'}.md`,
};
