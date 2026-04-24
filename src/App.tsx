import React, { useState, useEffect, useRef } from 'react';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import ChatTab, { ChatMessage } from './ui/chat/ChatTab.v2';
import SoundTab from './components/SoundTab';
import ReaperTab from './components/ReaperTab';
import SettingsPanel from './components/SettingsPanel';
import WorkbenchHost from './components/workbench/WorkbenchHost';
import FirstLaunchSetup from './components/FirstLaunchSetup';
import { ScriptAdapterApp } from './modules/script-adapter';
import { ThemeProvider } from './themes/ThemeProvider';
import { WorkbenchProvider } from './workbench/WorkbenchContext';
import './styles/App.css';


export type TabType = 'chat' | 'sound' | 'reaper';
type AppView = 'chat' | 'script-adapter';

const App: React.FC = () => {
  const [appView, setAppView] = useState<AppView>('chat');
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
                  data-temp-entry="script-adapter"
                  onClick={() => setAppView('script-adapter')}
                >
                  打开小说改编模块
                </button>
                <div id="chat-header-portal" />
              </div>
            </>
          ) : (
            <div className="app-shell-module-title">小说改编模块 · 骨架 v1</div>
          )}
        </div>

        {/* 内容区域 */}
        <div className="content-area">
          {appView === 'chat' ? (
            <>
              {activeTab === 'chat' && (
                <ChatTab
                  messages={messages}
                  setMessages={setMessages}
                  getNextMessageId={getNextMessageId}
                  onStatusChange={() => {}}
                  onSwitchTab={setActiveTab}
                />
              )}
              {activeTab === 'sound' && <SoundTab />}
              {activeTab === 'reaper' && <ReaperTab />}
            </>
          ) : (
            <ScriptAdapterApp onBack={() => setAppView('chat')} />
          )}
        </div>
        <WorkbenchHost />
        {showSettings && (
          <SettingsPanel
            onClose={() => {
              setShowSettings(false);
              dismissFirstLaunchSetup();
            }}
          />
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
