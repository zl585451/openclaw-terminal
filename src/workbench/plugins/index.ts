import type { WorkbenchDocument } from '../types';
import type { WorkbenchRendererPlugin } from './types';
import { artifactPlugin } from './artifactPlugin';
import { codePlugin } from './codePlugin';
import { diagramPlugin } from './diagramPlugin';
import { echartsPlugin } from './echartsPlugin';
import { htmlPlugin } from './htmlPlugin';
import { markdownPlugin } from './markdownPlugin';
import { reactFlowPlugin } from './reactFlowPlugin';
import { scriptPlugin } from './scriptPlugin';

export { artifactPlugin } from './artifactPlugin';
export { codePlugin } from './codePlugin';
export { diagramPlugin } from './diagramPlugin';
export { echartsPlugin } from './echartsPlugin';
export { htmlPlugin } from './htmlPlugin';
export { markdownPlugin } from './markdownPlugin';
export { reactFlowPlugin } from './reactFlowPlugin';
export { scriptPlugin } from './scriptPlugin';
export type { WorkbenchRendererPlugin } from './types';

export const WORKBENCH_PLUGINS: WorkbenchRendererPlugin[] = [
  scriptPlugin,   // 剧本插件优先（artifactType === 'script' 精确匹配，不会误触）
  artifactPlugin,
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
