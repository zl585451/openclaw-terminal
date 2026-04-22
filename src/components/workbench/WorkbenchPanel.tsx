import { useCallback, useState } from 'react';
import { useWorkbench } from '../../workbench/WorkbenchContext';
import { resolveWorkbenchPlugin } from '../../workbench/plugins';
import DocumentAppendBar from './DocumentAppendBar';
import { inferImportedTextArtifactType, parseScript } from '../../utils/scriptParser';
import '../CanvasPanel.css';

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : null;

export default function WorkbenchPanel() {
  const workbench = useWorkbench();
  const activeDocument = workbench.activeDocument;
  const hasMultipleDocuments = workbench.documents.length > 1;
  const [showDetails, setShowDetails] = useState(false);
  const [importing, setImporting] = useState(false);
  const lineCount = activeDocument?.content ? activeDocument.content.split(/\r?\n/).length : 0;
  const charCount = activeDocument?.content?.length || 0;
  const updatedAtLabel = activeDocument
    ? new Date(activeDocument.updatedAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // 中文字数：去掉所有空白字符后的长度，对中英文混排都是合理近似
  const cnCharCount = activeDocument?.content
    ? activeDocument.content.replace(/\s+/g, '').length
    : 0;

  // 阅读时长：按中文 400 字/分钟估算，最少 1 分钟
  const readMinutes = cnCharCount > 0 ? Math.max(1, Math.ceil(cnCharCount / 400)) : 0;

  // 是否为文档类，控制是否在 toolbar 显示字数与阅读时长
  const isDocumentArtifact = activeDocument?.artifactType === 'document';

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
          <button
            className="canvas-action-btn"
            onClick={() => setShowDetails((prev) => !prev)}
            disabled={!activeDocument}
          >
            {showDetails ? 'Hide Details' : 'Details'}
          </button>
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

      {activeDocument && showDetails && (
        <div className="canvas-details-panel">
          <div className="canvas-studio-card">
            <div className="canvas-studio-card-title">作品说明</div>
            <div className="canvas-studio-card-body">
              {activeDocument.explanation?.trim() || '当前产物暂无说明。你可以继续让 AI 解释设计意图或补充关键要点。'}
            </div>
          </div>
          <div className="canvas-studio-card">
            <div className="canvas-studio-card-title">元信息</div>
            <div className="canvas-studio-meta-grid">
              <div className="canvas-studio-meta-item">
                <span className="canvas-studio-meta-key">类型</span>
                <span className="canvas-studio-meta-value">{activeDocument.artifactType}</span>
              </div>
              <div className="canvas-studio-meta-item">
                <span className="canvas-studio-meta-key">模式</span>
                <span className="canvas-studio-meta-value">{activeDocument.mode}</span>
              </div>
              <div className="canvas-studio-meta-item">
                <span className="canvas-studio-meta-key">版本</span>
                <span className="canvas-studio-meta-value">v{activeDocument.version}</span>
              </div>
              <div className="canvas-studio-meta-item">
                <span className="canvas-studio-meta-key">来源</span>
                <span className="canvas-studio-meta-value">{activeDocument.origin}</span>
              </div>
              <div className="canvas-studio-meta-item">
                <span className="canvas-studio-meta-key">行数</span>
                <span className="canvas-studio-meta-value">{lineCount}</span>
              </div>
              <div className="canvas-studio-meta-item">
                <span className="canvas-studio-meta-key">字符</span>
                <span className="canvas-studio-meta-value">{charCount}</span>
              </div>
              <div className="canvas-studio-meta-item">
                <span className="canvas-studio-meta-key">更新</span>
                <span className="canvas-studio-meta-value">{updatedAtLabel}</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
