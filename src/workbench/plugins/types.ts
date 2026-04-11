import type { ReactNode } from 'react';
import type { WorkbenchDocument } from '../types';

export interface WorkbenchRendererPlugin {
  id: string;
  canRender: (document: WorkbenchDocument) => boolean;
  render: (document: WorkbenchDocument) => ReactNode;
  getExportFilename?: (document: WorkbenchDocument) => string;
}
