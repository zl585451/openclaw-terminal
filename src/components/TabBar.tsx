import React, { useRef, useState } from 'react';
import { TabType } from '../App';
import VaultPanel from './VaultPanel';
import '../styles/TabBar.css';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  vaultOpen?: boolean;
  setVaultOpen?: (open: boolean) => void;
  vaultUnlocked?: boolean;
  onVaultStatusChange?: (status: { unlocked: boolean }) => void;
}

const SHOW_BETA_TABS = false; // 改为 true 可显示 SOUND、REAPER 标签

const tabs: { id: TabType; label: string }[] = [
  { id: 'chat', label: 'CHAT' },
  { id: 'sound', label: 'SOUND' },
  { id: 'reaper', label: 'REAPER' },
];

const visibleTabs = SHOW_BETA_TABS ? tabs : tabs.filter((t) => t.id === 'chat');

const TabBar: React.FC<TabBarProps> = ({
  activeTab,
  onTabChange,
  vaultOpen,
  setVaultOpen,
  vaultUnlocked,
  onVaultStatusChange,
}) => {
  const vaultContainerRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });

  const handleVaultToggle = () => {
    if (!vaultOpen && vaultContainerRef.current) {
      const rect = vaultContainerRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left });
    }
    setVaultOpen?.(!vaultOpen);
  };

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
      {setVaultOpen && (
        <div ref={vaultContainerRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`tab-btn ${vaultOpen ? 'active' : ''}`}
            onClick={handleVaultToggle}
            title={vaultUnlocked ? '保险箱已解锁' : '保险箱已锁定'}
          >
            <span className="tab-bracket">[</span>
            <span className="tab-label">
              VAULT
              {vaultUnlocked && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-success, var(--status-success, inherit))',
                    display: 'inline-block',
                    marginLeft: 4,
                  }}
                />
              )}
            </span>
            <span className="tab-bracket">]</span>
          </button>
          <VaultPanel
            vaultOpen={vaultOpen ?? false}
            setVaultOpen={setVaultOpen}
            onStatusChange={onVaultStatusChange}
            containerRef={vaultContainerRef}
            dropPos={dropPos}
          />
        </div>
      )}
    </div>
  );
};

export default TabBar;