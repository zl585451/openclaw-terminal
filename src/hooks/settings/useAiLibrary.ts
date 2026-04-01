import { useCallback, useEffect, useState } from 'react';

export interface AiLibraryStatus {
  healthy: boolean;
  managed: boolean;
  portInUse: boolean;
  resolvedGatewayUrl: string;
}

export function useAiLibrary() {
  const [aiLibAutoStart, setAiLibAutoStart] = useState(false);
  const [aiLibPath, setAiLibPath] = useState('');
  const [aiLibPort, setAiLibPort] = useState(8001);
  const [aiLibStatus, setAiLibStatus] = useState<AiLibraryStatus | null>(null);
  const [aiLibSaving, setAiLibSaving] = useState(false);

  const refreshAiLibraryStatus = useCallback(() => {
    const api = (window as any).electronAPI;
    if (!api?.getAiLibraryPlugin) return;
    api
      .getAiLibraryPlugin()
      .then((r: any) => {
        if (r?.success && r.data) {
          setAiLibStatus({
            healthy: !!r.data.healthy,
            managed: !!r.data.managed,
            portInUse: !!r.data.portInUse,
            resolvedGatewayUrl: String(r.data.resolvedGatewayUrl || ''),
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getAiLibraryPlugin) {
      api
        .getAiLibraryPlugin()
        .then((r: any) => {
          if (r?.success && r.data) {
            setAiLibAutoStart(!!r.data.OCT_AI_LIBRARY_AUTO_START);
            setAiLibPath(String(r.data.OCT_AI_LIBRARY_PATH || ''));
            setAiLibPort(Number(r.data.OCT_AI_LIBRARY_PORT) || 8001);
            setAiLibStatus({
              healthy: !!r.data.healthy,
              managed: !!r.data.managed,
              portInUse: !!r.data.portInUse,
              resolvedGatewayUrl: String(r.data.resolvedGatewayUrl || ''),
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  return {
    aiLibAutoStart,
    setAiLibAutoStart,
    aiLibPath,
    setAiLibPath,
    aiLibPort,
    setAiLibPort,
    aiLibStatus,
    setAiLibStatus,
    aiLibSaving,
    setAiLibSaving,
    refreshAiLibraryStatus,
  };
}
