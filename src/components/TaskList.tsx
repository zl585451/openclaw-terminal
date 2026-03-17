import { useState, useEffect } from 'react';
import type { OptionItem } from '../utils/optionBoxParser';
import '../styles/TaskList.css';

interface TaskListProps {
  items: OptionItem[];
  onAllDone?: () => void;
}

export default function TaskList({ items, onAllDone }: TaskListProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [celebrated, setCelebrated] = useState(false);

  const allDone = items.length > 0 && checked.size === items.length;

  useEffect(() => {
    if (allDone && !celebrated) {
      setCelebrated(true);
      onAllDone?.();
    }
  }, [allDone, celebrated, onAllDone]);

  const toggle = (num: number) => {
    if (celebrated) return;
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  if (!items || items.length === 0) return null;

  return (
    <div className={`task-list ${allDone ? 'all-done' : ''}`}>
      <div className="task-list-header">
        <span className="task-list-title">◈ 任务清单</span>
        <span className="task-list-count">{checked.size}/{items.length}</span>
      </div>
      <div className="task-list-items">
        {items.map((item) => {
          const done = checked.has(item.num);
          return (
            <div
              key={item.num}
              className={`task-item ${done ? 'done' : ''}`}
              onClick={() => toggle(item.num)}
            >
              <span className="task-checkbox" aria-hidden />
              <span className="task-label">{item.label}</span>
            </div>
          );
        })}
      </div>
      {allDone && (
        <div className="task-celebration">
          <span className="task-celebration-sparkle">✦</span>
          <span className="task-celebration-text">全部完成！</span>
          <span className="task-celebration-sparkle">✦</span>
        </div>
      )}
    </div>
  );
}
