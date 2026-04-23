import { useCallback, useState } from 'react';
import { useWorkbench } from '../../workbench/WorkbenchContext';
import { resolveWorkbenchPlugin } from '../../workbench/plugins';
import DocumentAppendBar from './DocumentAppendBar';
import { inferImportedTextArtifactType, parseScript } from '../../utils/scriptParser';
import type { WorkbenchArtifactType } from '../../workbench/types';
import '../CanvasPanel.css';

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : null;

export default function WorkbenchPanel() {
  const workbench = useWorkbench();
  const activeDocument = workbench.activeDocument;
  const hasMultipleDocuments = workbench.documents.length > 1;
  const [importing, setImporting] = useState(false);

  // 中文字数：去掉所有空白字符后的长度，对中英文混排都是合理近似
  const cnCharCount = activeDocument?.content
    ? activeDocument.content.replace(/\s+/g, '').length
    : 0;

  // 阅读时长：按中文 400 字/分钟估算，最少 1 分钟
  const readMinutes = cnCharCount > 0 ? Math.max(1, Math.ceil(cnCharCount / 400)) : 0;

  // 是否为文档类，控制是否在 toolbar 显示字数与阅读时长
  const isDocumentArtifact = activeDocument?.artifactType === 'document';
  const canToggleScriptView = !!activeDocument
    && activeDocument.mode === 'markdown'
    && (activeDocument.artifactType === 'document' || activeDocument.artifactType === 'script');
  const toggleArtifactTarget: WorkbenchArtifactType | null = !canToggleScriptView
    ? null
    : activeDocument?.artifactType === 'script'
      ? 'document'
      : 'script';

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
    const plugin = resolveWorkbenchPlugin(activeDocument);
    const exportContent = plugin?.getExportContent?.(activeDocument) ?? activeDocument.content;

    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const filename = plugin?.getExportFilename?.(activeDocument) || 'workbench.txt';

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeDocument]);

  const handleDelete = useCallback(() => {
    if (!activeDocument) return;
    workbench.deleteDocument(activeDocument.id);
  }, [activeDocument, workbench]);

  const handleToggleScriptView = useCallback(() => {
    if (!activeDocument || !toggleArtifactTarget) return;
    workbench.updateDocument(activeDocument.id, {
      artifactType: toggleArtifactTarget,
    });
  }, [activeDocument, toggleArtifactTarget, workbench]);

  // 上传文本文件（剧本优先，正文自动回退到 document）
  const handleImportScript = useCallback(async () => {
    if (!ipcRenderer || importing) return;
    setImporting(true);
    try {
      const result: {
        success: boolean;
        text?: string;
        fileName?: string;
        sourcePath?: string;
        draftCachePath?: string;
        error?: string;
      } =
        await ipcRenderer.invoke('parse-script-file');
      if (!result.success || !result.text) return;

      const artifactType = inferImportedTextArtifactType(result.text);
      const parsed = parseScript(result.text);
      const fallbackTitle = artifactType === 'script' ? '剧本' : '文档';
      const title = parsed.title || result.fileName?.replace(/\.(docx|txt)$/i, '') || fallbackTitle;

      workbench.openCanvas(result.text, 'markdown', title, 'text', artifactType, {
        sourcePath: result.sourcePath,
        draftCachePath: artifactType === 'script' ? result.draftCachePath : undefined,
      });
    } catch (err) {
      console.error('[ScriptImport] 解析失败:', err);
    } finally {
      setImporting(false);
    }
  }, [importing, workbench]);

  const renderPreview = () => {
    if (!activeDocument) return null;
    const plugin = resolveWorkbenchPlugin(activeDocument);
    return plugin ? plugin.render(activeDocument) : null;
  };

  const renderEmptyState = () => (
    <div className="canvas-empty">
      <div className="canvas-empty-title">Workbench</div>
      <div className="canvas-empty-copy">
        Open a code block or send a structured result here to start building artifacts.
      </div>
      <button
        className="canvas-action-btn"
        style={{ marginTop: '16px' }}
        onClick={handleImportScript}
        disabled={importing}
      >
        {importing ? '解析中…' : '📄 上传文本'}
      </button>
    </div>
  );

  return (
    <div className="canvas-panel">
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-title-group">
          <div className="canvas-toolbar-title">
            {activeDocument?.title || 'Workbench'}
          </div>
          {activeDocument && (
            <div className="canvas-toolbar-meta">
              {activeDocument.artifactType} · {activeDocument.origin} · v{activeDocument.version}
              {isDocumentArtifact && cnCharCount > 0 && (
                <> · {cnCharCount.toLocaleString('zh-CN')} 字 · 约 {readMinutes} 分钟</>
              )}
            </div>
          )}
        </div>
        {hasMultipleDocuments && (
          <div className="canvas-toolbar-switcher">
            <select
              className="canvas-document-select"
              value={workbench.activeDocumentId ?? ''}
              onChange={(e) => workbench.setActiveDocument(e.target.value)}
            >
              {workbench.documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="canvas-toolbar-actions">
          {/* 文本上传按钮（剧本优先，正文自动回退） */}
          <button
            className="canvas-action-btn"
            onClick={handleImportScript}
            disabled={importing}
            title="上传 .txt 或 .docx 文本文件"
          >
            {importing ? '解析中…' : '📄 文本'}
          </button>
          {canToggleScriptView && (
            <button
              className="canvas-action-btn"
              onClick={handleToggleScriptView}
              title={toggleArtifactTarget === 'script' ? '切换到剧本编辑器视图' : '切换回普通文档视图'}
            >
              {toggleArtifactTarget === 'script' ? '切到 Script' : '切到 Document'}
            </button>
          )}
          <button className="canvas-action-btn" onClick={handleCopy} disabled={!activeDocument}>
            Copy
          </button>
          <button className="canvas-action-btn" onClick={handleExport} disabled={!activeDocument}>
            Export
          </button>
          <button className="canvas-action-btn canvas-delete-btn" onClick={handleDelete} disabled={!activeDocument}>
            Delete
          </button>
          <button className="canvas-action-btn" onClick={workbench.closeCanvas}>
            ✕
          </button>
        </div>
      </div>

      <div className="canvas-workspace canvas-workspace--studio">
        {!activeDocument ? (
          <div className="canvas-content canvas-content--single">
            {renderEmptyState()}
          </div>
        ) : (
          <div className="canvas-content canvas-content--studio">
            {renderPreview()}
          </div>
        )}
      </div>

      {activeDocument?.artifactType === 'document' && (
        <DocumentAppendBar />
      )}
    </div>
  );
}
