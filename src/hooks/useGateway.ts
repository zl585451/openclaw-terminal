import { useState, useRef, useEffect, useCallback } from 'react';
import type { MutableRefObject } from 'react';

const ipcRenderer = typeof window !== 'undefined' && typeof (window as any).require === 'function'
  ? (window as any).require('electron').ipcRenderer
  : { invoke: () => Promise.resolve(null), on: () => {}, off: () => {}, removeListener: () => {} };

/**
 * @param suspendLogSyncToReactRef 为 true 时：日志仍入队，但不 flush 到 React state，
 *   避免流式输出期间每条网关日志触发整页 ChatTab 重渲染。结束流式后应调用 flushPendingLogLines()。
 */
export function useGateway(suspendLogSyncToReactRef?: MutableRefObject<boolean>) {
  const [gatewayRunning, setGatewayRunning] = useState(false);
  const [gatewayManaged, setGatewayManaged] = useState(false);
  const [gatewayPortInUse, setGatewayPortInUse] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const pendingLinesRef = useRef<string[]>([]);
  const flushRafRef = useRef<number | null>(null);

  const flushPendingLogLines = useCallback(() => {
    if (flushRafRef.current != null) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
    if (pendingLinesRef.current.length === 0) return;
    const batch = pendingLinesRef.current.splice(0, pendingLinesRef.current.length);
    setLogLines((prev) => {
      const updated = [...prev, ...batch];
      return updated.length > 1000 ? updated.slice(-500) : updated;
    });
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    // 查询 Gateway 初始状态
    ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
      setGatewayRunning(s.running);
      setGatewayManaged(s.managed);
      setGatewayPortInUse(s.portInUse ?? false);
    });
    
    const onGwStatus = (_: any, s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
      setGatewayRunning(s.running);
      setGatewayManaged(s.managed);
      setGatewayPortInUse(s.portInUse ?? false);
    };
    ipcRenderer.on('gateway-status', onGwStatus);
    
    // 监听日志更新（纯 DOM 方式）
    const onLogLines = (_: any, lines: string[]) => {
      pendingLinesRef.current.push(...lines);
      if (suspendLogSyncToReactRef?.current) return;
      if (flushRafRef.current != null) return;
      flushRafRef.current = requestAnimationFrame(() => {
        flushRafRef.current = null;
        if (suspendLogSyncToReactRef?.current) return;
        if (pendingLinesRef.current.length === 0) return;
        const batch = pendingLinesRef.current.splice(0, pendingLinesRef.current.length);
        setLogLines((prev) => {
          const updated = [...prev, ...batch];
          return updated.length > 1000 ? updated.slice(-500) : updated;
        });
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      });
    };
    ipcRenderer.on('openclaw-log-lines', onLogLines);
    
    return () => {
      ipcRenderer.removeListener('gateway-status', onGwStatus);
      ipcRenderer.removeListener('openclaw-log-lines', onLogLines);
      if (flushRafRef.current != null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
      pendingLinesRef.current = [];
    };
  }, []);

  const startGateway = () => {
    ipcRenderer.invoke('start-gateway').then(() => {
      ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
        setGatewayRunning(s.running);
        setGatewayManaged(s.managed);
        setGatewayPortInUse(s.portInUse ?? false);
      });
    });
  };

  const stopGateway = () => {
    if (gatewayRunning && gatewayManaged) {
      ipcRenderer.invoke('stop-gateway');
      ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
        setGatewayRunning(s.running);
        setGatewayManaged(s.managed);
        setGatewayPortInUse(s.portInUse ?? false);
      });
    }
  };

  const restartGateway = () => {
    ipcRenderer.invoke('gateway-clear-port-and-start').then(() => {
      ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
        setGatewayRunning(s.running);
        setGatewayManaged(s.managed);
        setGatewayPortInUse(s.portInUse ?? false);
      });
    });
  };

  const clearPort = () => {
    ipcRenderer.invoke('gateway-clear-port-and-start').then(() => {
      ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
        setGatewayRunning(s.running);
        setGatewayManaged(s.managed);
        setGatewayPortInUse(s.portInUse ?? false);
      });
    });
  };

  const exportLogs = async () => {
    if (logLines.length === 0) return;
    const content = logLines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gateway-log-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    setLogLines([]);
  };

  return {
    gatewayRunning,
    gatewayManaged,
    gatewayPortInUse,
    logLines,
    logContainerRef,
    startGateway,
    stopGateway,
    restartGateway,
    clearPort,
    exportLogs,
    clearLogs,
    flushPendingLogLines,
  };
}

export type UseGatewayReturn = ReturnType<typeof useGateway>;
