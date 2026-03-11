import React from 'react';
import '../styles/TitleBar.css';

interface TitleBarProps {
  isAlwaysOnTop?: boolean;
  onToggleTop?: () => void;
}

const TitleBar: React.FC<TitleBarProps> = () => {
  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <div className="title-bar">
      <div className="title-left">
        <span className="title-logo">◈</span>
        <span className="title-text">OCT | OpenClaw Terminal</span>
      </div>
      
      <div className="title-right">
        <button className="title-btn" onClick={handleMinimize}>─</button>
        <button className="title-btn" onClick={handleMaximize}>□</button>
        <button className="title-btn close-btn" onClick={handleClose}>✕</button>
      </div>
    </div>
  );
};

export default TitleBar;