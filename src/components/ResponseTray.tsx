import { useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import './ResponseTray.css';

interface ResponseTrayProps {
  pills: string[];
  label?: string;
  onSelect: (text: string) => void;
  onDismiss: () => void;
}

export default function ResponseTray({
  pills,
  label,
  onSelect,
  onDismiss,
}: ResponseTrayProps) {
  const { settings } = useSettings();
  const trayRef = useRef<HTMLDivElement>(null);
  const effectiveLabel = label || `${settings.aiName || 'OpenClaw'} 想确认一件事`;

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
      <div className="response-tray__label">{effectiveLabel} →</div>
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
