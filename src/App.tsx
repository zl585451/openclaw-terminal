import React, { useState, useEffect, useRef } from 'react';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import ChatTab, { ChatMessage } from './components/ChatTab';
import SoundTab from './components/SoundTab';
import ReaperTab from './components/ReaperTab';
import ActivationWindow from './components/ActivationWindow';
import './styles/App.css';


export type TabType = 'chat' | 'sound' | 'reaper';

const App: React.FC = () => {
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messageIdRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.electronAPI?.licenseCheck?.().then((result: unknown) => {
      setIsActivated(!!result);
    }).catch(() => {
      setIsActivated(false);
    });
  }, []);

  useEffect(() => {
    // 获取初始置顶状态
    if (!isActivated) return;
    window.electronAPI?.getAlwaysOnTop().then((result: unknown) => {
      setIsAlwaysOnTop(result as boolean);
    });
  }, [isActivated]);

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
      .map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp, isSystemReply: m.isSystemReply }));
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

  const toggleAlwaysOnTop = async () => {
    const newState = !isAlwaysOnTop;
    await window.electronAPI?.setAlwaysOnTop(newState);
    setIsAlwaysOnTop(newState);
  };

  if (isActivated !== true) {
    return (
      <ActivationWindow onActivated={() => setIsActivated(true)} />
    );
  }

  return (
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
      
      {/* 标签栏 */}
      <TabBar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />
      
      {/* 内容区域 */}
      <div className="content-area">
        {activeTab === 'chat' && (
          <ChatTab
            messages={messages}
            setMessages={setMessages}
            getNextMessageId={getNextMessageId}
            isAlwaysOnTop={isAlwaysOnTop}
            onToggleAlwaysOnTop={toggleAlwaysOnTop}
            onStatusChange={() => {}}
          />
        )}
        {activeTab === 'sound' && <SoundTab />}
        {activeTab === 'reaper' && <ReaperTab />}
      </div>
    </div>
  );
};

export default App;