/// <reference types="vite/client" />

// Electron API 类型声明
interface ElectronAPI {
  setAlwaysOnTop: (value: boolean) => Promise<boolean>;
  getAlwaysOnTop: () => Promise<boolean>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  readLogFile: (logPath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  watchLogFile: (logPath: string) => Promise<{ success: boolean; error?: string }>;
  getEnv: (key: string) => Promise<string>;
  chatHistoryLoad: () => Promise<Array<{ role: string; content: string; timestamp: string }>>;
  chatHistorySave: (items: Array<{ role: string; content: string; timestamp: string; isSystemReply?: boolean }>) => Promise<void>;
  enterFloatingMode?: () => void;
  invokeGatewayTool?: (toolName: string, args: any) => Promise<any>;
  getPersonaSettings?: () => Promise<{ success: boolean; data?: { OCT_AI_NAME: string; OCT_USER_NAME: string; OCT_PERSONA_STYLE: string }; error?: string }>;
  savePersonaSettings?: (payload: { OCT_AI_NAME?: string; OCT_USER_NAME?: string; OCT_PERSONA_STYLE?: string }) => Promise<{ success: boolean; error?: string }>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
