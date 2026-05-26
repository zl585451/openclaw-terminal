import type { BrowserWindow } from 'electron';

export interface WebSocketLike {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
}

export interface OpenClawStatus {
  connected: boolean;
  sessionKey?: string;
  model?: string;
  capabilities?: unknown;
}

export interface IpcDeps {
  mainWindow: BrowserWindow | null;
  floatWindow: BrowserWindow | null;
  codeWindow: BrowserWindow | null;
  terminalWindow: BrowserWindow | null;
  openclawWs: WebSocketLike | null;
  getMainWindow: () => BrowserWindow | null;
  getOpenclawWs: () => WebSocketLike | null;
  setOpenclawWs: (ws: WebSocketLike | null) => void;
  getFloatWindow: () => BrowserWindow | null;
  setFloatWindow: (window: BrowserWindow | null) => void;
  getCodeWindow: () => BrowserWindow | null;
  setCodeWindow: (window: BrowserWindow | null) => void;
  getTerminalWindow: () => BrowserWindow | null;
  setTerminalWindow: (window: BrowserWindow | null) => void;
  getTerminalPty: () => unknown;
  setTerminalPty: (pty: any) => void;
  createFloatWindow: () => void;
  createTerminalWindow: () => void;
  getPendingCodeWindowData: () => { language: string; code: string } | null;
  setPendingCodeWindowData: (data: { language: string; code: string } | null) => void;
  connectOpenClaw: () => void;
  sendChatMessage: (
    content: string,
    imageDataUrl?: string | null,
    files?: UploadedFile[],
    pacingMs?: number,
    workbenchContext?: unknown,
    requestId?: string,
    projectContext?: unknown
  ) => { success: boolean; error?: string };
  getOpenClawStatus: () => OpenClawStatus;
  getAiLibraryPlugin: () => Promise<unknown>;
  saveAiLibraryPlugin: (payload: AiLibraryPluginPayload) => Promise<unknown>;
}

export interface UploadedFile {
  path?: string;
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  isText?: boolean;
  content?: string | null;
  base64?: string;
}

export interface AiLibraryPluginPayload {
  OCT_AI_LIBRARY_AUTO_START?: boolean;
  OCT_AI_LIBRARY_PATH?: string;
  OCT_AI_LIBRARY_PORT?: number;
}

export interface OpenImageDialogResult {
  success: boolean;
  base64?: string;
  mime?: string;
  error?: string;
}

export interface OpenFileDialogOptions {
  allowMultiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
}

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  isText: boolean;
  content: string | null;
  base64: string;
}

export interface OpenFileDialogResult {
  success: boolean;
  files?: FileInfo[];
  error?: string;
}

export interface GatewayStatus {
  running: boolean;
  pid?: number;
  port?: number;
  version?: string;
}

export interface OmnirouteStatus {
  enabled: boolean;
  running: boolean;
  port?: number;
}

export interface MemorySummarizerConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
}

export interface MemoryVectorRecallConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
}

export interface McpStatus {
  mcpServers: string[];
  connectedServers: number;
}

export interface PersonaSettings {
  name: string;
  style: string;
  userName: string;
}

export interface ApiKeyPayload {
  DASHSCOPE_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API_BASE?: string;
  OPENAI_API_MODEL?: string;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  latency?: number;
  model?: string;
}

export interface ChatHistoryItem {
  role: string;
  content: string;
  timestamp: string;
  isSystemReply?: boolean;
}

export interface ScriptAdapterBatchStartPayload {
  config: unknown;
  items: unknown[];
}

export interface ScriptAdapterIntakeStartPayload {
  content: string;
  title?: string;
}

export interface ScriptAdapterAnalysisStartPayload {
  content: string;
}

export interface ScriptAdapterProductionHandoffPayload {
  outline: unknown;
}

export interface ScriptAdapterBatchStatusPayload {
  batchId: string;
}

export interface ScriptAdapterBatchListPayload {
  limit?: number;
  offset?: number;
}

export interface ScriptAdapterBatchCancelPayload {
  batchId: string;
}

export interface ScriptAdapterBatchSubscribePayload {
  batchId: string;
}

export interface ScriptAdapterBatchApproveGatePayload {
  batchId: string;
  gateId: string;
  reviewerNote?: string;
}

export interface ScriptAdapterBatchRejectGatePayload {
  batchId: string;
  gateId: string;
  reviewerNote?: string;
}

export interface ScriptAdapterBatchRerunPayload {
  batchId: string;
  chapterIndex: number;
}

export interface ScriptAdapterBatchDeletePayload {
  batchId: string;
}

export interface LibraryListPayload {
  limit?: number;
  offset?: number;
}

export interface LibraryGetPayload {
  bookId: string;
}

export interface LibraryChaptersPayload {
  bookId: string;
}

export interface LibraryChapterPayload {
  bookId: string;
  chapterIndex: number;
}

export interface LibraryUploadPayload {
  filePath: string;
  title?: string;
  author?: string;
}

export interface LibraryDeletePayload {
  bookId: string;
}

export interface DeliveryExportMarkdownPayload {
  filename: string;
  content: string;
}

export interface DeliveryExportDocxPayload {
  filename: string;
  content: string;
}

export interface ImageGeneratePayload {
  prompt: string;
  model?: string;
  size?: string;
  style?: string;
  quality?: string;
}

export interface DownloadImagePayload {
  url: string;
  suggestedName?: string;
}

export interface TtsSpeakPayload {
  text: string;
  providerPreference?: 'auto' | 'browser' | 'dashscope' | 'minimax';
}

export interface MusicHistoryLoadResult {
  success: boolean;
  items?: unknown[];
}

export interface MusicHistoryDeletePayload {
  id: string;
}

export interface MusicGeneratePayload {
  prompt: string;
  duration?: number;
  model?: string;
}

export interface LyricsGeneratePayload {
  prompt: string;
  songTitle?: string;
}

export interface TaskItem {
  id: string;
  content: string;
  completed: boolean;
  priority: number;
  createdAt: string;
  completedAt?: string;
  source?: string;
}

export interface TasksWritePayload {
  tasks: TaskItem[];
  parking: unknown[];
  intention?: string;
}

export interface TasksAddPayload {
  content: string;
  priority: number;
  source: string;
}

export interface TasksUpdatePayload {
  taskId: string;
  updates: Partial<TaskItem>;
}

export interface TasksDeletePayload {
  taskId: string;
}

export interface TasksParkingAddPayload {
  content: string;
}

export interface TasksParkingRemovePayload {
  itemId: string;
}

export interface ScreenshotShortcut {
  accelerator: string;
}
