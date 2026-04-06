import type { ReactNode } from 'react';
import type { CanvasDocument } from '../../../contexts/CanvasContext';

export interface CanvasRendererPlugin {
  id: string;
  canRender: (document: CanvasDocument) => boolean;
  render: (document: CanvasDocument) => ReactNode;
  getExportFilename?: (document: CanvasDocument) => string;
}
