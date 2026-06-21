export type WorkbenchMode = 'markdown' | 'code' | 'html';
export type WorkbenchArtifactType =
  | 'reading'
  | 'artifact'
  /** @deprecated Legacy persisted/gateway alias. Normalize to reading at boundaries. */
  | 'document'
  | 'diagram'
  | 'code'
  | 'ui-draft'
  | 'react-flow'
  | 'echart'
  | 'script';  // 剧本/有声书格式
export type WorkbenchDocumentStatus = 'draft' | 'refining' | 'final';

export interface ScriptCharacterProfile {
  name: string;
  color: string;
}

export interface ScriptLineAttribution {
  lineIndex: number;
  speaker: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface ScriptStructuredLineMarker {
  lineIndex: number;
  label?: string;
}

export interface ScriptVoiceFragmentMarker {
  lineIndex: number;
  speaker?: string;
  mentionedNames?: string[];
}

export interface WorkbenchDocument {
  id: string;
  title: string;
  artifactType: WorkbenchArtifactType;
  mode: WorkbenchMode;
  content: string;
  language: string;
  origin: 'ai' | 'user';
  projectBookId?: string;
  projectChapterIndex?: number;
  sourcePath?: string;
  draftCachePath?: string;
  sourceMessageId?: string;
  explanation?: string;
  scriptCharacterLibrary?: ScriptCharacterProfile[];
  scriptChapterAttributions?: Record<string, ScriptLineAttribution[]>;
  scriptChapterStructuredLines?: Record<string, ScriptStructuredLineMarker[]>;
  scriptChapterVoiceFragments?: Record<string, ScriptVoiceFragmentMarker[]>;
  status: WorkbenchDocumentStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkbenchCreateEventPayload {
  document: Partial<WorkbenchDocument> & {
    id?: string;
    content: string;
    mode?: WorkbenchMode;
    title?: string;
  };
}

export interface WorkbenchUpdateEventPayload {
  documentId: string;
  patch: Partial<WorkbenchDocument>;
}

export interface WorkbenchFocusEventPayload {
  documentId: string;
}

export type WorkbenchEvent =
  | { type: 'workbench'; action: 'create'; payload: WorkbenchCreateEventPayload }
  | { type: 'workbench'; action: 'update'; payload: WorkbenchUpdateEventPayload }
  | { type: 'workbench'; action: 'focus'; payload: WorkbenchFocusEventPayload }
  | { type: 'workbench'; action: 'delete'; payload: { documentId: string } }
  | { type: 'workbench'; action: 'explain'; payload: { documentId: string; explanation: string } };

export type WorkbenchCommand =
  | { type: 'create'; payload: WorkbenchCreateEventPayload }
  | { type: 'update'; payload: WorkbenchUpdateEventPayload }
  | { type: 'focus'; payload: WorkbenchFocusEventPayload }
  | { type: 'delete'; payload: { documentId: string } }
  | { type: 'explain'; payload: { documentId: string; explanation: string } }
  | { type: 'open-panel' }
  | { type: 'close-panel' };

export interface WorkbenchRoundtripContext {
  intent: 'continue' | 'explain' | 'rewrite';
  activeDocumentId: string | null;
  activeDocument: WorkbenchDocument | null;
  documents: Array<Pick<WorkbenchDocument, 'id' | 'title' | 'artifactType' | 'mode' | 'version' | 'status' | 'updatedAt'>>;
}

export type CanvasMode = WorkbenchMode;
export type CanvasArtifactType = WorkbenchArtifactType;
export type CanvasDocumentStatus = WorkbenchDocumentStatus;
export type CanvasDocument = WorkbenchDocument;
export type CanvasCreateEventPayload = WorkbenchCreateEventPayload;
export type CanvasUpdateEventPayload = WorkbenchUpdateEventPayload;
export type CanvasFocusEventPayload = WorkbenchFocusEventPayload;
export type CanvasEvent =
  | { type: 'canvas'; action: 'create'; payload: CanvasCreateEventPayload }
  | { type: 'canvas'; action: 'update'; payload: CanvasUpdateEventPayload }
  | { type: 'canvas'; action: 'focus'; payload: CanvasFocusEventPayload }
  | { type: 'canvas'; action: 'delete'; payload: { documentId: string } }
  | { type: 'canvas'; action: 'explain'; payload: { documentId: string; explanation: string } };
export type CanvasRoundtripContext = WorkbenchRoundtripContext;

export function normalizeWorkbenchArtifactType(value: unknown, mode: WorkbenchMode = 'markdown'): WorkbenchArtifactType {
  if (value === 'document') return 'reading';
  if (
    value === 'reading'
    || value === 'artifact'
    || value === 'diagram'
    || value === 'code'
    || value === 'ui-draft'
    || value === 'react-flow'
    || value === 'echart'
    || value === 'script'
  ) {
    return value;
  }
  if (mode === 'code') return 'code';
  if (mode === 'html') return 'ui-draft';
  return 'reading';
}

export function isReadingWorkbenchArtifact(documentOrType: WorkbenchDocument | WorkbenchArtifactType | null | undefined): boolean {
  const type = typeof documentOrType === 'string' ? documentOrType : documentOrType?.artifactType;
  return type === 'reading' || type === 'document';
}

export function isEditableWorkbenchArtifact(documentOrType: WorkbenchDocument | WorkbenchArtifactType | null | undefined): boolean {
  const type = typeof documentOrType === 'string' ? documentOrType : documentOrType?.artifactType;
  return !!type && !isReadingWorkbenchArtifact(type);
}

export function toWorkbenchCommand(event: CanvasEvent | WorkbenchEvent): WorkbenchCommand {
  return { type: event.action, payload: event.payload } as WorkbenchCommand;
}
