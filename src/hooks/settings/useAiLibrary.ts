import { useState, useEffect } from 'react';

export interface AiLibraryStatus {
  healthy: boolean;
  managed: boolean;
  portInUse: boolean;
  resolvedGatewayUrl: string;
}

export interface UseAiLibraryReturn {
  aiLibAutoStart: boolean;
  setAiLibAutoStart: React.Dispatch<React.SetStateAction<boolean>>;
  aiLibPath: string;
  setAiLibPath: React.Dispatch<React.SetStateAction<string>>;
  aiLibPort: number;
  setAiLibPort: React.Dispatch<React.SetStateAction<number>>;
  aiLibStatus: AiLibraryStatus | null;
  aiLibSaving: boolean;
  
  // Actions
  refreshAiLibraryStatus: () => Promise<void>;
  saveAiLibraryConfig: () => Promise<{ success: boolean; error?: string }>;
}

export function useAiLibrary(): UseAiLibraryReturn {
  const [aiLibAutoStart, setAiLibAutoStart] = useState(false);
  const [aiLibPath, setAiLibPath] = useState('');
  const [aiLibPort, setAiLibPort] = useState(8001);
  const [aiLibStatus, setAiLibStatus] = useState<AiLibraryStatus | null>(null);
  const [aiLibSaving, setAiLibSaving] = useState(false);

  // Load initial data
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getAiLibraryPlugin) {
      api.getAiLibraryPlugin().then((r: any) => {
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
      }).catch(() => {});
    } else {
      // Provide default status for browser environment
      setAiLibStatus({
        healthy: false,
        managed: false,
        portInUse: false,
        resolvedGatewayUrl: '',
      });
    }
  }, []);

  const refreshAiLibraryStatus = async () => {
    const api = (window as any).electronAPI;
    if (!api?.getAiLibraryPlugin) return;

    try {
      const r = await api.getAiLibraryPlugin();
      if (r?.success && r.data) {
        setAiLibStatus({
          healthy: !!r.data.healthy,
          managed: !!r.data.managed,
          portInUse: !!r.data.portInUse,
          resolvedGatewayUrl: String(r.data.resolvedGatewayUrl || ''),
        });
      }
    } catch (err) {
      console.error('[Settings] refreshAiLibraryStatus 错误:', err);
    }
  };

  const saveAiLibraryConfig = async () => {
    const api = (window as any).electronAPI;
    if (!api?.saveAiLibraryPlugin) return { success: false, error: 'API not available' };

    setAiLibSaving(true);
    try {
      const r = await api.saveAiLibraryPlugin({
        OCT_AI_LIBRARY_AUTO_START: aiLibAutoStart,
        OCT_AI_LIBRARY_PATH: aiLibPath.trim(),
        OCT_AI_LIBRARY_PORT: aiLibPort,
      });

      if (r?.success) {
        // Refresh status after save
        await refreshAiLibraryStatus();
        return { success: true };
      } else {
        return { success: false, error: r?.error || '保存失败' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || '保存失败' };
    } finally {
      setAiLibSaving(false);
    }
  };

  return {
    aiLibAutoStart,
    setAiLibAutoStart,
    aiLibPath,
    setAiLibPath,
    aiLibPort,
    setAiLibPort,
    aiLibStatus,
    aiLibSaving,
    refreshAiLibraryStatus,
    saveAiLibraryConfig,
  };
}