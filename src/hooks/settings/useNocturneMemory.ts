import { useState, useEffect } from 'react';

export interface NocturneStatus {
  available: boolean;
  path: string;
  backendAlive?: boolean;
  frontendAlive?: boolean;
  domains?: Array<{ domain: string }>;
  coreMemoryUris?: string[];
}

export interface NocturneDashboardStatus {
  backendRunning: boolean;
  frontendRunning: boolean;
}

export interface UseNocturneMemoryReturn {
  nocturneStatus: NocturneStatus | null;
  nocturneDetail: NocturneStatus | null;
  nocturneDashboardStatus: NocturneDashboardStatus | null;
  nocturneStarting: boolean;
  memoryReadContent: string | null;
  memoryReadLoading: boolean;
  restartingBackend: boolean;
  
  // Actions
  refreshNocturneStatus: () => Promise<void>;
  startNocturne: () => Promise<{ success: boolean; error?: string }>;
  restartBackend: () => Promise<void>;
  readMemoryContent: () => Promise<void>;
  writeMemoryContent: (content: string) => Promise<{ success: boolean; error?: string }>;
}

export function useNocturneMemory(): UseNocturneMemoryReturn {
  const [nocturneStatus, setNocturneStatus] = useState<NocturneStatus | null>(null);
  const [nocturneDetail, setNocturneDetail] = useState<NocturneStatus | null>(null);
  const [nocturneDashboardStatus, setNocturneDashboardStatus] = useState<NocturneDashboardStatus | null>(null);
  const [nocturneStarting, setNocturneStarting] = useState(false);
  const [memoryReadContent, setMemoryReadContent] = useState<string | null>(null);
  const [memoryReadLoading, setMemoryReadLoading] = useState(false);
  const [restartingBackend, setRestartingBackend] = useState(false);

  // Load initial status
  useEffect(() => {
    const api = (window as any).electronAPI;
    
    if (api?.getNocturneStatus) {
      api.getNocturneStatus().then((r: any) => {
        setNocturneStatus(r);
        setNocturneDetail(r);
        if (r?.backendAlive !== undefined) {
          setNocturneDashboardStatus({ backendRunning: r.backendAlive, frontendRunning: !!r.frontendAlive });
        }
      }).catch(() => {
        setNocturneStatus({ available: false, path: '' });
        setNocturneDetail(null);
      });
    }
    
    if (api?.getNocturneDashboardStatus) {
      api.getNocturneDashboardStatus().then((r: NocturneDashboardStatus) => setNocturneDashboardStatus(r)).catch(() => {});
    }
    
    // Provide default status for browser environment if no electronAPI
    if (!api) {
      setNocturneStatus({ available: false, path: '' });
      setNocturneDashboardStatus({ backendRunning: false, frontendRunning: false });
    }
  }, []);

  const refreshNocturneStatus = async () => {
    const api = (window as any).electronAPI;
    if (!api?.getNocturneStatus) return;

    try {
      const r = await api.getNocturneStatus();
      setNocturneDetail(r);
      if (r?.backendAlive !== undefined) {
        setNocturneDashboardStatus({ backendRunning: r.backendAlive, frontendRunning: !!r.frontendAlive });
      }
    } catch (err) {
      console.error('[Settings] refreshNocturneStatus 错误:', err);
    }
  };

  const startNocturne = async () => {
    const api = (window as any).electronAPI;
    if (!api?.startNocturne) return { success: false, error: 'API not available' };

    setNocturneStarting(true);
    try {
      const r = await api.startNocturne();
      if (r?.success) {
        await refreshNocturneStatus();
        return { success: true };
      } else {
        return { success: false, error: r?.error || '启动失败' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || '启动失败' };
    } finally {
      setNocturneStarting(false);
    }
  };

  const restartBackend = async () => {
    const api = (window as any).electronAPI;
    if (!api?.restartNocturneBackend) return;

    setRestartingBackend(true);
    try {
      await api.restartNocturneBackend();
      await refreshNocturneStatus();
    } catch (err) {
      console.error('[Settings] restartBackend 错误:', err);
    } finally {
      setRestartingBackend(false);
    }
  };

  const readMemoryContent = async () => {
    const api = (window as any).electronAPI;
    if (!api?.readNocturneMemory) return;

    setMemoryReadLoading(true);
    try {
      const result = await api.readNocturneMemory();
      if (result?.success) {
        setMemoryReadContent(result.content || '');
      }
    } catch (err) {
      console.error('[Settings] readMemoryContent 错误:', err);
    } finally {
      setMemoryReadLoading(false);
    }
  };

  const writeMemoryContent = async (content: string) => {
    const api = (window as any).electronAPI;
    if (!api?.writeNocturneMemory) return { success: false, error: 'API not available' };

    try {
      const r1 = await api.writeNocturneMemory(content);
      const r2 = await api.writeAmyWorkMode(content);
      
      if (r1?.success && r2?.success) {
        await refreshNocturneStatus();
        return { success: true };
      } else {
        return { success: false, error: r1?.error || r2?.error || '写入失败' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || '写入失败' };
    }
  };

  return {
    nocturneStatus,
    nocturneDetail,
    nocturneDashboardStatus,
    nocturneStarting,
    memoryReadContent,
    memoryReadLoading,
    restartingBackend,
    refreshNocturneStatus,
    startNocturne,
    restartBackend,
    readMemoryContent,
    writeMemoryContent,
  };
}