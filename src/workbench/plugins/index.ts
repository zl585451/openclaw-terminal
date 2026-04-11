import type { WorkbenchDocument } from '../types';
import type { WorkbenchRendererPlugin } from './types';
import { codePlugin } from './codePlugin';
import { diagramPlugin } from './diagramPlugin';
import { echartsPlugin } from './echartsPlugin';
import { htmlPlugin } from './htmlPlugin';
import { markdownPlugin } from './markdownPlugin';
import { reactFlowPlugin } from './reactFlowPlugin';

export { codePlugin } from './codePlugin';
export { diagramPlugin } from './diagramPlugin';
export { echartsPlugin } from './echartsPlugin';
export { htmlPlugin } from './htmlPlugin';
export { markdownPlugin } from './markdownPlugin';
export { reactFlowPlugin } from './reactFlowPlugin';
export type { WorkbenchRendererPlugin } from './types';

export const WORKBENCH_PLUGINS: WorkbenchRendererPlugin[] = [
  echartsPlugin,
  reactFlowPlugin,
  diagramPlugin,
  markdownPlugin,
  codePlugin,
  htmlPlugin,
];

export function resolveWorkbenchPlugin(document: WorkbenchDocument): WorkbenchRendererPlugin | null {
  return WORKBENCH_PLUGINS.find((plugin) => plugin.canRender(document)) || null;
}
