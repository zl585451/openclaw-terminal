import MermaidRendererLazy from '../../components/canvas/MermaidRendererLazy';
import { normalizeDiagramContent } from '../../utils/diagramSchema';
import type { WorkbenchRendererPlugin } from './types';

export const diagramPlugin: WorkbenchRendererPlugin = {
  id: 'diagram',
  canRender: (document) =>
    document.artifactType === 'diagram' ||
    String(document.language || '').toLowerCase() === 'mermaid' ||
    ((['code', 'reading', 'artifact', 'document', 'text'].includes(document.artifactType) || document.artifactType == null) &&
      /^\s*\{[\s\S]*"diagramType"\s*:/.test(String(document.content || ''))),
  render: (document) => (
    <div className="canvas-preview">
      <MermaidRendererLazy content={normalizeDiagramContent(document.content)} />
    </div>
  ),
  getExportFilename: () => 'canvas.mmd',
};
