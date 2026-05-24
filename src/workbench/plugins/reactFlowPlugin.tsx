import ReactFlowRenderer from '../../components/canvas/ReactFlowRendererLazy';
import type { WorkbenchRendererPlugin } from './types';

export const reactFlowPlugin: WorkbenchRendererPlugin = {
  id: 'react-flow',
  canRender: (document) =>
    document.artifactType === 'react-flow' ||
    (document.artifactType === 'diagram' &&
      (() => {
        try {
          const parsed = JSON.parse(document.content.trim()
            .replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, ''));
          return Array.isArray(parsed?.nodes) && !parsed?.diagramType;
        } catch {
          return false;
        }
      })()),
  render: (document) => (
    <ReactFlowRenderer content={document.content} />
  ),
  getExportFilename: (document) =>
    `${document.title.replace(/\s+/g, '-').toLowerCase() || 'graph'}.json`,
};
