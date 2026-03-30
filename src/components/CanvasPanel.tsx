import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCanvas } from '../contexts/CanvasContext';
import { markdownComponents } from '../ui/chat/markdownComponents';
import { highlightCode } from '../utils/codeHighlight';
import './CanvasPanel.css';

export default function CanvasPanel({ onSendToChat }: { onSendToChat: (text: string) => void }) {
  const canvas = useCanvas();
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 进入编辑模式时自动 focus
  useEffect(() => {
    if (viewMode === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [viewMode]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(canvas.content);
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  }, [canvas.content]);

  const handleExport = useCallback(() => {
    const blob = new Blob([canvas.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    let filename = 'canvas';
    if (canvas.mode === 'markdown') {
      filename += '.md';
    } else if (canvas.mode === 'html') {
      filename += '.html';
    } else if (canvas.mode === 'code' && canvas.language) {
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
      filename += extMap[canvas.language] || '.txt';
    } else {
      filename += '.txt';
    }
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [canvas.content, canvas.mode, canvas.language]);

  const renderPreview = () => {
    if (canvas.mode === 'markdown') {
      return (
        <div className="canvas-preview">
          <div className="msg-content markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {canvas.content}
            </ReactMarkdown>
          </div>
        </div>
      );
    } else if (canvas.mode === 'code') {
      return (
        <div className="canvas-preview">
          <pre className="canvas-code-preview">
            <code
              className="oct-prism-code"
              dangerouslySetInnerHTML={{
                __html: highlightCode(canvas.content, canvas.language || 'text'),
              }}
            />
          </pre>
        </div>
      );
    } else if (canvas.mode === 'html') {
      return (
        <div className="canvas-preview">
          <iframe
            className="canvas-html-preview"
            srcDoc={canvas.content}
            sandbox="allow-scripts"
            title="HTML Preview"
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="canvas-panel">
      {/* 顶部工具栏 */}
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-title">
          {canvas.title || 'Canvas'}
        </div>
        <div className="canvas-toolbar-actions">
          <button
            className={`canvas-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
            onClick={() => setViewMode('preview')}
          >
            Preview
          </button>
          <button
            className={`canvas-mode-btn ${viewMode === 'edit' ? 'active' : ''}`}
            onClick={() => setViewMode('edit')}
          >
            Edit
          </button>
          <button className="canvas-action-btn" onClick={handleCopy}>
            Copy
          </button>
          <button className="canvas-action-btn" onClick={canvas.closeCanvas}>
            ✕
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="canvas-content">
        {viewMode === 'preview' ? (
          renderPreview()
        ) : (
          <textarea
            ref={textareaRef}
            className="canvas-editor"
            value={canvas.content}
            onChange={(e) => canvas.updateContent(e.target.value)}
            placeholder="Enter your content here..."
          />
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="canvas-actions">
        <button
          className="canvas-action-btn"
          onClick={() => onSendToChat(canvas.content)}
        >
          发送给 AMY
        </button>
        <button className="canvas-action-btn" onClick={handleExport}>
          导出
        </button>
      </div>
    </div>
  );
}