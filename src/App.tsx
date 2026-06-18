import React, { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import type { ChatMessage } from './ui/chat/chatTypes';
import type { ChatHistoryItem, ConversationMeta } from './types/electronAPI';
import WorkbenchHost from './components/workbench/WorkbenchHost';
import FirstLaunchSetup from './components/FirstLaunchSetup';
import { ThemeProvider } from './themes/ThemeProvider';
import { WorkbenchProvider } from './workbench/WorkbenchContext';
import ChatTab from './ui/chat/ChatTab.v2';
import SettingsPanel from './ui/settings/SettingsPanel';
import { ScriptAdapterApp } from './modules/script-adapter';
import './styles/App.css';

export type TabType = 'chat' | 'workspace' | 'library';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showFirstLaunchSetup, setShowFirstLaunchSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messageIdRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 多对话状态 ───────────────────────────────────────────
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('main');
  const activeIdRef = useRef<string>('main');
  const conversationsRef = useRef<ConversationMeta[]>([]);
  // 切换/新建对话后会主动 setMessages，下一次保存副作用要跳过，避免把刚载入的消息回写错对象
  const skipNextSaveRef = useRef(false);

  const persistIndex = useCallback((next: ConversationMeta[]) => {
    conversationsRef.current = next;
    setConversations(next);
    window.electronAPI?.conversationsSave?.(next);
  }, []);

  const loadConversationMessages = useCallback(async (id: string) => {
    const items = (await window.electronAPI?.conversationMessagesLoad?.(id)) || [];
    const msgs: ChatMessage[] = items.map((m, i) => ({
      id: i + 1,
      role: (m.role === 'user' || m.role === 'assistant' || m.role === 'system') ? m.role : 'user',
      content: m.content || '',
      timestamp: m.timestamp || '',
      isSystemReply: m.isSystemReply,
    }));
    skipNextSaveRef.current = true;
    setMessages(msgs);
    messageIdRef.current = msgs.length;
    activeIdRef.current = id;
    setActiveConversationId(id);
    await window.electronAPI?.setSession?.(id);
  }, []);

  const handleNewConversation = useCallback(async () => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `c${Date.now()}`;
    const meta: ConversationMeta = { id, title: '新对话', updatedAt: Date.now(), preview: '' };
    persistIndex([meta, ...conversationsRef.current]);
    skipNextSaveRef.current = true;
    setMessages([]);
    messageIdRef.current = 0;
    activeIdRef.current = id;
    setActiveConversationId(id);
    await window.electronAPI?.setSession?.(id);
  }, [persistIndex]);

  const handleSwitchConversation = useCallback(async (id: string) => {
    if (id === activeIdRef.current) return;
    await loadConversationMessages(id);
  }, [loadConversationMessages]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await window.electronAPI?.conversationDelete?.(id);
    let next = conversationsRef.current.filter((c) => c.id !== id);
    if (next.length === 0) {
      next = [{ id: 'main', title: '新对话', updatedAt: Date.now(), preview: '' }];
    }
    persistIndex(next);
    if (id === activeIdRef.current) {
      await loadConversationMessages(next[0].id);
    }
  }, [persistIndex, loadConversationMessages]);

  // 消息数量上限：防止 messages 数组无限膨胀，保持内存占用稳定
  const MAX_MESSAGES = 200;

  // 截断旧消息：超过上限时移除最早的非流式消息
  useEffect(() => {
    if (messages.length <= MAX_MESSAGES) return;
    // 找到最旧的非流式消息的索引
    const firstNonStreamingIdx = messages.findIndex((m) => !m.isStreaming);
    if (firstNonStreamingIdx < 0) return; // 全是流式消息，不截断
    setMessages((prev) => prev.slice(firstNonStreamingIdx));
  }, [messages.length]);

  // 启动：载入对话索引（首次会自动把老的单一历史迁移成「默认对话」），打开最近一条
  useEffect(() => {
    const api = window.electronAPI;
    const loadIndex = api?.conversationsLoad;
    if (!loadIndex) return;
    (async () => {
      const list = (await loadIndex()) || [];
      const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
      const ensured = sorted.length ? sorted : [{ id: 'main', title: '新对话', updatedAt: Date.now(), preview: '' }];
      conversationsRef.current = ensured;
      setConversations(ensured);
      await loadConversationMessages(ensured[0].id);
    })();
  }, [loadConversationMessages]);

  useEffect(() => {
    const dismissed = localStorage.getItem('oct-first-launch-setup-dismissed');
    if (dismissed === '1') return;
    const getApiKeys = (window as any).electronAPI?.getApiKeys as undefined | (() => Promise<any>);
    if (!getApiKeys) return;
    getApiKeys()
      .then((result: any) => {
        const data = result?.data || {};
        const hasAnyKey = Boolean(
          String(data.DASHSCOPE_API_KEY || '').trim()
          || String(data.DEEPSEEK_API_KEY || '').trim()
          || String(data.MINIMAX_API_KEY || '').trim()
          || String(data.GROQ_API_KEY || '').trim()
          || String(data.CUSTOM_API_KEY || '').trim()
          || String(data.GOOGLE_AI_API_KEY || '').trim()
        );
        if (!hasAnyKey) {
          setShowFirstLaunchSetup(true);
        }
      })
      .catch(() => {
        setShowFirstLaunchSetup(true);
      });
  }, []);

  const dismissFirstLaunchSetup = () => {
    localStorage.setItem('oct-first-launch-setup-dismissed', '1');
    setShowFirstLaunchSetup(false);
  };

  // 保存当前对话消息 + 更新索引元数据（标题/预览/时间）。切换载入触发的那次跳过。
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const toSave: ChatHistoryItem[] = messages
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role, content: m.content, timestamp: String(m.timestamp ?? ''), isSystemReply: m.isSystemReply }));
    if (toSave.length === 0) return;
    const id = activeIdRef.current;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      window.electronAPI?.conversationMessagesSave?.(id, toSave);
      // 更新索引：标题仍为占位「新对话」时用首条用户消息生成，预览取最后一条
      const firstUser = toSave.find((m) => m.role === 'user');
      const lastMsg = toSave[toSave.length - 1];
      const next = conversationsRef.current.map((c) => {
        if (c.id !== id) return c;
        const title = (c.title && c.title !== '新对话') ? c.title
          : (firstUser ? String(firstUser.content).replace(/\s+/g, ' ').slice(0, 20) || '新对话' : c.title);
        return { ...c, title, updatedAt: Date.now(), preview: lastMsg ? String(lastMsg.content).slice(0, 60) : c.preview };
      });
      conversationsRef.current = next;
      setConversations(next);
      window.electronAPI?.conversationsSave?.(next);
      saveTimerRef.current = null;
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages]);

  const getNextMessageId = () => ++messageIdRef.current;

  return (
    <ThemeProvider>
      <WorkbenchProvider>
        <div className="app-container">
        {/* 扫描线效果 */}
        <div className="scanlines" />
        
        {/* 边角装饰 */}
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />
        
        {/* 标题栏 */}
        <TitleBar />
        
        {/* 标签栏 + 右侧 portal 插槽 */}
        <div className="app-shell-bar">
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
          <div id="chat-header-portal" />
        </div>

        {/* 内容区域 */}
        <div className="content-area">
          {activeTab === 'chat' && (
            <Suspense fallback={null}>
              <ChatTab
                messages={messages}
                setMessages={setMessages}
                getNextMessageId={getNextMessageId}
                onStatusChange={() => {}}
                onSwitchTab={(tab) => setActiveTab(tab)}
                conversations={conversations}
                activeConversationId={activeConversationId}
                onNewConversation={handleNewConversation}
                onSwitchConversation={handleSwitchConversation}
                onDeleteConversation={handleDeleteConversation}
              />
            </Suspense>
          )}
          {(activeTab === 'library' || activeTab === 'workspace') && (
            <Suspense fallback={<div className="script-adapter-loading">正在加载...</div>}>
              <ScriptAdapterApp
                key={activeTab}
                initialScreen={activeTab === 'library' ? 'library' : 'home'}
                onBack={() => setActiveTab('chat')}
              />
            </Suspense>
          )}
        </div>
        <WorkbenchHost />
        {showSettings && (
          <Suspense fallback={null}>
            <SettingsPanel
              onClose={() => {
                setShowSettings(false);
                dismissFirstLaunchSetup();
              }}
            />
          </Suspense>
        )}
        {showFirstLaunchSetup && (
          <FirstLaunchSetup
            onDismiss={dismissFirstLaunchSetup}
            onOpenSettings={() => {
              setShowSettings(true);
              setShowFirstLaunchSetup(false);
            }}
          />
        )}
        </div>
      </WorkbenchProvider>
    </ThemeProvider>
  );
};

export default App;
