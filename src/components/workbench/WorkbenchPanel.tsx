import { useCallback, useState } from 'react';
import { useWorkbench } from '../../workbench/WorkbenchContext';
import { resolveWorkbenchPlugin } from '../../workbench/plugins';
import '../CanvasPanel.css';

export default function WorkbenchPanel() {
  const workbench = useWorkbench();
  const activeDocument = workbench.activeDocument;
  const hasMultipleDocuments = workbench.documents.length > 1;
  const [showDetails, setShowDetails] = useState(false);
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

    const blob = new Blob([activeDocument.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const plugin = resolveWorkbenchPlugin(activeDocument);
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
    </div>
  );
}
