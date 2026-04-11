import ReactFlowRenderer from '../ReactFlowRenderer';
import type { CanvasRendererPlugin } from './types';

export const reactFlowPlugin: CanvasRendererPlugin = {
  id: 'react-flow',
  canRender: (document) =>
    document.artifactType === 'react-flow' ||
    // Also handle if AI accidentally sends content that looks like RF JSON.
    // Must NOT match diagram-spec JSON (which also has nodes:[]) — check for absence of diagramType.
    (document.artifactType === 'diagram' &&
      (() => {
        try {
          const parsed = JSON.parse(document.content.trim()
            .replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, ''));
          return Array.isArray(parsed?.nodes) && !parsed?.diagramType;
        } catch { return false; }
      })()),
  render: (document) => (
    <ReactFlowRenderer content={document.content} />
  ),
  getExportFilename: (document) =>
    `${document.title.replace(/\s+/g, '-').toLowerCase() || 'graph'}.json`,
};
