import { useCallback, useState } from 'react';
import { useWorkbench } from '../../workbench/WorkbenchContext';
import { resolveWorkbenchPlugin } from '../../workbench/plugins';
import { isReadingWorkbenchArtifact } from '../../workbench/types';
import { useProject } from '../../contexts/ProjectContext';
import { getChapterText, saveChapterText } from '../../modules/script-adapter/services/aiLibraryClient';
import '../CanvasPanel.css';

const ARTIFACT_LABELS: Record<string, string> = {
  reading: '阅读',
  artifact: 'Artifact · 文稿',
  script: 'Artifact · 剧本',
  code: 'Artifact · 代码',
  'ui-draft': 'Artifact · UI 草稿',
  diagram: 'Artifact · 图表',
  'react-flow': 'Artifact · 节点图',
  echart: 'Artifact · 数据图表',
};

export default function WorkbenchPanel() {
  const workbench = useWorkbench();
  const activeDocument = workbench.activeDocument;
  const hasMultipleDocuments = workbench.documents.length > 1;

  // ─── 从项目加载章节 ────────────────────────────────────────────────────────
  const { activeProject, setActiveProjectById } = useProject();
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [isSavingProjectChapter, setIsSavingProjectChapter] = useState(false);
  const [projectChapterSaveStatus, setProjectChapterSaveStatus] = useState<string | null>(null);

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
        artifactType: 'reading',
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

  const isReadingArtifact = isReadingWorkbenchArtifact(activeDocument);
  const artifactLabel = activeDocument?.projectBookId
    ? '项目章节'
    : activeDocument
      ? (ARTIFACT_LABELS[activeDocument.artifactType] || activeDocument.artifactType)
      : '';
  const canSaveProjectChapter = !!activeDocument?.projectBookId
    && Number.isInteger(activeDocument.projectChapterIndex)
    && !!activeDocument.content;

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

  const handleSaveProjectChapter = useCallback(async () => {
    if (!activeDocument?.projectBookId || !Number.isInteger(activeDocument.projectChapterIndex)) return;
    setIsSavingProjectChapter(true);
    setProjectChapterSaveStatus(null);
    try {
      const result = await saveChapterText(
        activeDocument.projectBookId,
        Number(activeDocument.projectChapterIndex),
        activeDocument.content,
      );
      workbench.updateDocument(activeDocument.id, {
        content: result.text,
        title: `${activeProject?.title || activeDocument.title} · ${result.chapter.title || `第 ${result.chapter.chapter_index + 1} 章`}`,
        projectChapterIndex: result.chapter.chapter_index,
      });
      await setActiveProjectById(activeDocument.projectBookId);
      setProjectChapterSaveStatus('已保存到原文件');
    } catch (error) {
      setProjectChapterSaveStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingProjectChapter(false);
    }
  }, [activeDocument, activeProject?.title, setActiveProjectById, workbench]);

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
            📖 {activeProject.title} — 打开章节到 Canvas
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
              {artifactLabel} · {activeDocument.origin} · v{activeDocument.version}
              {isReadingArtifact && cnCharCount > 0 && (
                <> · {cnCharCount.toLocaleString('zh-CN')} 字 · 约 {readMinutes} 分钟</>
              )}
              {projectChapterSaveStatus && (
                <> · {projectChapterSaveStatus}</>
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
          {canSaveProjectChapter && (
            <button
              className="canvas-action-btn"
              onClick={handleSaveProjectChapter}
              disabled={isSavingProjectChapter}
              title="把当前 Canvas 内容写回项目书库中的原章节文件"
            >
              {isSavingProjectChapter ? 'Saving...' : '保存原文件'}
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
    </div>
  );
}
