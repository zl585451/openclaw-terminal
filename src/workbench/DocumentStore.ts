import type {
  WorkbenchArtifactType,
  WorkbenchCommand,
  WorkbenchDocument,
  WorkbenchMode,
} from './types';

export interface WorkbenchDocumentState {
  documents: WorkbenchDocument[];
  activeDocumentId: string | null;
}

export const initialWorkbenchDocumentState: WorkbenchDocumentState = {
  documents: [],
  activeDocumentId: null,
};

export function createWorkbenchDocument(
  content: string,
  mode: WorkbenchMode,
  title = '',
  language = 'text',
  overrides: Partial<WorkbenchDocument> = {},
): WorkbenchDocument {
  const timestamp = Date.now();

  return {
    id: overrides.id || `canvas_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
    title: overrides.title || title || 'Untitled',
    artifactType: overrides.artifactType || inferArtifactType(mode),
    mode: overrides.mode || mode,
    content: overrides.content ?? content,
    language: overrides.language || language,
    origin: overrides.origin || 'user',
    sourceMessageId: overrides.sourceMessageId,
    explanation: overrides.explanation,
    status: overrides.status || 'draft',
    version: overrides.version ?? 1,
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
  };
}

export function inferArtifactType(mode: WorkbenchMode): WorkbenchArtifactType {
  if (mode === 'code') return 'code';
  if (mode === 'html') return 'ui-draft';
  return 'document';
}

export function workbenchDocumentReducer(
  state: WorkbenchDocumentState,
  command: WorkbenchCommand,
): WorkbenchDocumentState {
  switch (command.type) {
    case 'create': {
      const nextDocument = createWorkbenchDocument(
        command.payload.document.content,
        command.payload.document.mode || 'markdown',
        command.payload.document.title || '',
        command.payload.document.language || 'text',
        command.payload.document,
      );
      return {
        documents: [...state.documents, nextDocument],
        activeDocumentId: nextDocument.id,
      };
    }
    case 'update': {
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === command.payload.documentId
            ? {
                ...document,
                ...command.payload.patch,
                updatedAt: command.payload.patch.updatedAt ?? Date.now(),
                version: command.payload.patch.version
                  ?? (command.payload.patch.content !== undefined ? document.version + 1 : document.version),
              }
            : document,
        ),
      };
    }
    case 'focus': {
      if (!state.documents.some((document) => document.id === command.payload.documentId)) {
        return state;
      }
      return {
        ...state,
        activeDocumentId: command.payload.documentId,
      };
    }
    case 'delete': {
      const nextDocuments = state.documents.filter((document) => document.id !== command.payload.documentId);
      const nextActiveId = state.activeDocumentId === command.payload.documentId
        ? nextDocuments[nextDocuments.length - 1]?.id ?? null
        : state.activeDocumentId;
      return {
        documents: nextDocuments,
        activeDocumentId: nextActiveId,
      };
    }
    case 'explain': {
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === command.payload.documentId
            ? {
                ...document,
                explanation: command.payload.explanation,
                updatedAt: Date.now(),
              }
            : document,
        ),
      };
    }
    default:
      return state;
  }
}
