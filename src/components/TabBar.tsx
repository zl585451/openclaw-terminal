import React from 'react';
import { TabType } from '../App';
import '../styles/TabBar.css';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const SHOW_BETA_TABS = false; // 改为 true 可显示 SOUND、REAPER 标签

const tabs: { id: TabType; label: string }[] = [
  { id: 'chat', label: 'CHAT' },
  { id: 'sound', label: 'SOUND' },
  { id: 'reaper', label: 'REAPER' },
];

const visibleTabs = SHOW_BETA_TABS ? tabs : tabs.filter((t) => t.id === 'chat');

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="tab-bar">
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="tab-bracket">[</span>
          <span className="tab-label">{tab.label}</span>
          <span className="tab-bracket">]</span>
        </button>
      ))}
    </div>
  );
};

export default TabBar;