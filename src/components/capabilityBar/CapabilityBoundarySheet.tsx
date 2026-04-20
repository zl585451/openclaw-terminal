import React from 'react';
import { createPortal } from 'react-dom';
import './CapabilityBar.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const CapabilityBoundarySheet: React.FC<Props> = ({ open, onClose }) => {
  if (!open) return null;

  return createPortal(
    <div className="oct-cap-sheet-backdrop" onClick={onClose}>
      <div
        className="oct-cap-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="oct-cap-sheet-header">
          <div className="oct-cap-sheet-title">OCT 能帮你做什么</div>
          <button type="button" className="oct-cap-sheet-close" onClick={onClose}>×</button>
        </div>
        <div className="oct-cap-sheet-body">
          <section>
            <h4 className="oct-cap-sheet-h-yes">✓ 可以做</h4>
            <ul>
              <li>对话、思考、写东西（文章 / 文案 / 代码草稿）</li>
              <li>后台跑腿（搜资料、整理信息、多步骤查询）</li>
              <li>画布（图表、流程图、架构图、路线图）</li>
              <li>生图（需配置对应 Key）</li>
              <li>音乐生成（需配置对应 Key）</li>
              <li>联网搜索 / 读取你让我看的文件</li>
              <li>记忆你告诉我的事（Nocturne 记忆系统）</li>
            </ul>
          </section>
          <section>
            <h4 className="oct-cap-sheet-h-no">✗ 做不到</h4>
            <ul>
              <li>操作你电脑上的其他软件（微信 / QQ / 浏览器 / Office）</li>
              <li>打电话、发短信、发微信消息</li>
              <li>替你在网页上点击、登录、填表</li>
              <li>修改你的系统设置 / 浏览器设置</li>
              <li>打开或关闭你电脑上的程序</li>
              <li>持续监听麦克风或摄像头</li>
            </ul>
          </section>
          <div className="oct-cap-sheet-tip">
            想让 AI 做越界的事？告诉我你的真实目的，我会帮你找到能做的替代方案。
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
