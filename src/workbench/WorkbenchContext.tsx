import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  createWorkbenchDocument,
  initialWorkbenchDocumentState,
  workbenchDocumentReducer,
} from './DocumentStore';
import { workbenchBus } from './WorkbenchBus';
import type {
  WorkbenchArtifactType,
  WorkbenchCommand,
  WorkbenchDocument,
  WorkbenchEvent,
  WorkbenchMode,
  WorkbenchRoundtripContext,
} from './types';
import { toWorkbenchCommand } from './types';

interface WorkbenchState {
  isOpen: boolean;
}

interface WorkbenchContextValue extends WorkbenchState {
  documents: WorkbenchDocument[];
  activeDocumentId: string | null;
  activeDocument: WorkbenchDocument | null;
  content: string;
  mode: WorkbenchMode;
  title: string;
  language: string;
  onNodeInspect: ((nodeLabel: string, nodeGroup?: string) => void) | null;
  setNodeInspectHandler: (fn: ((nodeLabel: string, nodeGroup?: string) => void) | null) => void;
  openPanel: () => void;
  openCanvas: (
    content: string,
    mode: WorkbenchMode,
    title?: string,
    language?: string,
    artifactType?: WorkbenchArtifactType,
  ) => void;
  closeCanvas: () => void;
  updateContent: (content: string) => void;
  setActiveDocument: (documentId: string) => void;
  deleteDocument: (documentId: string) => void;
  createDocument: (document: Partial<WorkbenchDocument> & { content: string; mode?: WorkbenchMode; title?: string }) => string;
  updateDocument: (documentId: string, patch: Partial<WorkbenchDocument>) => void;
  applyWorkbenchEvent: (event: WorkbenchEvent) => void;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children }: { children: React.ReactNode }) {
  const [uiState, setUiState] = useState<WorkbenchState>({ isOpen: false });
  const [documentState, dispatchDocument] = useReducer(workbenchDocumentReducer, initialWorkbenchDocumentState);

  const nodeInspectRef = useRef<((nodeLabel: string, nodeGroup?: string) => void) | null>(null);
  const [nodeInspectVersion, setNodeInspectVersion] = useState(0);

  const setNodeInspectHandler = useCallback((fn: ((nodeLabel: string, nodeGroup?: string) => void) | null) => {
    nodeInspectRef.current = fn;
    setNodeInspectVersion((v) => v + 1);
  }, []);

  const activeDocument = useMemo(
    () => documentState.documents.find((document) => document.id === documentState.activeDocumentId) ?? null,
    [documentState.activeDocumentId, documentState.documents],
  );

  const syncOpenStateAfterDelete = useCallback((documentId: string) => {
    setUiState((prev) => {
      const remainingCount = documentState.documents.filter((document) => document.id !== documentId).length;
      return { ...prev, isOpen: remainingCount > 0 ? prev.isOpen : false };
    });
  }, [documentState.documents]);

  const createDocument = useCallback((document: Partial<WorkbenchDocument> & { content: string; mode?: WorkbenchMode; title?: string }) => {
    const nextDocument = createWorkbenchDocument(
      document.content,
      document.mode || 'markdown',
      document.title || '',
      document.language || 'text',
      document,
    );
    dispatchDocument({ type: 'create', payload: { document: nextDocument } });
    setUiState((prev) => ({ ...prev, isOpen: true }));
    return nextDocument.id;
  }, []);

  const updateDocument = useCallback((documentId: string, patch: Partial<WorkbenchDocument>) => {
    dispatchDocument({ type: 'update', payload: { documentId, patch } });
  }, []);

  const setActiveDocument = useCallback((documentId: string) => {
    dispatchDocument({ type: 'focus', payload: { documentId } });
    setUiState((prev) => ({ ...prev, isOpen: true }));
  }, []);

  const deleteDocument = useCallback((documentId: string) => {
    dispatchDocument({ type: 'delete', payload: { documentId } });
    syncOpenStateAfterDelete(documentId);
  }, [syncOpenStateAfterDelete]);

  const openPanel = useCallback(() => {
    setUiState((prev) => ({ ...prev, isOpen: true }));
  }, []);

  const closeCanvas = useCallback(() => {
    setUiState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openCanvas = useCallback((
    content: string,
    mode: WorkbenchMode,
    title = '',
    language = 'text',
    artifactType?: WorkbenchArtifactType,
  ) => {
    const nextDocument = createWorkbenchDocument(content, mode, title, language, {
      artifactType,
    });
    dispatchDocument({ type: 'create', payload: { document: nextDocument } });
    setUiState((prev) => ({ ...prev, isOpen: true }));
  }, []);

  const updateContent = useCallback((content: string) => {
    if (!documentState.activeDocumentId) return;
    dispatchDocument({
      type: 'update',
      payload: {
        documentId: documentState.activeDocumentId,
        patch: { content },
      },
    });
  }, [documentState.activeDocumentId]);

  const applyCommand = useCallback((command: WorkbenchCommand) => {
    if (command.type === 'open-panel') {
      setUiState((prev) => ({ ...prev, isOpen: true }));
      return;
    }
    if (command.type === 'close-panel') {
      setUiState((prev) => ({ ...prev, isOpen: false }));
      return;
    }

    dispatchDocument(command);

    if (command.type === 'create' || command.type === 'focus' || command.type === 'update' || command.type === 'explain') {
      setUiState((prev) => ({ ...prev, isOpen: true }));
      return;
    }
    if (command.type === 'delete') {
      syncOpenStateAfterDelete(command.payload.documentId);
    }
  }, [syncOpenStateAfterDelete]);

  const applyWorkbenchEvent = useCallback((event: WorkbenchEvent) => {
    applyCommand(toWorkbenchCommand(event));
  }, [applyCommand]);

  useEffect(() => workbenchBus.subscribe(applyCommand), [applyCommand]);

  const getRoundtripContext = useCallback((intent: WorkbenchRoundtripContext['intent'] = 'continue'): WorkbenchRoundtripContext => ({
    intent,
    activeDocumentId: documentState.activeDocumentId,
    activeDocument,
    documents: documentState.documents.map((document) => ({
      id: document.id,
      title: document.title,
      artifactType: document.artifactType,
      mode: document.mode,
      version: document.version,
      status: document.status,
      updatedAt: document.updatedAt,
    })),
  }), [activeDocument, documentState.activeDocumentId, documentState.documents]);

  useEffect(() => {
    workbenchBus.setContextGetter(getRoundtripContext);
  }, [getRoundtripContext]);

  const value = useMemo<WorkbenchContextValue>(() => ({
    ...uiState,
    documents: documentState.documents,
    activeDocumentId: documentState.activeDocumentId,
    activeDocument,
    content: activeDocument?.content ?? '',
    mode: activeDocument?.mode ?? 'markdown',
    title: activeDocument?.title ?? '',
    language: activeDocument?.language ?? 'text',
    onNodeInspect: nodeInspectRef.current,
    setNodeInspectHandler,
    openPanel,
    openCanvas,
    closeCanvas,
    updateContent,
    setActiveDocument,
    deleteDocument,
    createDocument,
    updateDocument,
    applyWorkbenchEvent,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    activeDocument,
    applyWorkbenchEvent,
    createDocument,
    deleteDocument,
    documentState,
    nodeInspectVersion,
    openCanvas,
    openPanel,
    setActiveDocument,
    setNodeInspectHandler,
    uiState,
    updateContent,
    updateDocument,
  ]);

  return (
    <WorkbenchContext.Provider value={value}>
      {children}
    </WorkbenchContext.Provider>
  );
}

export function useWorkbench() {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error('useWorkbench must be used within WorkbenchProvider');
  return ctx;
}
