/**
 * scriptPlugin.tsx
 * 剧本渲染插件 —— 角色台词染色 + 章节导航 + 按章节分页（不一次渲染全文）
 */

import { exportScriptToText } from '../../utils/scriptExporter';
import { parseScript } from '../../utils/scriptParser';
import type { WorkbenchRendererPlugin } from './types';
import type { WorkbenchDocument } from '../types';
import ScriptViewerLazy from './script/ScriptViewerLazy';

export const scriptPlugin: WorkbenchRendererPlugin = {
  id: 'script',
  canRender: (doc: WorkbenchDocument) => doc.artifactType === 'script',
  render: (doc: WorkbenchDocument) => <ScriptViewerLazy document={doc} />,
  getExportContent: (doc: WorkbenchDocument) => exportScriptToText(parseScript(doc.content)),
  getExportFilename: (doc: WorkbenchDocument) =>
    `${doc.title || '剧本'}.txt`,
};
