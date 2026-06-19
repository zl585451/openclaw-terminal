import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import QuickCommandMenu from '../../components/QuickCommandMenu';
import type { UploadedFile } from './chatTypes';

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : {
        invoke: () => Promise.resolve(null),
        on: () => {},
        off: () => {},
        removeListener: () => {},
      };

export interface ChatInputAreaProps {
  imagePreview: string | null;
  setImagePreview: React.Dispatch<React.SetStateAction<string | null>>;
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  onSend: (text: string, imageDataUrl: string | null, files?: UploadedFile[]) => void;
  onStop?: () => void;
  wsConnected: boolean;
  isStreaming: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  injectInputText?: string | null;
  onInjectConsumed?: () => void;
  onClearHistory?: () => void;
  onRestartGateway?: () => void;
  hasPendingPills?: boolean;
  extraControls?: React.ReactNode;
  /** 输入框下方的控件条（模型 / 思考强度等） */
  bottomBar?: React.ReactNode;
  /** When true, show first-time friendly placeholder copy */
  isEmptyConversation?: boolean;
}

const ChatInputArea = memo(function ChatInputArea({
  imagePreview,
  setImagePreview,
  uploadedFiles,
  setUploadedFiles,
  onSend,
  onStop,
  wsConnected,
  isStreaming,
  inputRef,
  injectInputText,
  onInjectConsumed,
  onClearHistory,
  onRestartGateway,
  hasPendingPills,
  extraControls,
  bottomBar,
  isEmptyConversation = false,
}: ChatInputAreaProps) {
  const conversationPlaceholder = useMemo(() => {
    if (isEmptyConversation) {
      return '今天想让OCT帮你做什么？';
    }
    return '继续聊,或按 / 唤出命令';
  }, [isEmptyConversation]);
  const [inputValue, setInputValue] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [inputFocused, setInputFocused] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const quickMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const [inputFlash, setInputFlash] = useState(false);

  const handleSend = useCallback(() => {
    if (isStreaming) {
      onStop?.();
      return;
    }
    const text = inputValue.trim();
    if (!text && !imagePreview && uploadedFiles.length === 0) return;
    if (text) {
      setInputHistory((prev) => [text, ...prev.slice(0, 49)]);
      setHistoryIndex(-1);
    }
    setInputFlash(true);
    setTimeout(() => setInputFlash(false), 400);
    onSend(text, imagePreview, uploadedFiles.length > 0 ? uploadedFiles : undefined);
    setInputValue('');
    setImagePreview(null);
    setUploadedFiles([]);
  }, [imagePreview, inputValue, isStreaming, onSend, onStop, setImagePreview, setUploadedFiles, uploadedFiles]);

  const handlePickFiles = async () => {
    const r = await ipcRenderer.invoke('open-file-dialog', { allowMultiple: true });
    if (r?.success && r.files) {
      setUploadedFiles((prev) => [...prev, ...r.files]);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleQuickCommand = useCallback((sendText: string) => {
    onSend(sendText, null);
  }, [onSend]);

  const resetInputHeight = useCallback((el: HTMLTextAreaElement) => {
    el.style.removeProperty('height');
    el.style.overflowY = 'hidden';
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!inputValue) {
      resetInputHeight(el);
      return;
    }
    el.style.height = '40px';
    el.style.overflowY = el.scrollHeight > 150 ? 'auto' : 'hidden';
    el.style.height = Math.min(Math.max(el.scrollHeight, 40), 150) + 'px';
  }, [inputValue, inputRef, resetInputHeight]);

  useEffect(() => {
    if (injectInputText != null) {
      setInputValue(injectInputText);
      setHistoryIndex(-1);
      onInjectConsumed?.();
    }
  }, [injectInputText, onInjectConsumed]);

  return (
    <>
      {imagePreview && (
        <div className="image-preview-wrap">
          <img src={imagePreview} alt="预览" className="image-preview" />
          <button type="button" className="image-remove" onClick={() => setImagePreview(null)}>×</button>
        </div>
      )}
      {uploadedFiles.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px',
          padding: '8px 12px 0 12px',
        }}>
          {uploadedFiles.map((file, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '8px 10px',
                maxWidth: '200px',
                position: 'relative',
              }}
            >
              <div style={{
                width: '36px', height: '36px',
                background: 'var(--bg-surface)',
                borderRadius: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', flexShrink: 0,
                overflow: 'hidden',
              }}>
                {file.mimeType.startsWith('image/') && file.base64 ? (
                  <img
                    src={`data:${file.mimeType};base64,${file.base64}`}
                    alt=""
                    style={{
                      width: '36px', height: '36px',
                      objectFit: 'cover', borderRadius: '6px',
                    }}
                  />
                ) : file.mimeType.includes('pdf') ? '📄' : file.mimeType.includes('audio') ? '🎵' : file.mimeType.includes('video') ? '🎬' : file.name.endsWith('.txt') ? '📝' : '📎'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{
                  fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: '120px',
                }}>{file.name}</div>
                <div style={{
                  fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                }}>{formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '16px', height: '16px',
                  background: 'var(--status-error-bg)', border: '1px solid var(--status-error)',
                  borderRadius: '50%', color: 'var(--status-error)',
                  fontSize: '10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1, padding: 0,
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}
      <div className={`chat-input-area ${inputFocused ? 'focused' : ''} ${inputFlash ? 'flash' : ''}`}>
        <QuickCommandMenu
          anchorRef={quickMenuAnchorRef}
          visible={quickMenuOpen}
          onClose={() => setQuickMenuOpen(false)}
          onSelect={handleQuickCommand}
          onClearHistory={onClearHistory}
          onRestartGateway={onRestartGateway}
        />
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className={`chat-input chat-input-textarea ${inputFocused ? 'focused' : ''} ${inputFlash ? 'flash' : ''}`}
          value={inputValue}
          onChange={(e) => {
            const v = e.target.value;
            setInputValue(v);
            const ta = e.target;
            if (!v) {
              resetInputHeight(ta);
              return;
            }
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
          }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (isStreaming) return;
              handleSend();
              return;
            }
            if (e.key === 'ArrowUp' && (inputValue === '' || historyIndex >= 0)) {
              e.preventDefault();
              const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
              setHistoryIndex(newIndex);
              setInputValue(inputHistory[newIndex] || '');
              return;
            }
            if (e.key === 'ArrowDown' && historyIndex >= 0) {
              e.preventDefault();
              const newIndex = historyIndex - 1;
              setHistoryIndex(newIndex);
              setInputValue(newIndex >= 0 ? inputHistory[newIndex] : '');
              return;
            }
          }}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
              if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                  const r = new FileReader();
                  r.onload = () => setImagePreview(String(r.result));
                  r.readAsDataURL(file);
                }
                break;
              }
            }
          }}
          placeholder={hasPendingPills ? '或者自己输入...' : conversationPlaceholder}
          rows={1}
        />
        <div className="composer-toolbar">
          <div className="composer-toolbar-left">
            <button
              ref={quickMenuAnchorRef}
              type="button"
              className="composer-icon-btn"
              onClick={() => setQuickMenuOpen((v) => !v)}
              title="快捷指令"
            >＋</button>
            <button type="button" className="composer-icon-btn" title="添加附件（或拖拽文件到此处）" onClick={handlePickFiles}>📎</button>
            {extraControls}
            {bottomBar}
          </div>
          <button
            className={`composer-send ${isStreaming ? 'composer-send--stop' : ''}`}
            onClick={handleSend}
            disabled={!isStreaming && (!inputValue.trim() && !imagePreview && uploadedFiles.length === 0)}
            title={isStreaming ? '停止当前任务' : !wsConnected ? '连接..' : '发送'}
          >
            {isStreaming ? '■' : '↑'}
          </button>
        </div>
      </div>
    </>
  );
});

export default ChatInputArea;
