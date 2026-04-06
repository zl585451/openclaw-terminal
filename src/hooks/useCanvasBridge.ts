import { useCallback, useMemo } from 'react';
import { useCanvas, type CanvasEvent, type CanvasRoundtripContext } from '../contexts/CanvasContext';

export function useCanvasBridge() {
  const canvas = useCanvas();

  const handleCanvasEvent = useCallback((event: CanvasEvent) => {
    canvas.applyCanvasEvent(event);
  }, [canvas]);

  const getRoundtripContext = useCallback(
    (intent: CanvasRoundtripContext['intent'] = 'continue'): CanvasRoundtripContext => ({
      intent,
      activeDocumentId: canvas.activeDocumentId,
      activeDocument: canvas.activeDocument,
      documents: canvas.documents.map((document) => ({
        id: document.id,
        title: document.title,
        artifactType: document.artifactType,
        mode: document.mode,
        version: document.version,
        status: document.status,
        updatedAt: document.updatedAt,
      })),
    }),
    [canvas.activeDocument, canvas.activeDocumentId, canvas.documents]
  );

  return useMemo(() => ({
    isOpen: canvas.isOpen,
    openPanel: canvas.openPanel,
    closePanel: canvas.closeCanvas,
    openCanvas: canvas.openCanvas,
    handleCanvasEvent,
    getRoundtripContext,
  }), [
    canvas.closeCanvas,
    canvas.isOpen,
    canvas.openCanvas,
    canvas.openPanel,
    getRoundtripContext,
    handleCanvasEvent,
  ]);
}
