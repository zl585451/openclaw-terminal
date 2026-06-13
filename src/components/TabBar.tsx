import React from 'react';
import { TabType } from '../App';
import '../styles/TabBar.css';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TABS: { id: TabType; label: string }[] = [
  { id: 'chat',      label: '对话' },
  { id: 'workspace', label: '创作台' },
  { id: 'library',   label: '素材库' },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="tab-bar">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          className={`tab-btn ${activeTab === id ? 'active' : ''}`}
          onClick={() => onTabChange(id)}
        >
          <span className="tab-bracket">[</span>
          <span className="tab-label">{label}</span>
          <span className="tab-bracket">]</span>
        </button>
      ))}
    </div>
  );
};

export default TabBar;
