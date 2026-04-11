import { useCallback, useMemo } from 'react';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { workbenchBus } from '../workbench/WorkbenchBus';
import { toWorkbenchCommand, type CanvasEvent, type CanvasRoundtripContext, type WorkbenchEvent } from '../workbench/types';

export function useWorkbenchBridge() {
  const workbench = useWorkbench();

  const handleCanvasEvent = useCallback((event: CanvasEvent | WorkbenchEvent) => {
    workbenchBus.dispatch(toWorkbenchCommand(event));
  }, []);

  const getRoundtripContext = useCallback(
    (intent: CanvasRoundtripContext['intent'] = 'continue'): CanvasRoundtripContext => ({
      intent,
      activeDocumentId: workbench.activeDocumentId,
      activeDocument: workbench.activeDocument,
      documents: workbench.documents.map((document) => ({
        id: document.id,
        title: document.title,
        artifactType: document.artifactType,
        mode: document.mode,
        version: document.version,
        status: document.status,
        updatedAt: document.updatedAt,
      })),
    }),
    [workbench.activeDocument, workbench.activeDocumentId, workbench.documents],
  );

  const openPanel = useCallback(() => {
    workbenchBus.dispatch({ type: 'open-panel' });
  }, []);

  const closePanel = useCallback(() => {
    workbenchBus.dispatch({ type: 'close-panel' });
  }, []);

  return useMemo(() => ({
    isOpen: workbench.isOpen,
    openPanel,
    closePanel,
    openCanvas: workbench.openCanvas,
    handleCanvasEvent,
    getRoundtripContext,
  }), [
    closePanel,
    getRoundtripContext,
    handleCanvasEvent,
    openPanel,
    workbench.isOpen,
    workbench.openCanvas,
  ]);
}
