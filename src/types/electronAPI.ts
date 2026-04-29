import type { PermissionConfig } from '../utils/permissionCheck';
import type { McpServerInfo } from '../ui/settings/tabs/McpTabView';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type UnknownRecord = Record<string, unknown>;

export interface IpcRendererLike {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) => void;
  off?: (channel: string, listener: (event: unknown, payload: unknown) => void) => void;
  removeListener: (channel: string, listener: (event: unknown, payload: unknown) => void) => void;
}

export interface ElectronRequire {
  (moduleName: 'electron'): { ipcRenderer: IpcRendererLike };
  (moduleName: string): unknown;
}

export interface ApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PersonaSettings {
  OCT_AI_NAME: string;
  OCT_USER_NAME: string;
  OCT_PERSONA_STYLE: string;
}

export interface TtsSpeakResult extends ApiResult {
  audioBase64?: string;
  mimeType?: string;
}

export interface AiLibraryPluginSettings {
  OCT_AI_LIBRARY_AUTO_START?: boolean;
  OCT_AI_LIBRARY_PATH?: string;
  OCT_AI_LIBRARY_PORT?: number;
}

export interface AiLibraryPluginStatus extends AiLibraryPluginSettings {
  resolvedGatewayUrl?: string;
  managed?: boolean;
  portInUse?: boolean;
  healthy?: boolean;
}

export interface MemorySummarizerConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface MemoryVectorRecallConfig {
  enabled: boolean;
  provider: 'bailian' | 'volcengine' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  threshold: number;
  topK: number;
}

export interface NocturneStatusResult {
  available: boolean;
  path: string;
  backendAlive?: boolean;
  frontendAlive?: boolean;
  domains?: Array<{ domain: string; root_count?: number }>;
  coreMemoryUris?: string[];
  coreMemoryStatus?: Array<{
    uri: string;
    ok: boolean;
    hasContent: boolean;
    contentLength: number;
    error?: string;
  }>;
  coreMemoryReadyCount?: number;
  coreMemoryMissingCount?: number;
  dbPath?: string;
  dbUrl?: string;
  envPath?: string;
  diagnosticLogPath?: string;
  stderrLogPath?: string;
}

export interface NocturneDashboardStatus {
  backendRunning: boolean;
  frontendRunning: boolean;
}

export interface NocturneNode {
  content?: string;
  priority?: number;
  disclosure?: string;
}

export interface NocturneMemoryItem {
  uri?: string;
  node?: NocturneNode;
  content?: string;
}

export interface NocturneReadResult {
  ok: boolean;
  data?: NocturneMemoryItem | NocturneMemoryItem[] | string;
  error?: string;
}

export interface NocturneWriteResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface ChatHistoryItem {
  role: string;
  content: string;
  timestamp: string;
  isSystemReply?: boolean;
}

export interface ImageGeneratePayload {
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
}

export interface ImageResultPayload {
  requestId?: string;
  success?: boolean;
  status?: string;
  message?: string;
  url?: string;
  imageUrl?: string;
  imageUrls?: string[];
  prompt?: string;
  localPath?: string;
  error?: string;
  [key: string]: unknown;
}

export interface MusicGeneratePayload {
  title?: string;
  model?: string;
  prompt: string;
  lyrics?: string;
  instrumental?: boolean;
  lyricsOptimizer?: boolean;
  sampleRate?: number;
  bitrate?: number;
  format?: 'mp3' | 'wav';
}

export interface MusicClip {
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
}

export interface MusicGenerateResult extends ApiResult {
  clipId?: string;
  audioBase64?: string;
  mimeType?: string;
  model?: string;
  traceId?: string;
  durationMs?: number;
  sampleRate?: number;
  bitrate?: number;
  sizeBytes?: number;
}

export interface LyricsGenerateResult extends ApiResult {
  title?: string;
  styleTags?: string;
  lyrics?: string;
}

export interface ElectronAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  startScriptAdapterRun?: (payload: {
    taskId: string;
    taskTitle: string;
    source?: string;
    sourceText?: string;
    config?: unknown;
  }) => Promise<ApiResult & { taskId?: string; planId?: string }>;
  cancelScriptAdapterRun?: (payload: { taskId: string; reason?: string }) => Promise<ApiResult & { taskId?: string; status?: string }>;
  listScriptAdapterRuns?: () => Promise<ApiResult & {
    runs?: Array<{
      taskId: string;
      planId?: string;
      taskTitle?: string;
      status?: string;
      createdAt?: string;
      updatedAt?: string;
      completedAt?: string;
      error?: string;
    }>;
  }>;
  scriptAdapterBatch?: {
    start: (payload: {
      bookId: string;
      chapterIndices: number[];
      bookTitle?: string;
      config?: unknown;
      estimate?: unknown;
    }) => Promise<ApiResult & { batchId?: string }>;
    status: (batchId: string) => Promise<ApiResult & { batch?: unknown; chapterRuns?: unknown[] }>;
    list: (params?: { limit?: number; offset?: number }) => Promise<ApiResult & { batches?: unknown[] }>;
    cancel: (batchId: string) => Promise<ApiResult>;
    subscribe: (batchId: string) => Promise<ApiResult & { subscribed?: boolean; batchId?: string }>;
    approveGate: (batchId: string, gateId: string, reviewerNote?: string) => Promise<ApiResult>;
    rejectGate: (batchId: string, gateId: string, reviewerNote?: string) => Promise<ApiResult>;
    rerunChapter: (batchId: string, chapterIndex: number) => Promise<ApiResult>;
    remove: (batchId: string) => Promise<ApiResult>;
  };
  onScriptAdapterEvent?: (callback: (payload: UnknownRecord) => void) => (() => void);
  /** AI.library 项目书库：Electron/Node 原生内置实现，不依赖 Python 后端 */
  library?: {
    list: (params?: { limit?: number; offset?: number }) => Promise<
      { success: true; data: unknown } | { success: false; error: string }
    >;
    get: (bookId: string) => Promise<{ success: true; data: unknown } | { success: false; error: string }>;
    chapters: (bookId: string) => Promise<{ success: true; data: unknown } | { success: false; error: string }>;
    chapter: (
      bookId: string,
      chapterIndex: number,
    ) => Promise<{ success: true; data: unknown } | { success: false; error: string }>;
    pickFile: () => Promise<{ success: true; filePath: string } | { success: false; error: string }>;
    upload: (params: {
      filePath: string;
      title: string;
      author?: string;
    }) => Promise<{ success: true; data: unknown } | { success: false; error: string }>;
    remove: (bookId: string) => Promise<{ success: true; data: unknown } | { success: false; error: string }>;
  };
  delivery?: {
    exportMarkdown: (params: {
      filename: string;
      content: string;
    }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    exportDocx: (params: {
      filename: string;
      documentTitle: string;
      data: unknown;
    }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  };
  chatHistoryLoad?: () => Promise<ChatHistoryItem[]>;
  chatHistorySave?: (items: ChatHistoryItem[]) => Promise<void>;
  imageGenerate?: (payload: ImageGeneratePayload) => Promise<ApiResult>;
  openExternalUrl?: (url: string) => Promise<ApiResult>;
  downloadImage?: (payload: { url: string; suggestedName?: string }) => Promise<ApiResult & { path?: string }>;
  onImageResult?: (callback: (payload: ImageResultPayload) => void) => (() => void);
  musicGenerate?: (payload: MusicGeneratePayload) => Promise<MusicGenerateResult>;
  musicHistoryLoad?: () => Promise<ApiResult & { clips: MusicClip[] }>;
  musicHistoryDelete?: (id: string) => Promise<ApiResult>;
  lyricsGenerate?: (payload: { prompt?: string; title?: string }) => Promise<LyricsGenerateResult>;

  getAgentPermissions?: () => Promise<ApiResult<PermissionConfig>>;
  saveAgentPermissions?: (permissions: Partial<PermissionConfig>) => Promise<ApiResult<PermissionConfig>>;
  getPersonaSettings?: () => Promise<ApiResult<PersonaSettings>>;
  savePersonaSettings?: (payload: Partial<PersonaSettings>) => Promise<ApiResult>;
  ttsSpeak?: (payload: { text: string; providerPreference?: 'auto' | 'browser' | 'dashscope' | 'minimax' }) => Promise<TtsSpeakResult>;

  mcpGetStatus?: () => Promise<Record<string, McpServerInfo>>;
  mcpAddServer?: (name: string, cfg: McpServerConfig) => Promise<ApiResult>;
  mcpRemoveServer?: (name: string) => Promise<ApiResult>;

  getNocturneStatus?: () => Promise<NocturneStatusResult>;
  setupNocturneMemory?: () => Promise<ApiResult>;
  seedNocturneMemories?: () => Promise<ApiResult & { output?: string }>;
  startNocturneDashboard?: () => Promise<ApiResult>;
  stopNocturneDashboard?: () => Promise<ApiResult>;
  getNocturneDashboardStatus?: () => Promise<NocturneDashboardStatus>;
  openNocturneManagement?: () => Promise<ApiResult>;
  restartNocturneBackend?: () => Promise<ApiResult>;
  getAiLibraryPlugin?: () => Promise<ApiResult<AiLibraryPluginStatus>>;
  saveAiLibraryPlugin?: (payload: AiLibraryPluginSettings) => Promise<ApiResult>;
  getMemorySummarizerConfig?: () => Promise<ApiResult<MemorySummarizerConfig>>;
  saveMemorySummarizerConfig?: (payload: Partial<MemorySummarizerConfig>) => Promise<ApiResult>;
  getMemoryVectorRecallConfig?: () => Promise<ApiResult<MemoryVectorRecallConfig>>;
  saveMemoryVectorRecallConfig?: (payload: Partial<MemoryVectorRecallConfig>) => Promise<ApiResult>;
  nocturneRead?: (uri: string) => Promise<NocturneReadResult>;
  nocturneCreate?: (uri: string, content: string, priority?: number, disclosure?: string) => Promise<NocturneWriteResult>;

  invokeGatewayTool?: (toolName: string, args: UnknownRecord) => Promise<unknown>;
}
