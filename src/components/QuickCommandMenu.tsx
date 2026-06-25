import React, { useEffect, useRef, useState } from 'react';
import '../styles/QuickCommandMenu.css';

export interface QuickCommandChild {
  id: string;
  label: string;
  sendText: string;
}

export interface QuickCommandItem {
  id: string;
  label: string;
  sendText?: string;
  children?: QuickCommandChild[];
  isAction?: boolean;
}

interface QuickCommandMenuProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
  onClose: () => void;
  onSelect: (sendText: string) => void;
  onClearHistory?: () => void;
  onRestartGateway?: () => void;
}

const MENU_STRUCTURE: { group: string; items: QuickCommandItem[] }[] = [
  {
    group: '━━ AGENT ━━━━━━━━━━━━━',
    items: [
      { id: 'status', label: '状态查询', sendText: '/status' },
      { id: 'new', label: '保存并新对话', sendText: '/new' },
      // 已移除：
      // - 「切换模型」与输入框底部的模型下拉重复
      // - 「思考模式」与输入框底部的「思考」开关重复（原 DEBUG 组）
      // - 「停止执行」(/stop) 已废弃：/stop 未注册，会回「未知命令」；真正停止用输入框停止按钮
    ],
  },
  // 已移除 GUIDE 组（启用/关闭引导模式）：自适应澄清协议已由系统提示词
  // （CLARIFICATION_PROTOCOL.md + adaptive-questioning-system.md）每轮常驻注入，
  // 这两个发聊天消息的按钮无法覆盖常驻系统指令，实为误导性空操作。
  {
    group: '━━ SYSTEM ━━━━━━━━━━━━',
    items: [
      { id: 'restart', label: '重启Gateway', isAction: true },
      { id: 'clear-history', label: '清理历史对话', isAction: true },
    ],
  },
];

export default function QuickCommandMenu({
  anchorRef,
  visible,
  onClose,
  onSelect,
  onClearHistory,
  onRestartGateway,
}: QuickCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const submenuHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (anchor?.contains(e.target as Node) || menu?.contains(e.target as Node)) return;
      setExpandedId(null);
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible, onClose, anchorRef]);

  useEffect(() => {
    if (!visible) setExpandedId(null);
  }, [visible]);

  const handleSend = (sendText: string) => {
    onSelect(sendText);
    setExpandedId(null);
    onClose();
  };

  const handleItemClick = (item: QuickCommandItem) => {
    if (item.children) {
      return;
    }
    if (item.isAction) {
      if (item.id === 'clear-history' && onClearHistory) {
        onClearHistory();
        setExpandedId(null);
        onClose();
        return;
      }
      if (item.id === 'restart' && onRestartGateway) {
        onRestartGateway();
        setExpandedId(null);
        onClose();
        return;
      }
    }
    if (item.sendText) {
      handleSend(item.sendText);
    }
  };

  const handleChildClick = (child: QuickCommandChild) => {
    handleSend(child.sendText);
  };

  const handleItemMouseEnter = (item: QuickCommandItem) => {
    if (submenuHoverTimer.current) {
      clearTimeout(submenuHoverTimer.current);
      submenuHoverTimer.current = null;
    }
    if (item.children) {
      setExpandedId(item.id);
    }
  };

  const handleItemMouseLeave = () => {
    submenuHoverTimer.current = setTimeout(() => {
      setExpandedId(null);
      submenuHoverTimer.current = null;
    }, 150);
  };

  const handleSubmenuMouseEnter = () => {
    if (submenuHoverTimer.current) {
      clearTimeout(submenuHoverTimer.current);
      submenuHoverTimer.current = null;
    }
  };

  const handleSubmenuMouseLeave = () => {
    setExpandedId(null);
  };

  if (!visible) return null;

  const rect = anchorRef.current?.getBoundingClientRect();
  const style: React.CSSProperties = rect
    ? { position: 'fixed', bottom: window.innerHeight - rect.top + 8, left: rect.left, minWidth: 260 }
    : {};

  return (
    <div ref={menuRef} className="quick-command-menu" style={style}>
      {MENU_STRUCTURE.map(({ group, items }) => (
        <div key={group} className="qcm-group">
          <div className="qcm-group-title">{group}</div>
          {items.map((item) => (
            <div
              key={item.id}
              className="qcm-item-wrap"
              onMouseEnter={() => handleItemMouseEnter(item)}
              onMouseLeave={handleItemMouseLeave}
            >
              <button
                type="button"
                className={`qcm-item ${item.children ? 'qcm-item-has-submenu' : ''} ${expandedId === item.id ? 'qcm-item-expanded' : ''}`}
                onClick={() => handleItemClick(item)}
              >
                <span className="qcm-arrow">▸</span>
                {item.label}
              </button>
              {item.children && expandedId === item.id && (
                <div
                  className="qcm-submenu"
                  onMouseEnter={handleSubmenuMouseEnter}
                  onMouseLeave={handleSubmenuMouseLeave}
                >
                  {item.children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      className="qcm-item qcm-submenu-item"
                      onClick={() => handleChildClick(child)}
                    >
                      <span className="qcm-arrow">▸</span>
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
