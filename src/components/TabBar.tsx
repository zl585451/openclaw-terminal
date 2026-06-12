import React from 'react';
import { TabType } from '../App';
import '../styles/TabBar.css';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="tab-bar">
      <button
        className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
        onClick={() => onTabChange('chat')}
      >
        <span className="tab-bracket">[</span>
        <span className="tab-label">对话</span>
        <span className="tab-bracket">]</span>
      </button>
    </div>
  );
};

export default TabBar;
