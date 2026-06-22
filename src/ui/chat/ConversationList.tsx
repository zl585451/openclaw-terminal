import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ConversationMeta } from '../../types/electronAPI';

export interface ConversationListProps {
  conversations?: ConversationMeta[];
  activeConversationId?: string;
  onNewConversation?: () => void;
  onSwitchConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
}

/**
 * 左侧栏顶部的「对话」区：＋新对话 + Recents 列表。
 * 数据与切换逻辑都在 App.tsx，本组件只负责展示与回调。
 */
const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onNewConversation,
  onSwitchConversation,
  onDeleteConversation,
}) => {
  const list = [...(conversations || [])].sort((a, b) => b.updatedAt - a.updatedAt);
  const [pendingDelete, setPendingDelete] = useState<ConversationMeta | null>(null);

  const confirmDialog = pendingDelete && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="conv-confirm-overlay"
        role="presentation"
        onMouseDown={() => setPendingDelete(null)}
      >
        <div
          className="conv-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="conv-confirm-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="conv-confirm-kicker">对话管理</div>
          <h2 id="conv-confirm-title" className="conv-confirm-title">删除这条对话？</h2>
          <p className="conv-confirm-copy">
            聊天记录会清除，长期记忆不受影响。
          </p>
          <div className="conv-confirm-preview">
            {pendingDelete.title || '新对话'}
          </div>
          <div className="conv-confirm-actions">
            <button
              type="button"
              className="conv-confirm-btn conv-confirm-btn--ghost"
              onClick={() => setPendingDelete(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="conv-confirm-btn conv-confirm-btn--danger"
              onClick={() => {
                onDeleteConversation?.(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              删除
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="conv-list">
      <button
        type="button"
        className="conv-new-btn"
        onClick={() => onNewConversation?.()}
        title="新建对话"
      >
        <span className="conv-new-plus">＋</span>
        <span>新对话</span>
      </button>

      <div className="conv-recents-label">最近对话</div>

      <div className="conv-items">
        {list.length === 0 && (
          <div className="conv-empty">还没有对话</div>
        )}
        {list.map((c) => (
          <div
            key={c.id}
            className={`conv-item ${c.id === activeConversationId ? 'is-active' : ''}`}
            onClick={() => onSwitchConversation?.(c.id)}
            title={c.preview || c.title}
          >
            <div className="conv-item-main">
              <div className="conv-item-title">{c.title || '新对话'}</div>
              {c.preview ? <div className="conv-item-preview">{c.preview}</div> : null}
            </div>
            <button
              type="button"
              className="conv-item-del"
              title="删除对话"
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(c);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {confirmDialog}
    </div>
  );
};

export default React.memo(ConversationList);
