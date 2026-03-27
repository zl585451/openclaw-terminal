import { useEffect, useRef } from 'react';
import './ResponseTray.css';

interface ResponseTrayProps {
  pills: string[];
  label?: string;
  onSelect: (text: string) => void;
  onDismiss: () => void;
}

export default function ResponseTray({
  pills,
  label = 'AMY 想确认一件事',
  onSelect,
  onDismiss,
}: ResponseTrayProps) {
  const trayRef = useRef<HTMLDivElement>(null);

  // 进场动画触发
  useEffect(() => {
    const el = trayRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.classList.add('response-tray--visible');
    });
  }, []);

  const handleSelect = (text: string) => {
    const el = trayRef.current;
    if (el) {
      el.classList.remove('response-tray--visible');
      el.classList.add('response-tray--exit');
    }
    setTimeout(() => {
      onSelect(text);
      onDismiss();
    }, 150);
  };

  return (
    <div ref={trayRef} className="response-tray">
      <div className="response-tray__label">{label} →</div>
      <div className="response-tray__pills">
        {pills.map((pill, i) => (
          <button
            key={i}
            className="response-tray__pill"
            onClick={() => handleSelect(pill)}
          >
            {pill}
          </button>
        ))}
      </div>
    </div>
  );
}
