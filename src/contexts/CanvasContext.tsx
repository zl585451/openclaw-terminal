import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

export type CanvasMode = 'markdown' | 'code' | 'html';
export type CanvasArtifactType = 'document' | 'diagram' | 'code' | 'ui-draft';
export type CanvasDocumentStatus = 'draft' | 'refining' | 'final';

export interface CanvasDocument {
  id: string;
  title: string;
  artifactType: CanvasArtifactType;
  mode: CanvasMode;
  content: string;
  language: string;
  origin: 'ai' | 'user';
  sourceMessageId?: string;
  explanation?: string;
  status: CanvasDocumentStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasCreateEventPayload {
  document: Partial<CanvasDocument> & {
    id?: string;
    content: string;
    mode?: CanvasMode;
    title?: string;
  };
}

export interface CanvasUpdateEventPayload {
  documentId: string;
  patch: Partial<CanvasDocument>;
}

export interface CanvasFocusEventPayload {
  documentId: string;
}

export type CanvasEvent =
  | { type: 'canvas'; action: 'create'; payload: CanvasCreateEventPayload }
  | { type: 'canvas'; action: 'update'; payload: CanvasUpdateEventPayload }
  | { type: 'canvas'; action: 'focus'; payload: CanvasFocusEventPayload }
  | { type: 'canvas'; action: 'delete'; payload: { documentId: string } }
  | { type: 'canvas'; action: 'explain'; payload: { documentId: string; explanation: string } };

export interface CanvasRoundtripContext {
  intent: 'continue' | 'explain' | 'rewrite';
  activeDocumentId: string | null;
  activeDocument: CanvasDocument | null;
  documents: Array<Pick<CanvasDocument, 'id' | 'title' | 'artifactType' | 'mode' | 'version' | 'status' | 'updatedAt'>>;
}

interface CanvasState {
  isOpen: boolean;
  documents: CanvasDocument[];
  activeDocumentId: string | null;
}

interface CanvasContextValue extends CanvasState {
  activeDocument: CanvasDocument | null;
  content: string;
  mode: CanvasMode;
  title: string;
  language: string;
  openPanel: () => void;
  openCanvas: (content: string, mode: CanvasMode, title?: string, language?: string) => void;
  closeCanvas: () => void;
  updateContent: (content: string) => void;
  setActiveDocument: (documentId: string) => void;
  deleteDocument: (documentId: string) => void;
  createDocument: (document: Partial<CanvasDocument> & { content: string; mode?: CanvasMode; title?: string }) => string;
  updateDocument: (documentId: string, patch: Partial<CanvasDocument>) => void;
  applyCanvasEvent: (event: CanvasEvent) => void;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

function createCanvasDocument(
  content: string,
  mode: CanvasMode,
  title = '',
  language = 'text',
  overrides: Partial<CanvasDocument> = {}
): CanvasDocument {
  const timestamp = Date.now();

  return {
    id: overrides.id || `canvas_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
    title: overrides.title || title || 'Untitled',
    artifactType: overrides.artifactType || (mode === 'code' ? 'code' : mode === 'html' ? 'ui-draft' : 'document'),
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

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CanvasState>({
    isOpen: false,
    documents: [],
    activeDocumentId: null,
  });

  const activeDocument = useMemo(
    () => state.documents.find((document) => document.id === state.activeDocumentId) ?? null,
    [state.activeDocumentId, state.documents]
  );

  const openCanvas = useCallback((content: string, mode: CanvasMode, title = '', language = 'text') => {
    setState((prev) => {
      const nextDocument = createCanvasDocument(content, mode, title, language);
      return {
        isOpen: true,
        documents: [...prev.documents, nextDocument],
        activeDocumentId: nextDocument.id,
      };
    });
  }, []);

  const openPanel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: true }));
  }, []);

  const createDocument = useCallback((document: Partial<CanvasDocument> & { content: string; mode?: CanvasMode; title?: string }) => {
    const nextDocument = createCanvasDocument(
      document.content,
      document.mode || 'markdown',
      document.title || '',
      document.language || 'text',
      document
    );

    setState((prev) => ({
      isOpen: true,
      documents: [...prev.documents, nextDocument],
      activeDocumentId: nextDocument.id,
    }));

    return nextDocument.id;
  }, []);

  const closeCanvas = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const updateContent = useCallback((content: string) => {
    setState((prev) => {
      if (!prev.activeDocumentId) return prev;

      return {
        ...prev,
        documents: prev.documents.map((document) =>
          document.id === prev.activeDocumentId
            ? {
                ...document,
                content,
                version: document.version + 1,
                updatedAt: Date.now(),
              }
            : document
        ),
      };
    });
  }, []);

  const setActiveDocument = useCallback((documentId: string) => {
    setState((prev) => {
      if (!prev.documents.some((document) => document.id === documentId)) {
        return prev;
      }

      return {
        ...prev,
        isOpen: true,
        activeDocumentId: documentId,
      };
    });
  }, []);

  const deleteDocument = useCallback((documentId: string) => {
    setState((prev) => {
      const nextDocuments = prev.documents.filter((document) => document.id !== documentId);
      const nextActiveId = prev.activeDocumentId === documentId
        ? nextDocuments[nextDocuments.length - 1]?.id ?? null
        : prev.activeDocumentId;

      return {
        ...prev,
        documents: nextDocuments,
        activeDocumentId: nextActiveId,
        isOpen: nextDocuments.length > 0 ? prev.isOpen : false,
      };
    });
  }, []);

  const updateDocument = useCallback((documentId: string, patch: Partial<CanvasDocument>) => {
    setState((prev) => ({
      ...prev,
      documents: prev.documents.map((document) =>
        document.id === documentId
          ? {
              ...document,
              ...patch,
              updatedAt: patch.updatedAt ?? Date.now(),
              version: patch.version ?? (patch.content !== undefined ? document.version + 1 : document.version),
            }
          : document
      ),
    }));
  }, []);

  const applyCanvasEvent = useCallback((event: CanvasEvent) => {
    if (event.type !== 'canvas') return;

    if (event.action === 'create') {
      createDocument(event.payload.document);
      return;
    }

    if (event.action === 'update') {
      updateDocument(event.payload.documentId, event.payload.patch);
      return;
    }

    if (event.action === 'focus') {
      setActiveDocument(event.payload.documentId);
      return;
    }

    if (event.action === 'delete') {
      deleteDocument(event.payload.documentId);
      return;
    }

    if (event.action === 'explain') {
      updateDocument(event.payload.documentId, { explanation: event.payload.explanation });
    }
  }, [createDocument, setActiveDocument, updateDocument]);

  const value = useMemo<CanvasContextValue>(() => ({
    ...state,
    activeDocument,
    content: activeDocument?.content ?? '',
    mode: activeDocument?.mode ?? 'markdown',
    title: activeDocument?.title ?? '',
    language: activeDocument?.language ?? 'text',
    openPanel,
    openCanvas,
    closeCanvas,
    updateContent,
    setActiveDocument,
    deleteDocument,
    createDocument,
    updateDocument,
    applyCanvasEvent,
  }), [activeDocument, applyCanvasEvent, closeCanvas, createDocument, deleteDocument, openCanvas, openPanel, setActiveDocument, state, updateContent, updateDocument]);

  return (
    <CanvasContext.Provider value={value}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvas() {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used within CanvasProvider');
  return ctx;
}
