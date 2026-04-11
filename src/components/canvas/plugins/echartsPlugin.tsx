import EChartsRenderer from '../EChartsRenderer';
import type { CanvasRendererPlugin } from './types';

/** Returns true if the JSON string looks like an ECharts payload */
function looksLikeECharts(content: string): boolean {
  try {
    const s = content.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(s);
    if (!parsed || typeof parsed !== 'object') return false;
    // Wrapped format: { option: { series, ... } }
    if (parsed.option && typeof parsed.option === 'object') return true;
    // Bare ECharts option
    const knownKeys = ['series', 'xAxis', 'yAxis', 'radar', 'geo'];
    return knownKeys.some((k) => k in parsed);
  } catch {
    return false;
  }
}

export const echartsPlugin: CanvasRendererPlugin = {
  id: 'echart',
  canRender: (document) =>
    document.artifactType === 'echart' ||
    // Fallback: diagram/document that actually contains ECharts JSON
    (['diagram', 'document'].includes(document.artifactType) && looksLikeECharts(document.content)),
  render: (document) => (
    <EChartsRenderer content={document.content} />
  ),
  getExportFilename: (document) =>
    `${document.title.replace(/\s+/g, '-').toLowerCase() || 'chart'}.json`,
};
