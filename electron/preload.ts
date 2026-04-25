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
  startScriptAdapterRun: (payload: {
    taskId: string;
    taskTitle: string;
    source?: string;
    useMock?: boolean;
  }) => ipcRenderer.invoke('script-adapter-run-start', payload),
  onScriptAdapterEvent: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('script-adapter-event', handler);
    return () => ipcRenderer.removeListener('script-adapter-event', handler);
  },
  getOpenClawStatus: () => ipcRenderer.invoke('openclaw-status'),
  chatHistoryLoad: () => ipcRenderer.invoke('chat-history-load'),
  chatHistorySave: (items: Array<{ role: string; content: string; timestamp: string }>) =>
    ipcRenderer.invoke('chat-history-save', items),
  openCodeWindow: (payload: { language?: string; code?: string }) =>
    ipcRenderer.invoke('open-code-window', payload),
  openTerminalWindow: () => ipcRenderer.invoke('open-terminal-window'),
  startGateway: () => ipcRenderer.invoke('start-gateway'),
  stopGateway: () => ipcRenderer.invoke('stop-gateway'),
  restartGateway: () => ipcRenderer.invoke('gateway-restart'),
  gatewayClearPortAndStart: () => ipcRenderer.invoke('gateway-clear-port-and-start'),
  getGatewayStatus: () => ipcRenderer.invoke('gateway-status'),
  getScreenshotShortcut: () => ipcRenderer.invoke('get-screenshot-shortcut'),
  setScreenshotShortcut: (shortcut: string) => ipcRenderer.invoke('set-screenshot-shortcut', shortcut),
  // 文件上传
  openFileDialog: (options?: { allowMultiple?: boolean; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('open-file-dialog', options),
  // 剧本文件解析（.txt / .docx → 纯文本）
  parseScriptFile: (): Promise<{
    success: boolean;
    text?: string;
    fileName?: string;
    sourcePath?: string;
    draftCachePath?: string;
    error?: string;
  }> =>
    ipcRenderer.invoke('parse-script-file'),
  saveScriptDraftCache: (payload: {
    content: string;
    draftCachePath?: string;
    sourcePath?: string;
    title?: string;
  }) => ipcRenderer.invoke('save-script-draft-cache', payload),
  // API Key 配置
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  saveApiKeys: (keys: {
        DASHSCOPE_API_KEY?: string;
        DEEPSEEK_API_KEY?: string;
        MINIMAX_API_KEY?: string;
        MOONSHOT_API_KEY?: string;
        IMAGE_PROVIDER?: string;
        IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY?: boolean | string;
        IMAGE_API_KEY?: string;
        IMAGE_BASE_URL?: string;
        IMAGE_MODEL?: string;
        IMAGE_MINIMAX_API_KEY?: string;
        IMAGE_MINIMAX_BASE_URL?: string;
        IMAGE_MINIMAX_MODEL?: string;
        IMAGE_SILICONFLOW_API_KEY?: string;
        IMAGE_SILICONFLOW_BASE_URL?: string;
        IMAGE_SILICONFLOW_MODEL?: string;
        IMAGE_OPENAI_API_KEY?: string;
        IMAGE_OPENAI_BASE_URL?: string;
        IMAGE_OPENAI_MODEL?: string;
        IMAGE_SIZE?: string;
        TTS_MINIMAX_VOICE_ID?: string;
        CUSTOM_API_KEY?: string;
        OPENCLAW_WS_URL?: string;
         OPENCLAW_TOKEN?: string;
         OCT_SETTINGS_MODE?: string;
         OCT_PROVIDER?: string;
         OCT_MODEL?: string;
        CUSTOM_MODEL?: string;
        DASHSCOPE_BASE_URL?: string;
        DEEPSEEK_BASE_URL?: string;
        MINIMAX_BASE_URL?: string;
        MOONSHOT_BASE_URL?: string;
        CUSTOM_BASE_URL?: string;
        GOOGLE_AI_API_KEY?: string;
        GOOGLE_AI_BASE_URL?: string;
        HTTPS_PROXY?: string;
        HTTP_PROXY?: string;
        BRAVE_SEARCH_API_KEY?: string;
        TAVILY_API_KEY?: string;
        VISION_API_KEY?: string;
        VISION_BASE_URL?: string;
        VISION_MODEL?: string;
        SILICONFLOW_API_KEY?: string;
      }) => ipcRenderer.invoke('save-api-keys', keys),
  getAgentPermissions: () => ipcRenderer.invoke('get-agent-permissions'),
  saveAgentPermissions: (permissions: {
    shellCommands?: boolean;
    fileWrite?: boolean;
    networkRequests?: boolean;
    softwareInstall?: boolean;
    systemConfig?: boolean;
  }) => ipcRenderer.invoke('save-agent-permissions', permissions),
  imageGenerate: (payload: {
    requestId: string;
    prompt: string;
    negativePrompt?: string;
    aspectRatio?: string;
    width?: number;
    height?: number;
    seed?: number | string;
    promptOptimizer?: boolean;
    aigcWatermark?: boolean;
    stylePreset?: string;
    quality?: string;
  }) => ipcRenderer.invoke('image-generate', payload),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  downloadImage: (payload: { url: string; suggestedName?: string }) => ipcRenderer.invoke('download-image', payload),
  onImageResult: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('image-result', handler);
    return () => ipcRenderer.removeListener('image-result', handler);
  },
  getPersonaSettings: () => ipcRenderer.invoke('get-persona-settings'),
  savePersonaSettings: (payload: {
    OCT_AI_NAME?: string;
    OCT_USER_NAME?: string;
    OCT_PERSONA_STYLE?: string;
  }) => ipcRenderer.invoke('save-persona-settings', payload),
  ttsSpeak: (payload: { text: string; providerPreference?: 'auto' | 'browser' | 'dashscope' | 'minimax' }) =>
    ipcRenderer.invoke('tts-speak', payload),
  musicGenerate: (payload: {
    title?: string;
    model?: string;
    prompt: string;
    lyrics?: string;
    instrumental?: boolean;
    lyricsOptimizer?: boolean;
    sampleRate?: number;
    bitrate?: number;
    format?: 'mp3' | 'wav';
  }) => ipcRenderer.invoke('music-generate', payload),
  musicHistoryLoad: () => ipcRenderer.invoke('music-history-load'),
  musicHistoryDelete: (id: string) => ipcRenderer.invoke('music-history-delete', id),
  lyricsGenerate: (payload: {
    prompt?: string;
    title?: string;
  }) => ipcRenderer.invoke('lyrics-generate', payload),
  getProviderList: () => ipcRenderer.invoke('get-provider-list'),
  testAIConnection: (formConfig?: Record<string, string>) => ipcRenderer.invoke('test-ai-connection', formConfig),
  getLocalVisionStatus: () => ipcRenderer.invoke('get-local-vision-status'),
  downloadLocalVisionModel: () => ipcRenderer.invoke('download-local-vision-model'),
  saveLocalVisionSettings: (payload: { enabled?: boolean; mirrorHost?: string }) => ipcRenderer.invoke('save-local-vision-settings', payload),
  // Nocturne 记忆系统
  getNocturneStatus: () => ipcRenderer.invoke('get-nocturne-status'),
  setupNocturneMemory: () => ipcRenderer.invoke('setup-nocturne-memory'),
  seedNocturneMemories: () => ipcRenderer.invoke('seed-nocturne-memories'),
  startNocturneDashboard: () => ipcRenderer.invoke('start-nocturne-dashboard'),
  stopNocturneDashboard: () => ipcRenderer.invoke('stop-nocturne-dashboard'),
  getNocturneDashboardStatus: () => ipcRenderer.invoke('nocturne-dashboard-status'),
  openNocturneManagement: () => ipcRenderer.invoke('open-nocturne-management'),
  restartNocturneBackend: () => ipcRenderer.invoke('restart-nocturne-backend'),
  getAiLibraryPlugin: () => ipcRenderer.invoke('get-ai-library-plugin'),
  saveAiLibraryPlugin: (payload: {
    OCT_AI_LIBRARY_AUTO_START?: boolean;
    OCT_AI_LIBRARY_PATH?: string;
    OCT_AI_LIBRARY_PORT?: number;
  }) => ipcRenderer.invoke('save-ai-library-plugin', payload),
  getMemorySummarizerConfig: () => ipcRenderer.invoke('get-memory-summarizer-config'),
  saveMemorySummarizerConfig: (payload: {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }) => ipcRenderer.invoke('save-memory-summarizer-config', payload),
  getMemoryVectorRecallConfig: () => ipcRenderer.invoke('get-memory-vector-recall-config'),
  saveMemoryVectorRecallConfig: (payload: {
    enabled?: boolean;
    provider?: 'bailian' | 'volcengine' | 'custom';
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    dimensions?: number;
    threshold?: number;
    topK?: number;
  }) => ipcRenderer.invoke('save-memory-vector-recall-config', payload),
  // Nocturne Memory — 完整 6 工具直接访问
  nocturneHealth: () => ipcRenderer.invoke('nocturne-health'),
  nocturneRead: (uri: string) => ipcRenderer.invoke('nocturne-read', { uri }),
  nocturneCreate: (uri: string, content: string, priority?: number, disclosure?: string) =>
    ipcRenderer.invoke('nocturne-create', { uri, content, priority, disclosure }),
  nocturneUpdate: (uri: string, content?: string, priority?: number, disclosure?: string) =>
    ipcRenderer.invoke('nocturne-update', { uri, content, priority, disclosure }),
  nocturneDelete: (uri: string) => ipcRenderer.invoke('nocturne-delete', { uri }),
  nocturneAlias: (sourceUri: string, targetUri: string, priority?: number, disclosure?: string) =>
    ipcRenderer.invoke('nocturne-alias', { sourceUri, targetUri, priority, disclosure }),
  nocturneSearch: (query: string, domain?: string) =>
    ipcRenderer.invoke('nocturne-search', { query, domain }),
  nocturneBatchImport: (memories: Array<{ uri: string; content: string; priority?: number; disclosure?: string }>) =>
    ipcRenderer.invoke('nocturne-batch-import', { memories }),
  // Task Board 任务看板
  nocturneGetTasks: () => ipcRenderer.invoke('nocturne-get-tasks'),
  nocturneUpdateTask: (taskId: string, done: boolean) =>
    ipcRenderer.invoke('nocturne-update-task', { taskId, done }),
  nocturneAddTask: (content: string, priority: 'p0' | 'p1' | 'p2', source: 'amy' | 'user') =>
    ipcRenderer.invoke('nocturne-add-task', { content, priority, source }),
  nocturneClearCompletedTasks: () => ipcRenderer.invoke('nocturne-clear-completed-tasks'),
  nocturneSetIntention: (intention: string) =>
    ipcRenderer.invoke('nocturne-set-intention', { intention }),
  invokeGatewayTool: (toolName: string, args: any) =>
    ipcRenderer.invoke('invoke-gateway-tool', toolName, args),
  // MCP Server 管理
  mcpGetStatus: () => ipcRenderer.invoke('mcp-get-status'),
  mcpAddServer: (name: string, cfg: any) => ipcRenderer.invoke('mcp-add-server', name, cfg),
  mcpRemoveServer: (name: string) => ipcRenderer.invoke('mcp-remove-server', name),
};

if (typeof window !== 'undefined') {
  (window as any).electronAPI = electronAPI;
}
