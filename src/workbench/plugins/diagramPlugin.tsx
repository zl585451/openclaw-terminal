import MermaidRenderer from '../../components/canvas/MermaidRenderer';
import { normalizeDiagramContent } from '../../utils/diagramSchema';
import type { WorkbenchRendererPlugin } from './types';

export const diagramPlugin: WorkbenchRendererPlugin = {
  id: 'diagram',
  canRender: (document) =>
    document.artifactType === 'diagram' ||
    String(document.language || '').toLowerCase() === 'mermaid' ||
    ((['code', 'document', 'text'].includes(document.artifactType) || document.artifactType == null) &&
      /^\s*\{[\s\S]*"diagramType"\s*:/.test(String(document.content || ''))),
  render: (document) => (
    <div className="canvas-preview">
      <MermaidRenderer content={normalizeDiagramContent(document.content)} />
    </div>
  ),
  getExportFilename: () => 'canvas.mmd',
};
