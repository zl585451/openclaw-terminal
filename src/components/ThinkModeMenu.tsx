import { useEffect, useRef } from 'react';
import '../styles/ThinkModeMenu.css';

export const THINK_MODES = [
  { id: 'confusion', icon: '◌', name: '理清思路', desc: '思路混乱时整理想法' },
  { id: 'decision', icon: '⊞', name: '做决定',   desc: '多个选项间做出选择' },
  { id: 'goal',     icon: '⊡', name: '分解目标', desc: '把大目标变成可行步骤' },
  { id: 'priority', icon: '◈', name: '排优先级', desc: '找出最应该先做的事' },
  { id: 'stuck',    icon: '▶', name: '找到起点', desc: '不知从哪开始时' },
] as const;

interface ThinkModeMenuProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
  onClose: () => void;
  onSelect: (templateId: string) => void;
}

export default function ThinkModeMenu({ anchorRef, visible, onClose, onSelect }: ThinkModeMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      ) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible, onClose, anchorRef]);

  if (!visible) return null;

  const rect = anchorRef.current?.getBoundingClientRect();
  const style: React.CSSProperties = rect
    ? { position: 'fixed', bottom: window.innerHeight - rect.top + 8, left: rect.left }
    : { position: 'fixed', bottom: 80, left: 20 };

  return (
    <div ref={menuRef} className="think-mode-menu" style={style}>
      <div className="think-mode-menu-header">◈ 思维模式</div>
      {THINK_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className="think-mode-item"
          onClick={() => { onSelect(mode.id); onClose(); }}
        >
          <span className="think-mode-icon">{mode.icon}</span>
          <span className="think-mode-info">
            <span className="think-mode-name">{mode.name}</span>
            <span className="think-mode-desc">{mode.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
