import MermaidRenderer from '../MermaidRenderer';
import type { CanvasRendererPlugin } from './types';

export const diagramPlugin: CanvasRendererPlugin = {
  id: 'diagram',
  canRender: (document) =>
    document.artifactType === 'diagram' || String(document.language || '').toLowerCase() === 'mermaid',
  render: (document) => (
    <div className="canvas-preview">
      <MermaidRenderer content={document.content} />
    </div>
  ),
  getExportFilename: () => 'canvas.mmd',
};
