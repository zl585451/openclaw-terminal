import { useCallback, useState } from 'react';
import { useWorkbench } from '../../workbench/WorkbenchContext';
import { resolveWorkbenchPlugin } from '../../workbench/plugins';
import DocumentAppendBar from './DocumentAppendBar';
import type { WorkbenchArtifactType } from '../../workbench/types';
import { useProject } from '../../contexts/ProjectContext';
import { getChapterText } from '../../modules/script-adapter/services/aiLibraryClient';
import '../CanvasPanel.css';

export default function WorkbenchPanel() {
  const workbench = useWorkbench();
  const activeDocument = workbench.activeDocument;
  const hasMultipleDocuments = workbench.documents.length > 1;

  // ─── 从项目加载章节 ────────────────────────────────────────────────────────
  const { activeProject } = useProject();
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);

  const handleLoadChapter = useCallback(async (chapterIndex: number) => {
    if (!activeProject) return;
    setChapterLoading(true);
    setChapterError(null);
    try {
      const { chapter, text } = await getChapterText(activeProject.id, chapterIndex);
      const title = chapter.title ?? `第 ${chapterIndex + 1} 章`;
      workbench.createDocument({
        title: `${activeProject.title} · ${title}`,
        content: text,
        artifactType: 'script',
        mode: 'markdown',
        origin: 'user',
        projectBookId: activeProject.id,
        projectChapterIndex: chapterIndex,
      });
    } catch (e) {
      setChapterError(e instanceof Error ? e.message : String(e));
    } finally {
      setChapterLoading(false);
    }
  }, [activeProject, workbench]);

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

  const renderPreview = () => {
    if (!activeDocument) return null;
    const plugin = resolveWorkbenchPlugin(activeDocument);
    return plugin ? plugin.render(activeDocument) : null;
  };

  const renderEmptyState = () => (
    <div className="canvas-empty">
      <div className="canvas-empty-title">Workbench</div>
      <div className="canvas-empty-copy">
        AMY 的产出物会出现在这里。先在书库里选定当前项目，再开始对话或执行内容制作。
      </div>

      {activeProject && activeProject.chapters.length > 0 && (
        <div className="canvas-chapter-loader">
          <div className="canvas-chapter-loader-label">
            📖 {activeProject.title} — 加载章节到 Canvas
          </div>
          <select
            className="canvas-chapter-select"
            defaultValue=""
            disabled={chapterLoading}
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (!isNaN(idx)) handleLoadChapter(idx);
              e.target.value = '';
            }}
          >
            <option value="" disabled>选择章节…</option>
            {activeProject.chapters.map((ch) => (
              <option key={ch.chapter_index} value={ch.chapter_index}>
                {ch.title ?? `第 ${ch.chapter_index + 1} 章`}
                {ch.char_count ? `（${ch.char_count.toLocaleString('zh-CN')} 字）` : ''}
              </option>
            ))}
          </select>
          {chapterLoading && <span className="canvas-chapter-loading">加载中…</span>}
          {chapterError && <span className="canvas-chapter-error">{chapterError}</span>}
        </div>
      )}

      {!activeProject && (
        <div className="canvas-chapter-loader-hint">
          在书库里点击「设为当前项目」后，可直接在这里加载章节内容。
        </div>
      )}
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
