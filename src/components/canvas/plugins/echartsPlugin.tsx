import EChartsRenderer from '../EChartsRenderer';
import type { CanvasRendererPlugin } from './types';

function looksLikeECharts(content: string): boolean {
  try {
    const s = content.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(s);
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.option && typeof parsed.option === 'object') return true;
    return ['series', 'xAxis', 'yAxis', 'radar', 'geo'].some((key) => key in parsed);
  } catch {
    return false;
  }
}

export const echartsPlugin: CanvasRendererPlugin = {
  id: 'echart',
  canRender: (document) =>
    document.artifactType === 'echart' ||
    (['diagram', 'document'].includes(document.artifactType) && looksLikeECharts(document.content)),
  render: (document) => <EChartsRenderer content={document.content} />,
  getExportFilename: (document) => `${document.title.replace(/\s+/g, '-').toLowerCase() || 'chart'}.json`,
};
