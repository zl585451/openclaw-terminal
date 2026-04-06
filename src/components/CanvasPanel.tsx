import { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useCanvas } from '../contexts/CanvasContext';
import { markdownComponents } from '../ui/chat/markdownComponents';
import { highlightCode } from '../utils/codeHighlight';
import MermaidRenderer from './canvas/MermaidRenderer';
import './CanvasPanel.css';

const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeKatex];

export default function CanvasPanel() {
  const canvas = useCanvas();
  const activeDocument = canvas.activeDocument;
  const hasMultipleDocuments = canvas.documents.length > 1;

  const handleCopy = useCallback(async () => {
    if (!activeDocument) return;
    try {
      await navigator.clipboard.writeText(activeDocument.content);
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  }, [activeDocument]);

  const handleExport = useCallback(() => {
    if (!activeDocument) return;

    const blob = new Blob([activeDocument.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    let filename = 'canvas';
    if (activeDocument.mode === 'markdown') {
      filename += '.md';
    } else if (activeDocument.mode === 'html') {
      filename += '.html';
    } else if (activeDocument.mode === 'code' && activeDocument.language) {
      const extMap: Record<string, string> = {
        javascript: '.js',
        typescript: '.ts',
        python: '.py',
        java: '.java',
        cpp: '.cpp',
        c: '.c',
        rust: '.rs',
        go: '.go',
        php: '.php',
        ruby: '.rb',
        swift: '.swift',
        kotlin: '.kt',
        scala: '.scala',
        css: '.css',
        scss: '.scss',
        less: '.less',
        json: '.json',
        xml: '.xml',
        yaml: '.yaml',
        yml: '.yml',
        sql: '.sql',
        shell: '.sh',
        bash: '.sh',
        powershell: '.ps1',
      };
      filename += extMap[activeDocument.language] || '.txt';
    } else {
      filename += '.txt';
    }

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeDocument]);

  const handleDelete = useCallback(() => {
    if (!activeDocument) return;
    canvas.deleteDocument(activeDocument.id);
  }, [activeDocument, canvas]);

  const renderPreview = () => {
    if (!activeDocument) return null;

    if (activeDocument.artifactType === 'diagram') {
      return (
        <div className="canvas-preview">
          <MermaidRenderer content={activeDocument.content} />
        </div>
      );
    }

    if (activeDocument.mode === 'markdown') {
      return (
        <div className="canvas-preview">
          <div className="msg-content markdown-body">
            <ReactMarkdown
              remarkPlugins={MARKDOWN_REMARK_PLUGINS}
              rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
              components={markdownComponents}
            >
              {activeDocument.content}
            </ReactMarkdown>
          </div>
        </div>
      );
    }

    if (activeDocument.mode === 'code') {
      return (
        <div className="canvas-preview">
          <pre className="canvas-code-preview">
            <code
              className="oct-prism-code"
              dangerouslySetInnerHTML={{
                __html: highlightCode(activeDocument.content, activeDocument.language || 'text'),
              }}
            />
          </pre>
        </div>
      );
    }

    if (activeDocument.mode === 'html') {
      return (
        <div className="canvas-preview">
          <iframe
            className="canvas-html-preview"
            srcDoc={activeDocument.content}
            sandbox="allow-scripts"
            title="HTML Preview"
          />
        </div>
      );
    }
    return null;
  };

  const renderEmptyState = () => (
    <div className="canvas-empty">
      <div className="canvas-empty-title">Canvas Workspace</div>
      <div className="canvas-empty-copy">
        Open a code block or send a structured result here to start building artifacts.
      </div>
    </div>
  );

  return (
    <div className="canvas-panel">
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-title-group">
          <div className="canvas-toolbar-title">
            {activeDocument?.title || 'Canvas'}
          </div>
          {activeDocument && (
            <div className="canvas-toolbar-meta">
              {activeDocument.artifactType} · {activeDocument.origin} · v{activeDocument.version}
            </div>
          )}
        </div>
        {hasMultipleDocuments && (
          <div className="canvas-toolbar-switcher">
            <select
              className="canvas-document-select"
              value={canvas.activeDocumentId ?? ''}
              onChange={(e) => canvas.setActiveDocument(e.target.value)}
            >
              {canvas.documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="canvas-toolbar-actions">
          <button className="canvas-action-btn" onClick={handleCopy} disabled={!activeDocument}>
            Copy
          </button>
          <button className="canvas-action-btn" onClick={handleExport} disabled={!activeDocument}>
            Export
          </button>
          <button className="canvas-action-btn canvas-delete-btn" onClick={handleDelete} disabled={!activeDocument}>
            Delete
          </button>
          <button className="canvas-action-btn" onClick={canvas.closeCanvas}>
            ✕
          </button>
        </div>
      </div>

      <div className="canvas-workspace canvas-workspace--single">
        <div className="canvas-content canvas-content--single">
          {!activeDocument ? renderEmptyState() : renderPreview()}
        </div>
      </div>

      <div className="canvas-footer">
        {activeDocument?.explanation && (
          <div className="canvas-explanation">
            {activeDocument.explanation}
          </div>
        )}
      </div>
    </div>
  );
}
