import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
// xterm 已完全移除以修复闪退问题
import '../../styles/ChatTab.css';
import '../../components/ResponseTray.css';
import { useTypewriter } from '../../hooks/useTypewriter';
import { useGateway } from '../../hooks/useGateway';
import { useMessages } from '../../hooks/useMessages';
import { useFileAttachment } from '../../hooks/useFileAttachment';
import { useTimers } from '../../hooks/useTimers';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useScrollManager } from '../../hooks/useScrollManager';
import { ContextMenu } from '../../components/ContextMenu';
import SettingsPanel from '../../components/SettingsPanel';
import SetupGuide from '../../components/SetupGuide';
import { TurnFSM } from '../../core/turnFSM';
import { StreamRouter } from '../../core/streamRouter';
import { BlockIngest } from '../../core/blockIngest';
import { useSettings } from '../../contexts/SettingsContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useCanvas } from '../../contexts/CanvasContext';
import CanvasPanel from '../../components/CanvasPanel';
// playClickSound, resetSoundCounter 已迁移到 useTypewriter hook
import { stripThinkModeMarker } from '../../utils/socraticTemplates';
import { clearProcessedMarkdownCache } from '../../utils/markdownPreprocess';
import { createMarkdownComponents } from './markdownComponents';
import ChatInputArea from './ChatInput';
import { ChatMessageList } from './MessageList';
import ChatTabRightPanel from './ChatTabRightPanel';

/** ChatTab.v2：打字机逻辑已迁移到 useTypewriter hook */
// const OCT_V2_DISABLE_TYPEWRITER = false; // 已不再需要

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : {
        invoke: () => Promise.resolve(null),
        on: () => {},
        off: () => {},
        removeListener: () => {},
      };
// 日志路径main 进程根据平台提供，前端仅env 未设置时传空
// 已改DOM 渲染，此函数保留供参// function getLogAnsiColor(line: string): string {
//   if (line.startsWith('[ERR]') || /\[ERROR\]/i.test(line)) return '\x1b[38;2;255;68;68m';
//   if (/\[WARN\]/i.test(line)) return '\x1b[38;2;255;170;0m';
//   if (/\[LOG\]/i.test(line)) return '\x1b[38;2;0;204;204m';
//   return '\x1b[32m';
// }

// const LOG_NOISE_PATTERNS = [
//   'typing indicator',
//   'sending 1 card chunks',
//   'sending 2 card chunks',
//   'sending 3 card chunks',
//   'dispatch complete',
//   'card chunks',
// ];

// formatTime / formatFullTime 已迁移到 MessageList.tsx

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  /** 流式阶段仅累积原始文本并用 <pre> 展示，避免每批 token 触发 Markdown 全量解析 */
  isStreamingRaw?: boolean;
  timestamp: string | number;
  imageDataUrl?: string;
  isSystemReply?: boolean;
  files?: UploadedFile[];
}

export interface UploadedFile {
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  isText: boolean;
  content: string | null;
  base64?: string;
  /** 文件绝对路径，AMY 可用 read_file 读取；无 path 时（如拖入的非本地文件）不可用 */
  path?: string;
}


// MsgCopyButton / TypewriterCursor / FinalizedMarkdownContent / SystemMessage
// MessageMeta / MessageHeader / UserMessageBody / AssistantMessageBody
// MessageRow / ChatMessageItem / ChatMessageItemProps
// 已全部迁移到 src/ui/chat/MessageList.tsx





function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .trim();
}

interface ChatTabProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getNextMessageId: () => number;
  onStatusChange?: (wsConnected: boolean, isStreaming: boolean, modelName?: string, tokenIn?: number | null, tokenOut?: number | null, ctxUsed?: number | null, ctxMax?: number | null) => void;
}


const ChatTab: React.FC<ChatTabProps> = ({ messages, setMessages, getNextMessageId, onStatusChange }) => {
  const { settings, setSettings, streamSpeedMs } = useSettings();
  const { permissions } = usePermissions();
  const canvas = useCanvas();

  const mdComponents = useMemo(
    () => createMarkdownComponents(canvas.openCanvas),
    [canvas.openCanvas]
  );

  const octRuntimeRef = useRef<{ fsm: TurnFSM; stream: StreamRouter; ingest: BlockIngest } | null>(null);
  if (!octRuntimeRef.current) {
    const fsm = new TurnFSM();
    octRuntimeRef.current = { fsm, stream: new StreamRouter(fsm), ingest: new BlockIngest() };
  }
  const oct = octRuntimeRef.current;

  const typewriter = useTypewriter({
    enabled: false,
    baseDelayMs: streamSpeedMs,
    typingSound: settings.typingSound,
    onFinished: (finalText) => {
      // 已禁用消息内容日志输出
      // console.log('[MSG-FINALIZE] finalText length:', finalText?.length, 'preview:', finalText?.slice(0, 200));
      const finalRaw = stripThinkModeMarker(finalText || '');
      try { oct.fsm.onTurnFinish(); } catch (e) { console.warn('[ChatTab.v2] fsm.onTurnFinish', e); }
      oct.ingest.reset();
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.isStreaming) {
          return prev.map((msg, i) =>
            i === prev.length - 1
              ? { ...msg, content: finalRaw || msg.content, isStreaming: false, isStreamingRaw: false }
              : msg
          );
        }
        return prev;
      });
    },
  });

  const files = useFileAttachment();
  const timers = useTimers();
  const { windowFocused } = timers;
  const ctxMenu = useContextMenu();

  // useWebSocket / 消息状态 / 入站分发 已迁移到 useMessages hook

  // ── UI-only state (消息状态已迁移到 useMessages) ────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [, setLogPath] = useState('');
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const [injectInputText, setInjectInputText] = useState<string | null>(null);

  const getToolDisplayName = useCallback((tool: string): string => {
    const map: Record<string, string> = {
      'read_file': '📖 读取文件',
      'write_file': '✏️ 写入文件',
      'list_files': '📂 列出文件',
      'run_bash': '💻 执行命令',
      'str_replace_editor': '🔧 编辑文件',
      'create_folder': '📁 创建文件夹',
      'move_file': '🔄 移动文件',
      'search_files': '🔍 搜索文件',
    };
    return map[tool] || tool;
  }, []);

  const onMessageContextMenu = useCallback(
    (e: React.MouseEvent, msg: ChatMessage, raw: string) => {
      ctxMenu.onContextMenu(e, msg.id, raw);
    },
    [ctxMenu.onContextMenu]
  );

  const onQuoteQuestion = useCallback((text: string) => {
    setInjectInputText(text);
  }, []);

  // ── UI-only refs ──────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── scrollBridgeRef：打破 useMessages↔useScrollManager 的循环依赖 ───────
  // useMessages 通过此 ref 桥接调用 scroll.reconcile / scrollAfterUserSend，
  // useScrollManager 则依赖来自 msgs 的 isStreaming / awaitingResponse。
  const scrollBridgeRef = useRef({
    reconcile: () => {},
    scrollAfterUserSend: () => {},
  });

  const msgs = useMessages({
    oct,
    typewriter,
    scroll: {
      reconcile: () => scrollBridgeRef.current.reconcile(),
      scrollAfterUserSend: () => scrollBridgeRef.current.scrollAfterUserSend(),
    },
    getNextMessageId,
    messages,
    setMessages,
    permissions,
    streamSpeedMs,
    onStatusChange,
  });

  const scroll = useScrollManager({
    fsm: oct.fsm,
    isStreaming: msgs.isStreaming,
    awaitingResponse: msgs.awaitingResponse,
    messagesLength: messages.length,
  });

  // 每次渲染后同步 ref，确保 msgs 内回调始终调到最新的 scroll 方法
  scrollBridgeRef.current.reconcile = scroll.reconcile;
  scrollBridgeRef.current.scrollAfterUserSend = scroll.scrollAfterUserSend;

  const suspendGatewayLogRef = useRef(false);
  const isStreamingUiPause = msgs.isStreaming;
  suspendGatewayLogRef.current = isStreamingUiPause;
  const gateway = useGateway(suspendGatewayLogRef);

  useEffect(() => {
    if (!isStreamingUiPause) {
      gateway.flushPendingLogLines();
    }
  }, [isStreamingUiPause, gateway.flushPendingLogLines]);


  useEffect(() => {
    if (!settings.ttsPlayback && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setSpeakingMessageId(null);
    }
  }, [settings.ttsPlayback]);

  useEffect(() => {
    ipcRenderer.invoke('get-env', 'OPENCLAW_LOG_PATH').then((p: string) => {
        if (p) setLogPath(p);
        // 自动启动日志监控
        ipcRenderer.invoke('start-log-watch', p || '');
      });
  }, []);




  const prevStreamingRef = useRef(false);
  const lastAssistantMsgIdRef = useRef(0);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && last.id !== lastAssistantMsgIdRef.current) {
      lastAssistantMsgIdRef.current = last.id;
    }
  }, [messages]);

  const playTTSForMessage = useCallback(async (msg: ChatMessage) => {
    if (!settings.ttsPlayback || !msg.content) return;
    const plain = stripMarkdown(msg.content);
    const truncated = plain.length > 200 ? plain.slice(0, 200) + '...详细内容请查看聊天窗口' : plain;
    if (!truncated.trim()) return;
    setSpeakingMessageId(msg.id);
    const result = await ipcRenderer.invoke('tts-speak', { text: truncated });
    if (!result?.success || !result.audioBase64) {
      setSpeakingMessageId(null);
      return;
    }
    const audio = new Audio('data:audio/mp3;base64,' + result.audioBase64);
    audioRef.current = audio;
    audio.onended = () => {
      setSpeakingMessageId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setSpeakingMessageId(null);
      audioRef.current = null;
    };
    audio.play().catch(() => setSpeakingMessageId(null));
  }, [settings.ttsPlayback]);

  useEffect(() => {
    if (prevStreamingRef.current && !msgs.isStreaming) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content) {
        if (!windowFocused) {
          const preview = lastMsg.content.slice(0, 30).replace(/\s+/g, ' ') + (lastMsg.content.length > 30 ? '...' : '');
          ipcRenderer.invoke('show-notification', { title: `${settings.aiName || 'OpenClaw'} 回复`, body: preview });
        }
        playTTSForMessage(lastMsg);
      }
    }
    prevStreamingRef.current = msgs.isStreaming;
  }, [msgs.isStreaming, messages, windowFocused, playTTSForMessage]);


  const handleClearHistory = useCallback(() => {
    if (!window.confirm('确认清空所有聊天记录？')) return;
    clearProcessedMarkdownCache();
    setMessages([]);
    (window as any).electronAPI?.chatHistorySave?.([]);
  }, []);


  // scrollManager: handleChatScroll / useLayoutEffects 已迁移到 useScrollManager hook


  return (
    <>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      <ContextMenu
        contextMenu={ctxMenu.contextMenu}
        onClose={() => ctxMenu.setContextMenu(null)}
        onCopy={ctxMenu.onCopy}
        onResend={(text) => { setInjectInputText(text); ctxMenu.setContextMenu(null); }}
        onDelete={(msgId) => setMessages((prev) => prev.filter((m) => m.id !== msgId))}
      />
    <div
      className={`chat-tab${canvas.isOpen ? ' canvas-active' : ''}`}
      onPaste={files.handlePaste}
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer?.types?.includes('Files')) files.setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) files.setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        files.setDragging(false);
        const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
        if (droppedFiles.length > 0) files.handleFileAttach(droppedFiles);
      }}
    >
      <div className={`chat-section ${files.isDragging ? 'drag-over' : ''}`} style={{ position: 'relative' }}>
        {files.isDragging && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'var(--accent-primary-muted)',
            border: '2px dashed var(--accent-primary)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            pointerEvents: 'none',
          }}>
            <span style={{
              color: 'var(--accent-primary)',
              fontSize: 'var(--text-lg)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '3px',
              textShadow: '0 0 10px var(--glow-color)',
            }}>⬇ DROP FILES HERE</span>
          </div>
        )}
        {/* VOICE / SETTINGS / CONNECTED 通过 portal 渲染到 TabBar 右侧 */}
        {typeof document !== 'undefined' && document.getElementById('chat-header-portal') && createPortal(
          <>
            <button
              type="button"
              className={`voice-toggle ${settings.ttsPlayback ? 'on' : 'off'}`}
              onClick={() => setSettings((s) => ({
                ...s,
                ttsPlayback: !s.ttsPlayback
              }))}
              title={settings.ttsPlayback ? '回复朗读已开启（点击关闭）' : '点击开启回复朗读'}
            >
              {settings.ttsPlayback ? '♪ VOICE ON' : '♪ VOICE OFF'}
            </button>
            <button
              type="button"
              className="voice-toggle"
              onClick={() => setShowSettings(true)}
              title="设置"
            >
              ⚙ SETTINGS
            </button>
            <span className={`ws-status ${msgs.wsConnected ? 'connected' : 'disconnected'}`} style={{ fontSize: '11px' }}>
              {msgs.wsConnected && <span className="status-dot" />}
              {msgs.wsConnected ? 'CONNECTED' : msgs.wsReconnecting ? '重连..' : msgs.wsError || 'DISCONNECTED'}
            </span>
          </>,
          document.getElementById('chat-header-portal')!
        )}

        <SetupGuide
          wsConnected={msgs.wsConnected}
          gatewayRunning={gateway.gatewayRunning || gateway.gatewayPortInUse}
          onStartGateway={gateway.startGateway}
          onOpenSettings={() => setShowSettings(true)}
        />

        <ChatMessageList
          messages={messages}
          displayMessages={messages.length > scroll.visibleCount ? messages.slice(-scroll.visibleCount) : messages}
          isStreaming={msgs.isStreaming}
          awaitingResponse={msgs.awaitingResponse}
          streamingContent={msgs.fullTextRef.current}
          displayedText={msgs.fullTextRef.current || typewriter.displayedText}
          usePlainStreamingText={true}
          speakingMessageId={speakingMessageId}
          agentPhase={msgs.agentPhase}
          thinkingElapsed={msgs.thinkingElapsed}
          wsConnected={msgs.wsConnected}
          quickSend={msgs.quickSend}
          bottomRef={scroll.bottomRef}
          onScroll={scroll.handleChatScroll}
          onMessageContextMenu={onMessageContextMenu}
          onQuoteQuestion={onQuoteQuestion}
          pendingPills={msgs.pendingPills}
          messagesContainerRef={scroll.messagesContainerRef}
          activeTools={msgs.activeTools}
          getToolDisplayName={getToolDisplayName}
          streamingDomRef={msgs.streamingDomRef}
          markdownComponents={mdComponents}
        />
        {scroll.showScrollBtn && (
          <div
            onClick={() => {
              scroll.scheduleScrollAfterLayout(true);
            }}
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: '90px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 0',
              cursor: 'pointer',
              gap: '2px',
              zIndex: 10,
              pointerEvents: 'auto',
            }}
          >
            {[0, 1, 2].map((i) => (
              <svg key={i} width="28" height="16" viewBox="0 0 28 16" style={{
                display: 'block',
                animation: 'chevronGlow 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
                filter: `drop-shadow(0 0 ${4 + i * 2}px var(--glow-color))`,
              }}>
                <polyline
                  points="2,2 14,13 26,2"
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ))}
          </div>
        )}
        <ChatInputArea
          imagePreview={files.imagePreview}
          setImagePreview={files.setImagePreview}
          uploadedFiles={files.uploadedFiles}
          setUploadedFiles={files.setUploadedFiles}
          onSend={msgs.sendMessage}
          wsConnected={msgs.wsConnected}
          isStreaming={msgs.isStreaming}
          inputRef={inputRef}
          injectInputText={injectInputText}
          onInjectConsumed={() => setInjectInputText(null)}
          onClearHistory={handleClearHistory}
        />
      </div>

      <ChatTabRightPanel
        gateway={gateway}
        wsConnected={msgs.wsConnected}
        nocturneOnline={msgs.nocturneOnline}
        modelName={msgs.modelName}
        tokenIn={msgs.tokenIn}
        ctxUsed={msgs.ctxUsed}
        ctxMax={msgs.ctxMax}
        streak={msgs.streak}
        pauseSidePanelsDuringStream={isStreamingUiPause}
        localTime={timers.localTime}
        localDate={timers.localDate}
      />
    {/* chat-tab 结束 */}
    </div>

    <div
      className={`canvas-drawer${canvas.isOpen ? ' canvas-drawer--open' : ''}`}
    >
      <div className="canvas-drawer-shadow" aria-hidden />
      <CanvasPanel />
    </div>

    {files.screenshotFlash && (
      <div className="screenshot-flash-overlay">
        <span className="screenshot-flash-text">已截图</span>
      </div>
    )}
  </>
  );
};

export default ChatTab;


