import React from 'react';
import '../styles/ReaperTab.css';

const ReaperTab: React.FC = () => {
  return (
    <div className="reaper-tab">
      <div className="reaper-placeholder">
        <div className="placeholder-icon">◈</div>
        <div className="placeholder-title">REAPER CONTROL</div>
        <div className="placeholder-subtitle">功能开发中...</div>
        <div className="placeholder-desc">
          此模块将用于控制 REAPER DAW
          <br />
          支持播放控制、轨道操作、效果器参数调节
        </div>
        <div className="placeholder-status">
          <span className="status-line">[STATUS] 模块未激活</span>
          <span className="status-line">[VERSION] Coming Soon</span>
        </div>
      </div>
    </div>
  );
};

export default ReaperTab;