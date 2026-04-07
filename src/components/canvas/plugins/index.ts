import type { CanvasDocument } from '../../../contexts/CanvasContext';
import type { CanvasRendererPlugin } from './types';
import { codePlugin } from './codePlugin';
import { diagramPlugin } from './diagramPlugin';
import { htmlPlugin } from './htmlPlugin';
import { markdownPlugin } from './markdownPlugin';
import { reactFlowPlugin } from './reactFlowPlugin';

const PLUGINS: CanvasRendererPlugin[] = [
  reactFlowPlugin, // must be before diagramPlugin (also catches JSON inside diagram type)
  diagramPlugin,
  markdownPlugin,
  codePlugin,
  htmlPlugin,
];

export function resolveCanvasPlugin(document: CanvasDocument): CanvasRendererPlugin | null {
  return PLUGINS.find((plugin) => plugin.canRender(document)) || null;
}
