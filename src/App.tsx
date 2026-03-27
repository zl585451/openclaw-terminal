import React, { useState, useEffect, useRef } from 'react';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import ChatTab, { ChatMessage } from './components/ChatTab';
import SoundTab from './components/SoundTab';
import ReaperTab from './components/ReaperTab';
import { ThemeProvider } from './themes/ThemeProvider';
import './styles/App.css';


export type TabType = 'chat' | 'sound' | 'reaper';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messageIdRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)' }}>
          <TabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            vaultOpen={vaultOpen}
            setVaultOpen={setVaultOpen}
            vaultUnlocked={vaultUnlocked}
            onVaultStatusChange={(s) => setVaultUnlocked(s?.unlocked ?? false)}
          />
          <div id="chat-header-portal" />
        </div>

        {/* 内容区域 */}
        <div className="content-area">
          {activeTab === 'chat' && (
            <ChatTab
              messages={messages}
              setMessages={setMessages}
              getNextMessageId={getNextMessageId}
              onStatusChange={() => {}}
            />
          )}
          {activeTab === 'sound' && <SoundTab />}
          {activeTab === 'reaper' && <ReaperTab />}
        </div>
      </div>
    </ThemeProvider>
  );
};

export default App;