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
  imageGenerate?: (payload: {
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
  }) => Promise<{ success: boolean; error?: string }>;
  openExternalUrl?: (url: string) => Promise<{ success: boolean; error?: string }>;
  downloadImage?: (payload: { url: string; suggestedName?: string }) => Promise<{ success: boolean; error?: string; path?: string }>;
  onImageResult?: (callback: (payload: any) => void) => (() => void);
  enterFloatingMode?: () => void;
  invokeGatewayTool?: (toolName: string, args: any) => Promise<any>;
  getPersonaSettings?: () => Promise<{ success: boolean; data?: { OCT_AI_NAME: string; OCT_USER_NAME: string; OCT_PERSONA_STYLE: string }; error?: string }>;
  savePersonaSettings?: (payload: { OCT_AI_NAME?: string; OCT_USER_NAME?: string; OCT_PERSONA_STYLE?: string }) => Promise<{ success: boolean; error?: string }>;
  ttsSpeak?: (payload: { text: string; providerPreference?: 'auto' | 'browser' | 'dashscope' | 'minimax' }) => Promise<{ success: boolean; audioBase64?: string; mimeType?: string; error?: string }>;
  musicGenerate?: (payload: {
    title?: string;
    model?: string;
    prompt: string;
    lyrics?: string;
    instrumental?: boolean;
    lyricsOptimizer?: boolean;
    sampleRate?: number;
    bitrate?: number;
    format?: 'mp3' | 'wav';
  }) => Promise<{
    success: boolean;
    clipId?: string;
    audioBase64?: string;
    mimeType?: string;
    model?: string;
    traceId?: string;
    durationMs?: number;
    sampleRate?: number;
    bitrate?: number;
    sizeBytes?: number;
    error?: string;
  }>;
  musicHistoryLoad?: () => Promise<{
    success: boolean;
    clips: Array<{
      id: string;
      title: string;
      prompt: string;
      lyrics: string;
      instrumental: boolean;
      model: string;
      traceId?: string;
      durationMs?: number;
      sampleRate?: number;
      bitrate?: number;
      sizeBytes?: number;
      mimeType: string;
      filename: string;
      createdAt: number;
      filePath: string;
    }>;
    error?: string;
  }>;
  lyricsGenerate?: (payload: {
    prompt?: string;
    title?: string;
  }) => Promise<{
    success: boolean;
    title?: string;
    styleTags?: string;
    lyrics?: string;
    error?: string;
  }>;
  asrTranscribe?: (payload: { audioDataUrl: string; language?: string }) => Promise<{ success: boolean; text?: string; error?: string }>;
  getLocalVisionStatus?: () => Promise<{
    success: boolean;
    status?: 'ready' | 'not_downloaded' | 'downloading' | 'error';
    enabled?: boolean;
    downloaded?: boolean;
    modelId?: string;
    mirrorHost?: string;
    cacheDir?: string;
    fileCount?: number;
    lastError?: string;
    message?: string;
    error?: string;
  }>;
  downloadLocalVisionModel?: () => Promise<{
    success: boolean;
    status?: 'ready' | 'not_downloaded' | 'downloading' | 'error';
    downloaded?: boolean;
    message?: string;
    error?: string;
  }>;
  saveLocalVisionSettings?: (payload: { enabled?: boolean; mirrorHost?: string }) => Promise<{ success: boolean; error?: string }>;
  saveApiKeys?: (keys: {
    DASHSCOPE_API_KEY?: string;
    DEEPSEEK_API_KEY?: string;
    MINIMAX_API_KEY?: string;
    IMAGE_PROVIDER?: string;
    IMAGE_API_KEY?: string;
    IMAGE_BASE_URL?: string;
    IMAGE_MODEL?: string;
    IMAGE_SIZE?: string;
    TTS_MINIMAX_VOICE_ID?: string;
    CUSTOM_API_KEY?: string;
    OPENCLAW_WS_URL?: string;
    OPENCLAW_TOKEN?: string;
    OCT_PROVIDER?: string;
    OCT_MODEL?: string;
    CUSTOM_MODEL?: string;
    DASHSCOPE_BASE_URL?: string;
    DEEPSEEK_BASE_URL?: string;
    MINIMAX_BASE_URL?: string;
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
  }) => Promise<{ success: boolean; error?: string }>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
