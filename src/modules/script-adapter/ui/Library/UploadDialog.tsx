import { useMemo, useState } from 'react';
import { pickLocalFile, uploadBook } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

interface UploadDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function UploadDialog({ onClose, onSuccess }: UploadDialogProps) {
  const [filePath, setFilePath] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileName = useMemo(() => filePath.split(/[\\/]/).pop() || '', [filePath]);

  const applyFilePath = (nextPath: string) => {
    if (!/\.(txt|md)$/i.test(nextPath)) {
      setError('暂不支持 .docx，请先转成 .txt 或 .md');
      return;
    }
    setError(null);
    setFilePath(nextPath);
    if (!title.trim()) {
      setTitle((nextPath.split(/[\\/]/).pop() || '').replace(/\.(txt|md)$/i, ''));
    }
  };

  const handlePick = async () => {
    const picked = await pickLocalFile();
    if (picked) applyFilePath(picked);
  };

  const handleUpload = async () => {
    if (!filePath) return setError('请先选择文件');
    if (!title.trim()) return setError('请填写书名');

    setUploading(true);
    setError(null);
    try {
      await uploadBook({ filePath, title: title.trim(), author: author.trim() || undefined });
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.libraryOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.uploadDialog}>
        <header className={styles.uploadDialogHeader}>
          <div>
            <h3>上传新书</h3>
            <p>支持拖拽或点击选择 `.txt` / `.md` 小说文件</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>关闭</button>
        </header>

        <button
          type="button"
          className={`${styles.uploadDropZone} ${dragging ? styles.uploadDropZoneActive : ''}`}
          onClick={() => void handlePick()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const droppedFile = e.dataTransfer.files?.[0] as (File & { path?: string }) | undefined;
            const droppedPath = droppedFile?.path;
            if (droppedPath) applyFilePath(droppedPath);
          }}
        >
          <strong>{fileName || '拖一个文本文件到这里'}</strong>
          <span>{filePath || '或点击这里打开系统文件选择器'}</span>
        </button>

        <label className={styles.uploadField}>
          <span>书名</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：第七日夜" />
        </label>

        <label className={styles.uploadField}>
          <span>作者（可选）</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="例如：余华" />
        </label>

        {error ? <div className={styles.libraryError}>{error}</div> : null}

        <footer className={styles.uploadDialogFooter}>
          <button type="button" className={styles.ghostButton} onClick={onClose} disabled={uploading}>取消</button>
          <button type="button" className={styles.confirmStartButton} onClick={() => void handleUpload()} disabled={uploading}>
            {uploading ? '上传中…' : '开始上传'}
          </button>
        </footer>
      </div>
    </div>
  );
}
