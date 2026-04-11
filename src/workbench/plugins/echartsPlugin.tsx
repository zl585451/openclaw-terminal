import EChartsRenderer from '../../components/canvas/EChartsRenderer';
import { looksLikeEChartsPayload } from '../../utils/echartsPayload';
import type { WorkbenchRendererPlugin } from './types';

export const echartsPlugin: WorkbenchRendererPlugin = {
  id: 'echart',
  canRender: (document) =>
    document.artifactType === 'echart' || looksLikeEChartsPayload(document.content),
  render: (document) => (
    <EChartsRenderer content={document.content} />
  ),
  getExportFilename: (document) =>
    `${document.title.replace(/\s+/g, '-').toLowerCase() || 'chart'}.json`,
};
