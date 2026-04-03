import { useState, useEffect } from 'react';

export interface UseTimersReturn {
  localTime: string;
  localDate: string;
  windowFocused: boolean;
}

export function useTimers(): UseTimersReturn {
  const [localTime, setLocalTime] = useState('');
  const [localDate, setLocalDate] = useState('');
  const [windowFocused, setWindowFocused] = useState(true);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setLocalTime(d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const wd = d.toLocaleDateString('zh-CN', { weekday: 'long' });
      setLocalDate(`${y}.${m}.${day} ${wd}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const updateFocus = () => setWindowFocused(document.hasFocus());
    window.addEventListener('focus', updateFocus);
    window.addEventListener('blur', updateFocus);
    document.addEventListener('visibilitychange', updateFocus);
    updateFocus();
    return () => {
      window.removeEventListener('focus', updateFocus);
      window.removeEventListener('blur', updateFocus);
      window.removeEventListener('visibilitychange', updateFocus);
    };
  }, []);

  return {
    localTime,
    localDate,
    windowFocused,
  };
}
