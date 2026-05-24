import { useState, useEffect } from 'react';

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : {
        invoke: () => Promise.resolve(null),
        on: () => {},
        off: () => {},
        removeListener: () => {},
      };

export function useLogPathInit(): void {
  const [, setLogPath] = useState('');

  useEffect(() => {
    ipcRenderer.invoke('get-env', 'OPENCLAW_LOG_PATH').then((p: string) => {
      if (p) setLogPath(p);
      // 自动启动日志监控
      ipcRenderer.invoke('start-log-watch', p || '');
    });
  }, []);
}
