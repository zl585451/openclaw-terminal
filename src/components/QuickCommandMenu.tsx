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
}

const MENU_STRUCTURE: { group: string; items: QuickCommandItem[] }[] = [
  {
    group: '━━ AGENT ━━━━━━━━━━━━━',
    items: [
      { id: 'status', label: '状态查询', sendText: '/status' },
      { id: 'new', label: '新对话', sendText: '/new' },
      {
        id: 'switch-model',
        label: '切换模型',
        sendText: '列出当前所有可用模型，以选项框形式展示，每项显示模型名称和简短说明，供我选择后切换。',
      },
      { id: 'stop', label: '停止执行', sendText: '/stop' },
    ],
  },
  {
    group: '━━ DEBUG ━━━━━━━━━━━━━',
    items: [
      {
        id: 'think',
        label: '思考模式',
        children: [
          { id: 'think-off', label: 'OFF', sendText: '/think off' },
          { id: 'think-low', label: 'LOW', sendText: '/think low' },
          { id: 'think-medium', label: 'MEDIUM', sendText: '/think medium' },
          { id: 'think-high', label: 'HIGH', sendText: '/think high' },
        ],
      },
    ],
  },
  {
    group: '━━ GUIDE ━━━━━━━━━━━━━',
    items: [
      {
        id: 'guide-mode',
        label: '启用引导模式',
        sendText:
          '【系统指令】从现在起，当你判断用户需要整理思路或做决策时，请在回复正文末尾单独加一行标记：[THINK_MODE:xxx]，其中 xxx 从以下选项中选一个最合适的：decision（做决定/选择）、priority（优先级排序）、stuck（不知从哪开始）、confusion（思路混乱）、goal（分解大目标）。不要在正文中生成 checkbox 选项框，只加这一行标记即可，其余照常回复。',
      },
      {
        id: 'guide-off',
        label: '关闭引导模式',
        sendText: '【系统指令】停止在回复末尾添加 [THINK_MODE:xxx] 标记，恢复正常回复模式。',
      },
    ],
  },
  {
    group: '━━ SYSTEM ━━━━━━━━━━━━',
    items: [
      { id: 'restart', label: '重启Gateway', sendText: '/restart' },
      { id: 'clear-history', label: '清理历史对话', isAction: true },
    ],
  },
];

export default function QuickCommandMenu({ anchorRef, visible, onClose, onSelect, onClearHistory }: QuickCommandMenuProps) {
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
    if (item.isAction && item.id === 'clear-history' && onClearHistory) {
      onClearHistory();
      setExpandedId(null);
      onClose();
      return;
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
