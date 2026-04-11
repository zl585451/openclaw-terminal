import MermaidRenderer from '../MermaidRenderer';
import { normalizeDiagramContent } from '../../../utils/diagramSchema';
import type { CanvasRendererPlugin } from './types';

export const diagramPlugin: CanvasRendererPlugin = {
  id: 'diagram',
  canRender: (document) =>
    document.artifactType === 'diagram' ||
    String(document.language || '').toLowerCase() === 'mermaid' ||
    // Fallback: code/text artifact that actually contains diagram spec JSON
    ((['code', 'document', 'text'].includes(document.artifactType) || document.artifactType == null) &&
      /^\s*\{[\s\S]*"diagramType"\s*:/.test(String(document.content || ''))),
  render: (document) => (
    <div className="canvas-preview">
      <MermaidRenderer content={normalizeDiagramContent(document.content)} />
    </div>
  ),
  getExportFilename: () => 'canvas.mmd',
};
