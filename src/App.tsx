import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import type { ChatMessage } from './ui/chat/chatTypes';
import WorkbenchHost from './components/workbench/WorkbenchHost';
import FirstLaunchSetup from './components/FirstLaunchSetup';
import { ThemeProvider } from './themes/ThemeProvider';
import { WorkbenchProvider } from './workbench/WorkbenchContext';
import './styles/App.css';

const ChatTab = lazy(() => import('./ui/chat/ChatTab.v2'));
const SoundTab = lazy(() => import('./components/SoundTab'));
const ReaperTab = lazy(() => import('./components/ReaperTab'));
const SettingsPanel = lazy(() => import('./ui/settings/SettingsPanel'));

const ScriptAdapterApp = lazy(() =>
  import('./modules/script-adapter').then((module) => ({ default: module.ScriptAdapterApp }))
);

export type TabType = 'chat' | 'sound' | 'reaper';
type AppView = 'chat' | 'script-adapter';
type ScriptAdapterEntry = 'home' | 'workspace' | 'library';

const App: React.FC = () => {
  const [appView, setAppView] = useState<AppView>('chat');
  const [scriptAdapterEntry, setScriptAdapterEntry] = useState<ScriptAdapterEntry>('home');
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showFirstLaunchSetup, setShowFirstLaunchSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messageIdRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const load = window.electronAPI?.chatHistoryLoad;
    if (load) {
      load().then((items: Array<{ role: string; content: string; timestamp: string; isSystemReply?: boolean }>) => {
        if (Array.isArray(items) && items.length > 0) {
          const msgs: ChatMessage[] = items.map((m, i) => ({
            id: i + 1,
            role: (m.role === 'user' || m.role === 'assistant' || m.role === 'system') ? m.role : 'user',
            content: m.content || '',
            timestamp: m.timestamp || '',
            isSystemReply: m.isSystemReply,
          }));
          setMessages(msgs);
          messageIdRef.current = msgs.length;
        }
      });
    }
  }, []);

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
          || String(data.NEWAPI_API_KEY || '').trim()
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

  useEffect(() => {
    const toSave = messages
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role, content: m.content, timestamp: String(m.timestamp ?? ''), isSystemReply: m.isSystemReply }));
    if (toSave.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      window.electronAPI?.chatHistorySave?.(toSave);
      saveTimerRef.current = null;
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages]);

  const getNextMessageId = () => ++messageIdRef.current;

  const openScriptAdapter = (entry: ScriptAdapterEntry) => {
    setScriptAdapterEntry(entry);
    setAppView('script-adapter');
  };

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
          {appView === 'chat' ? (
            <>
              <TabBar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                vaultOpen={vaultOpen}
                setVaultOpen={setVaultOpen}
                vaultUnlocked={vaultUnlocked}
                onVaultStatusChange={(s) => setVaultUnlocked(s?.unlocked ?? false)}
              />
              <div className="app-shell-actions">
                <button
                  type="button"
                  className="script-adapter-entry-button"
                  data-entry-tone="library"
                  onClick={() => openScriptAdapter('library')}
                >
                  📚 项目素材库
                </button>
                <button
                  type="button"
                  className="script-adapter-entry-button"
                  data-temp-entry="script-adapter"
                  onClick={() => openScriptAdapter('home')}
                >
                  内容制作工作台
                </button>
                <div id="chat-header-portal" />
              </div>
            </>
          ) : (
            <div className="app-shell-module-title">内容创作</div>
          )}
        </div>

        {/* 内容区域 */}
        <div className="content-area">
          {appView === 'chat' ? (
            <>
              {activeTab === 'chat' && (
                <Suspense fallback={null}>
                  <ChatTab
                    messages={messages}
                    setMessages={setMessages}
                    getNextMessageId={getNextMessageId}
                    onStatusChange={() => {}}
                    onSwitchTab={setActiveTab}
                  />
                </Suspense>
              )}
              <Suspense fallback={null}>
                {activeTab === 'sound' && <SoundTab />}
              </Suspense>
              <Suspense fallback={null}>
                {activeTab === 'reaper' && <ReaperTab />}
              </Suspense>
            </>
          ) : (
            <Suspense fallback={<div className="script-adapter-loading">正在加载内容制作工作台...</div>}>
              <ScriptAdapterApp
                key={scriptAdapterEntry}
                initialScreen={scriptAdapterEntry}
                onBack={() => setAppView('chat')}
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
