import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import MermaidRenderer from '../../components/canvas/MermaidRenderer';
import { markdownComponents } from '../../ui/chat/markdownComponents';
import { diagramSpecToMermaid, parseDiagramSpec } from '../../utils/diagramSchema';
import type { WorkbenchRendererPlugin } from './types';

const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeKatex];
const baseMarkdownComponents = markdownComponents ?? {};

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

export const markdownPlugin: WorkbenchRendererPlugin = {
  id: 'markdown',
  canRender: (document) => document.mode === 'markdown',
  render: (document) => (
    <div className="canvas-preview canvas-preview--document">
      <div className="canvas-document-reader">
        <div className="msg-content markdown-body">
          <ReactMarkdown
            remarkPlugins={MARKDOWN_REMARK_PLUGINS}
            rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
            components={workbenchMarkdownComponents}
          >
            {document.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  ),
  getExportFilename: () => 'canvas.md',
};
