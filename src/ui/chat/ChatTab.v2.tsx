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
import { useCanvasBridge } from '../../hooks/useCanvasBridge';
import { useCanvas } from '../../contexts/CanvasContext';
import { workbenchBus } from '../../workbench/WorkbenchBus';
// playClickSound, resetSoundCounter 已迁移到 useTypewriter hook
import { stripThinkModeMarker } from '../../utils/socraticTemplates';
import { clearProcessedMarkdownCache } from '../../utils/markdownPreprocess';
import { createMarkdownComponents } from './markdownComponents';
import ChatInputArea from './ChatInput';
import { ChatMessageList } from './MessageList';
import ChatTabRightPanel from './ChatTabRightPanel';
import { WelcomeHero } from '../onboarding/WelcomeHero';
import type { CardDef } from '../onboarding/CapabilityCards';
import ImageStudio from '../image/ImageStudio';
import type { CapabilityId, CapabilityStatus } from '../../core/capabilities/types';
import { InlineInquiry } from '../../components/inlineInquiry/InlineInquiry';
import { useInlineInquiry } from '../../hooks/useInlineInquiry';
import { useTtsPlayback } from '../../hooks/useTtsPlayback';
import { useImageStudio } from '../../hooks/useImageStudio';
import { parseClarifyCard } from '../../core/clarifyCard/parser';
import type { ClarifyCardSpec } from '../../core/clarifyCard/types';
import { CapabilityBar } from '../../components/capabilityBar/CapabilityBar';
import { CapabilitySetupDrawer } from '../onboarding/CapabilitySetupDrawer';

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

export interface ToolEventItem {
  callId: string;
  tool: string;
  args?: Record<string, unknown>;
  state: 'executing' | 'done' | 'error';
  resultPreview?: string;
  error?: string;
  elapsedMs?: number;
  startedAt: number;
}

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
  /** 内联工具调用卡片数据，跟随消息持久展示 */
  toolEvents?: ToolEventItem[];
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



interface ChatTabProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getNextMessageId: () => number;
  onStatusChange?: (wsConnected: boolean, isStreaming: boolean, modelName?: string, tokenIn?: number | null, tokenOut?: number | null, ctxUsed?: number | null, ctxMax?: number | null) => void;
  onSwitchTab?: (tab: 'chat' | 'sound' | 'reaper') => void;
}


const ChatTab: React.FC<ChatTabProps> = ({ messages, setMessages, getNextMessageId, onStatusChange, onSwitchTab }) => {
  const { settings, setSettings, streamSpeedMs } = useSettings();
  const { speakingMessageId, ttsError, playTTSForMessage, stopTts } = useTtsPlayback({
    ttsPlayback: settings.ttsPlayback,
    ttsProvider: settings.ttsProvider,
  });
  const {
    imageStudioOpen,
    imageStudioInitialPrompt,
    openImageStudio,
    closeImageStudio,
    toggleImageStudio,
    registerPromptInjector,
    markPendingPromptOptimization,
  } = useImageStudio(messages);
  const { permissions } = usePermissions();
  const canvasBridge = useCanvasBridge();
  const { setNodeInspectHandler } = useCanvas();

  const mdComponents = useMemo(
    () => createMarkdownComponents(canvasBridge.openCanvas),
    [canvasBridge.openCanvas]
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
  const [injectInputText, setInjectInputText] = useState<string | null>(null);
  const [capBarSetupTarget, setCapBarSetupTarget] = useState<CapabilityId | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem('oct.onboarding.dismissed') === '1';
    } catch {
      return false;
    }
  });

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendClarifyReplyRef = useRef<(text: string) => void>(() => {});

  // ── scrollBridgeRef：打破 useMessages↔useScrollManager 的循环依赖 ───────
  // useMessages 通过此 ref 桥接调用 scroll.reconcile / scrollAfterUserSend，
  // useScrollManager 则依赖来自 msgs 的 isStreaming / awaitingResponse。
  const scrollBridgeRef = useRef({
    reconcile: () => {},
    scrollAfterUserSend: () => {},
  });
  const inquiry = useInlineInquiry({
    onReply: (text) => {
      sendClarifyReplyRef.current(text);
    },
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
    typingSound: settings.typingSound,
    typingSoundVolume: settings.typingSoundVolume,
    onStatusChange,
    onClarifyOpen: (spec: ClarifyCardSpec) => {
      const opened = inquiry.openSpec(spec);
      if (!opened && import.meta.env.DEV) {
        console.warn('[clarify] openSpec rejected: another inquiry already active');
      }
    },
  });

  useEffect(() => {
    sendClarifyReplyRef.current = (text: string) => {
      if (!msgs.wsConnected) return;
      void msgs.sendMessage(text, null);
    };
  }, [msgs.sendMessage, msgs.wsConnected]);

  // ── Workbench → Chat 桥接：监听面板内的发送请求 ─────────────────
  // 当 DocumentAppendBar / 其他面板内 UI 通过 workbenchBus.requestSendMessage 发起请求时，
  // 这里转成实际的 sendMessage 调用，并按 intent 注入 roundtrip 上下文。
  useEffect(() => {
    const unsubscribe = workbenchBus.subscribeSendRequest((request) => {
      const intent = request.intent ?? 'continue';
      const context = workbenchBus.getContext(intent);
      msgs.sendMessage(request.text, null, undefined, context);
    });
    return unsubscribe;
  }, [msgs]);

  const showWelcome = messages.length === 0 && !onboardingDismissed;

  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    try { localStorage.setItem('oct.onboarding.dismissed', '1'); } catch { /* ignore */ }
  }, []);

  const buildPromptOptimizeRequest = useCallback((prompt: string) => (
    `请帮我优化以下生图提示词。只输出优化后的英文 prompt，不要解释，不要加引号，不要使用 markdown：\n\n生图提示词：${prompt}`
  ), []);

  const appendImageCapabilityGuideMessage = useCallback(() => {
    setMessages((prev) => ([
      ...prev,
      {
        id: getNextMessageId(),
        role: 'assistant',
        content: [
          '我这边检测到你还没有配置生图 Key。',
          '',
          '你可以按以下步继续：',
          '',
          '点击右上方 [⚙️SETTINGS]→[生图配置]→填入可用作生图的key与对应模型名称',
          '',
          '[应用]→点击[SEND]旁边的🎨→输入提示词→[让AMY优化提示词]→[开始生成]',
          '',
          '如果你愿意，我也可以先帮你写一版生图提示词，等你填好 Key 之后直接生成。',
        ].join('\n'),
        timestamp: Date.now(),
      },
    ]));
  }, [getNextMessageId, setMessages]);

  const appendMusicCapabilityGuideMessage = useCallback(() => {
    setMessages((prev) => ([
      ...prev,
      {
        id: getNextMessageId(),
        role: 'assistant',
        content: [
          '我这边检测到你还没有配置音乐 Key（MINIMAX_API_KEY）。',
          '',
          '你可以按以下步继续：',
          '',
          '点击右上方 [⚙️SETTINGS]→[连接]→填入 MINIMAX_API_KEY → [应用]',
          '',
          '然后点顶部 [音频] 标签，输入描述后点击 [Create] 开始生成。',
        ].join('\n'),
        timestamp: Date.now(),
      },
    ]));
  }, [getNextMessageId, setMessages]);

  const handleWelcomeAction = useCallback(
    (card: CardDef, capabilityStatus: CapabilityStatus) => {
      if (card.action.type === 'send_prompt') {
        dismissOnboarding();
        void msgs.sendMessage(card.action.prompt, null);
        return;
      }

      if (card.action.type === 'open_panel' && card.action.panelId === 'image_studio') {
        if (capabilityStatus !== 'available') {
          dismissOnboarding();
          appendImageCapabilityGuideMessage();
          return;
        }

        dismissOnboarding();
        openImageStudio(card.action.prefill);
        const prefill = (card.action.prefill || '').trim();
        if (prefill) {
          markPendingPromptOptimization();
          msgs.quickSend(buildPromptOptimizeRequest(prefill));
        }
      }

      if (card.action.type === 'open_tab' && card.action.tabId === 'sound') {
        dismissOnboarding();
        if (capabilityStatus !== 'available') {
          appendMusicCapabilityGuideMessage();
        }
        onSwitchTab?.('sound');
        return;
      }
    },
    [appendImageCapabilityGuideMessage, appendMusicCapabilityGuideMessage, buildPromptOptimizeRequest, dismissOnboarding, markPendingPromptOptimization, msgs, onSwitchTab, openImageStudio],
  );

  const handleSkipOnboarding = useCallback(() => {
    dismissOnboarding();
  }, [dismissOnboarding]);

  const handleCapabilityBarClick = useCallback((card: CardDef, capabilityStatus: CapabilityStatus) => {
    if (card.action.type === 'send_prompt') {
      setInjectInputText(card.action.prompt);
      return;
    }
    if (card.action.type === 'open_panel' && card.action.panelId === 'image_studio') {
      if (capabilityStatus !== 'available') {
        appendImageCapabilityGuideMessage();
        setCapBarSetupTarget('image_gen');
        return;
      }
      openImageStudio(card.action.prefill);
      return;
    }
    if (card.action.type === 'open_tab' && card.action.tabId === 'sound') {
      if (capabilityStatus !== 'available') {
        appendMusicCapabilityGuideMessage();
        setCapBarSetupTarget('music_gen');
      }
      onSwitchTab?.('sound');
    }
  }, [appendImageCapabilityGuideMessage, appendMusicCapabilityGuideMessage, onSwitchTab, openImageStudio]);

  const handleCapabilityBarSetup = useCallback((capId: CapabilityId) => {
    setCapBarSetupTarget(capId);
  }, []);

  // Register the chat's quickSend as the node-inspect handler so Canvas
  // renderers can trigger "explain this node" queries without prop drilling.
  // useEffect keeps registration in sync if quickSend identity changes.
  useEffect(() => {
    setNodeInspectHandler((nodeLabel: string, nodeGroup?: string) => {
      const groupHint = nodeGroup ? `（所属分组：${nodeGroup}）` : '';
      msgs.quickSend(`请详细说明节点「${nodeLabel}」${groupHint}的含义、作用及与其他节点的关系。`);
    });
    return () => setNodeInspectHandler(null);
  // msgs.quickSend is stable (useCallback), setNodeInspectHandler is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNodeInspectHandler]);

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
    if (!messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (last.isStreaming === true) return;
    const content = typeof last.content === 'string' ? last.content : '';
    if (!content) return;
    const parsed = parseClarifyCard(content);
    if (parsed.range && parsed.stripped !== content) {
      setMessages((prev) => prev.map((m) => (
        m.id === last.id ? { ...m, content: parsed.stripped } : m
      )));
    }
    inquiry.maybeTrigger(last.id, content);
  }, [messages, inquiry.maybeTrigger, setMessages]);

  useEffect(() => {
    if (messages.length === 0) {
      inquiry.reset();
    }
  }, [messages.length, inquiry.reset]);


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
    inquiry.reset();
    setMessages([]);
    (window as any).electronAPI?.chatHistorySave?.([]);
  }, [inquiry, setMessages]);

  /** TEMP：仅开发模式。输入框旁「欢迎页」按钮：重置首屏引导；有消息时会先问是否清空。产品化前删除。 */
  const handleDevShowWelcomeAgain = useCallback(() => {
    if (!import.meta.env.DEV) return;
    if (messages.length > 0) {
      if (!window.confirm('要先清空聊天才能显示欢迎页。确定清空全部记录吗？')) return;
      clearProcessedMarkdownCache();
      inquiry.reset();
      setMessages([]);
      void (window as any).electronAPI?.chatHistorySave?.([]);
    }
    try {
      localStorage.removeItem('oct.onboarding.dismissed');
    } catch {
      /* ignore */
    }
    setOnboardingDismissed(false);
  }, [inquiry, messages.length, setMessages]);

  const insertImageToChat = useCallback((imageUrl: string, prompt: string) => {
    setMessages((prev) => ([
      ...prev,
      {
        id: getNextMessageId(),
        role: 'assistant',
        content: `✅ 生图完成\n\n![生成图片](${imageUrl})\n\n> ${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}\n\n[查看原图](${imageUrl})`,
        timestamp: Date.now(),
      },
    ]));
  }, [getNextMessageId, setMessages]);

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
      className={`chat-tab${canvasBridge.isOpen ? ' chat-tab--canvas-open' : ''}`}
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
              textShadow: '0 0 10px var(--accent-primary-glow)',
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
              className={`voice-toggle ${canvasBridge.isOpen ? 'on' : ''}`}
              onClick={canvasBridge.openPanel}
              title={canvasBridge.isOpen ? 'Canvas 面板已打开' : '打开 Canvas 面板'}
            >
              ▣ OPEN CANVAS
            </button>
            {speakingMessageId != null ? (
              <button
                type="button"
                className="voice-toggle"
                onClick={stopTts}
                title="停止当前语音播报"
              >
                ■ STOP VOICE
              </button>
            ) : null}
            {ttsError ? (
              <span className="ws-status disconnected" style={{ maxWidth: 320 }} title={ttsError}>
                TTS: {ttsError}
              </span>
            ) : null}
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
            {msgs.wsConnected && (msgs.gatewayCapabilities?.toolsSupport ?? (msgs.gatewayCapabilities?.supportsTools ? 'supported' : 'unknown')) !== 'supported' ? (
              <span
                className="ws-status disconnected"
                style={{ fontSize: '11px' }}
                title={`工具能力：${msgs.gatewayCapabilities?.toolsSupport || 'unknown'} 来源：${msgs.gatewayCapabilities?.capabilitySource || 'unknown'}`}
              >
                {msgs.gatewayCapabilities?.toolsSupport === 'unknown' ? 'TOOL UNKNOWN' : 'NO TOOL EXEC'}
              </span>
            ) : null}
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
          activityTimeline={msgs.activityTimeline}
          getToolDisplayName={getToolDisplayName}
          streamingDomRef={msgs.streamingDomRef}
          markdownComponents={mdComponents}
          allowCotDisplay={true}
          emptyConversationPlaceholder={
            showWelcome ? (
              <div className="chat-empty">
                <WelcomeHero onCardAction={handleWelcomeAction} onSkip={handleSkipOnboarding} />
              </div>
            ) : (
              <div className="chat-empty">
                <div className="oct-empty-simple">
                  <div className="oct-empty-glyph">{'\u2726'}</div>
                </div>
              </div>
            )
          }
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
                filter: `drop-shadow(0 0 ${4 + i * 2}px var(--accent-primary-glow))`,
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
        {!inquiry.hasActive && (
          <CapabilityBar
            onCapabilityClick={handleCapabilityBarClick}
            onRequestSetup={handleCapabilityBarSetup}
          />
        )}
        {inquiry.hasActive && inquiry.currentField && inquiry.currentDraft ? (
          <InlineInquiry
            field={inquiry.currentField}
            draft={inquiry.currentDraft}
            currentPage={inquiry.currentPage}
            totalPages={inquiry.totalPages}
            onUpdate={(next) => inquiry.updateDraft(inquiry.currentField!.id, next)}
            onNext={inquiry.goNext}
            onPrev={inquiry.goPrev}
            onSkip={inquiry.skipCurrentField}
            onDismiss={inquiry.dismiss}
          />
        ) : (
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
            onRestartGateway={gateway.restartGateway}
            isEmptyConversation={messages.length === 0}
            extraControls={(
              <>
                {import.meta.env.DEV ? (
                  <button
                    type="button"
                    className="attach-btn"
                    title="开发用：重新显示首屏欢迎"
                    onClick={handleDevShowWelcomeAgain}
                  >
                    欢迎页
                  </button>
                ) : null}
                <button
                  type="button"
                  className="attach-btn"
                  title="打开生图工作台"
                  onClick={toggleImageStudio}
                  style={{
                    background: imageStudioOpen ? 'var(--accent-primary)' : undefined,
                    color: imageStudioOpen ? 'var(--bg-base)' : undefined,
                  }}
                >
                  🎨
                </button>
              </>
            )}
          />
        )}
      </div>

      <ChatTabRightPanel
        gateway={gateway}
        wsConnected={msgs.wsConnected}
        nocturneOnline={msgs.nocturneOnline}
        modelName={msgs.modelName}
        tokenIn={msgs.tokenIn}
        ctxUsed={msgs.ctxUsed}
        ctxMax={msgs.ctxMax}
        pauseSidePanelsDuringStream={isStreamingUiPause}
        localTime={timers.localTime}
        localDate={timers.localDate}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(46vw, 640px)',
          minWidth: 420,
          maxWidth: 640,
          zIndex: 51,
          transform: imageStudioOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.18s ease',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-base)',
          borderLeft: '1px solid var(--border-subtle)',
          boxShadow: '-24px 0 48px rgba(0, 0, 0, 0.32)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: -32,
            top: 0,
            bottom: 0,
            width: 32,
            background: 'linear-gradient(to left, rgba(0, 0, 0, 0.42), transparent)',
            pointerEvents: 'none',
          }}
        />
        <ImageStudio
          onSendToChat={(text) => {
            markPendingPromptOptimization();
            msgs.quickSend(text);
          }}
          initialPrompt={imageStudioInitialPrompt}
          registerPromptInjector={registerPromptInjector}
          onInsertImageToChat={insertImageToChat}
          onClose={closeImageStudio}
        />
      </div>
      <CapabilitySetupDrawer
        capabilityId={capBarSetupTarget}
        onClose={() => setCapBarSetupTarget(null)}
      />
    {/* chat-tab 结束 */}
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


