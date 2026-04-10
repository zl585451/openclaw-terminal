import type { CanvasDocument } from '../../../contexts/CanvasContext';
import type { CanvasRendererPlugin } from './types';
import { codePlugin } from './codePlugin';
import { diagramPlugin } from './diagramPlugin';
import { echartsPlugin } from './echartsPlugin';
import { htmlPlugin } from './htmlPlugin';
import { markdownPlugin } from './markdownPlugin';

const PLUGINS: CanvasRendererPlugin[] = [
  echartsPlugin,
  diagramPlugin,
  markdownPlugin,
  codePlugin,
  htmlPlugin,
];

export function resolveCanvasPlugin(document: CanvasDocument): CanvasRendererPlugin | null {
  return PLUGINS.find((plugin) => plugin.canRender(document)) || null;
}
