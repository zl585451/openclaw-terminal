import { ipcRenderer } from 'electron';

const electronAPI = {
  setAlwaysOnTop: (value: boolean) =>
    ipcRenderer.invoke('set-always-on-top', value),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),
  minimize: () => ipcRenderer.invoke('minimize-window'),
  maximize: () => ipcRenderer.invoke('maximize-window'),
  close: () => ipcRenderer.invoke('close-window'),
  enterFloatingMode: () => ipcRenderer.invoke('enter-floating-mode'),
  readLogFile: (logPath: string) => ipcRenderer.invoke('read-log-file', logPath),
  watchLogFile: (logPath: string) => ipcRenderer.invoke('start-log-watch', logPath),
  getEnv: (key: string) => ipcRenderer.invoke('get-env', key),
  // OpenClaw WebSocket 连接
  connectOpenClaw: () => ipcRenderer.invoke('openclaw-connect'),
  sendOpenClawMessage: (content: string) => ipcRenderer.invoke('openclaw-send', content),
  getOpenClawStatus: () => ipcRenderer.invoke('openclaw-status'),
  chatHistoryLoad: () => ipcRenderer.invoke('chat-history-load'),
  chatHistorySave: (items: Array<{ role: string; content: string; timestamp: string }>) =>
    ipcRenderer.invoke('chat-history-save', items),
  openCodeWindow: (payload: { language?: string; code?: string }) =>
    ipcRenderer.invoke('open-code-window', payload),
  openTerminalWindow: () => ipcRenderer.invoke('open-terminal-window'),
  startGateway: () => ipcRenderer.invoke('start-gateway'),
  stopGateway: () => ipcRenderer.invoke('stop-gateway'),
  getGatewayStatus: () => ipcRenderer.invoke('gateway-status'),
  getScreenshotShortcut: () => ipcRenderer.invoke('get-screenshot-shortcut'),
  setScreenshotShortcut: (shortcut: string) => ipcRenderer.invoke('set-screenshot-shortcut', shortcut),
  // 文件上传
  openFileDialog: (options?: { allowMultiple?: boolean; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('open-file-dialog', options),
  // API Key 配置
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  saveApiKeys: (keys: { DASHSCOPE_API_KEY?: string; DEEPSEEK_API_KEY?: string; OPENCLAW_WS_URL?: string; OPENCLAW_TOKEN?: string }) =>
    ipcRenderer.invoke('save-api-keys', keys),
  // License 授权
  licenseCheck: () => ipcRenderer.invoke('license-check'),
  licenseVerify: (code: string) => ipcRenderer.invoke('license-verify', code),
};

if (typeof window !== 'undefined') {
  (window as any).electronAPI = electronAPI;
}