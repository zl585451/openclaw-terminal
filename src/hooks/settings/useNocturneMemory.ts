import { useCallback, useEffect, useState } from 'react';

export interface NocturneDetailState {
  available: boolean;
  path: string;
  backendAlive?: boolean;
  frontendAlive?: boolean;
  domains?: Array<{ domain: string }>;
  coreMemoryUris?: string[];
}

export type NocturneStatusBrief = { available: boolean; path: string } | null;

export function useNocturneMemory() {
  const [nocturneStatus, setNocturneStatus] = useState<NocturneStatusBrief>(null);
  const [nocturneDetail, setNocturneDetail] = useState<NocturneDetailState | null>(null);
  const [nocturneSetupStatus, setNocturneSetupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [nocturneSetupError, setNocturneSetupError] = useState('');
  const [nocturneDashboardStatus, setNocturneDashboardStatus] = useState<{
    backendRunning: boolean;
    frontendRunning: boolean;
  } | null>(null);
  const [nocturneStarting, setNocturneStarting] = useState(false);
  const [memoryReadContent, setMemoryReadContent] = useState<string | null>(null);
  const [memoryReadLoading, setMemoryReadLoading] = useState(false);
  const [restartingBackend, setRestartingBackend] = useState(false);
  const [amyWorkModeWriting, setAmyWorkModeWriting] = useState(false);

  const refreshNocturneDetail = useCallback(() => {
    const api = (window as any).electronAPI;
    if (!api?.getNocturneStatus) return;
    api
      .getNocturneStatus()
      .then((r: any) => {
        setNocturneDetail(r);
        if (r?.backendAlive !== undefined) {
          setNocturneDashboardStatus({ backendRunning: r.backendAlive, frontendRunning: !!r.frontendAlive });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI;

    if (api?.getNocturneStatus) {
      api
        .getNocturneStatus()
        .then((r: any) => {
          setNocturneStatus(r);
          setNocturneDetail(r);
          if (r?.backendAlive !== undefined) {
            setNocturneDashboardStatus({ backendRunning: r.backendAlive, frontendRunning: !!r.frontendAlive });
          }
        })
        .catch(() => {
          setNocturneStatus({ available: false, path: '' });
          setNocturneDetail(null);
        });
    }

    if (api?.getNocturneDashboardStatus) {
      api
        .getNocturneDashboardStatus()
        .then((r: { backendRunning: boolean; frontendRunning: boolean }) => setNocturneDashboardStatus(r))
        .catch(() => {});
    }
  }, []);

  return {
    nocturneStatus,
    nocturneDetail,
    setNocturneDetail,
    nocturneDashboardStatus,
    setNocturneDashboardStatus,
    nocturneStarting,
    setNocturneStarting,
    nocturneSetupStatus,
    setNocturneSetupStatus,
    nocturneSetupError,
    setNocturneSetupError,
    restartingBackend,
    setRestartingBackend,
    memoryReadContent,
    setMemoryReadContent,
    memoryReadLoading,
    setMemoryReadLoading,
    amyWorkModeWriting,
    setAmyWorkModeWriting,
    refreshNocturneDetail,
  };
}
