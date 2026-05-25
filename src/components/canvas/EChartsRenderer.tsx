/**
 * EChartsRenderer — Canvas 数据图表渲染器
 *
 * 接受 AI 生成的 ECharts option JSON，在 Canvas 内渲染交互式图表。
 *
 * JSON 格式（推荐）：
 * {
 *   "title": "图表标题（工具栏用）",
 *   "option": { ...标准 ECharts option... }
 * }
 * 也兼容裸 ECharts option（直接含 series / xAxis 等顶层字段）。
 */
import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsType } from 'echarts';
import { parseEChartsPayload } from '../../utils/echartsPayload';
import './EChartsRenderer.css';

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Sanitize option — fix AI mistakes that cause ECharts internal TypeError ──
//
// ECharts calls `'x' in option` (compatLayoutProperties) on every component
// spec. If a field that must be an object is a string/number, it throws:
//   "Cannot use 'in' operator to search for 'x' in <value>"
//
// We coerce known fields to objects, recursively sanitize series items, etc.

function ensureObj(val: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>;
  // String shorthand — e.g. legend:"right" → { right: val }
  if (typeof val === 'string') {
    const pos = ['top', 'bottom', 'left', 'right', 'center', 'middle'];
    if (pos.includes(val)) return { [val]: 'center' === val || 'middle' === val ? '50%' : '5%' };
    // "item" / "axis" → tooltip trigger shorthand
    if (val === 'item' || val === 'axis' || val === 'none') return { trigger: val };
  }
  return fallback;
}

function sanitizeSeries(series: unknown): unknown {
  if (!series) return series;
  const sanitizeOne = (s: unknown): unknown => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
    const obj = s as Record<string, unknown>;
    // Common fields that must be objects
    const objFields = ['itemStyle', 'lineStyle', 'areaStyle', 'label', 'emphasis',
                       'markPoint', 'markLine', 'markArea', 'tooltip'];
    const cleaned: Record<string, unknown> = { ...obj };
    for (const f of objFields) {
      if (f in cleaned && cleaned[f] !== null && typeof cleaned[f] !== 'object') {
        cleaned[f] = {};
      }
    }
    return cleaned;
  };
  return Array.isArray(series) ? series.map(sanitizeOne) : sanitizeOne(series);
}

function sanitizeOption(raw: Record<string, unknown>): Record<string, unknown> {
  const opt = { ...raw };

  // Fields that ECharts calls compatLayoutProperties on — must be objects
  const componentFields = ['legend', 'tooltip', 'grid', 'toolbox', 'dataZoom', 'visualMap'];
  for (const f of componentFields) {
    if (f in opt) {
      if (Array.isArray(opt[f])) {
        opt[f] = (opt[f] as unknown[]).map((item) => ensureObj(item));
      } else {
        opt[f] = ensureObj(opt[f]);
      }
    }
  }

  // title: ensure object
  if ('title' in opt) {
    if (Array.isArray(opt.title)) {
      opt.title = (opt.title as unknown[]).map((t) => ensureObj(t));
    } else {
      opt.title = ensureObj(opt.title, { text: '' });
    }
  }

  // series: sanitize individual items
  if ('series' in opt) {
    opt.series = sanitizeSeries(opt.series);
  }

  // xAxis / yAxis: ensure array of objects
  const axisFix = (val: unknown): unknown => {
    if (!val) return val;
    if (Array.isArray(val)) return val.map((a) => ensureObj(a));
    return ensureObj(val);
  };
  if ('xAxis' in opt) opt.xAxis = axisFix(opt.xAxis);
  if ('yAxis' in opt) opt.yAxis = axisFix(opt.yAxis);

  return opt;
}

// ─── OCT dark-theme defaults injected into every chart ───────────────────────

function applyOctTheme(rawOption: Record<string, unknown>): Record<string, unknown> {
  // Sanitize first to prevent ECharts internal TypeErrors
  const option = sanitizeOption(rawOption);

  const TEXT_COLOR      = '#8b949e';
  const TITLE_COLOR     = '#e6edf3';
  const SPLIT_COLOR     = 'rgba(255,255,255,0.07)';
  const TOOLTIP_BG      = '#1a232d';
  const TOOLTIP_BORDER  = 'rgba(255,255,255,0.15)';

  // OCT brand palette (matches mermaid-pie CSS vars)
  const COLOR_PALETTE = [
    '#38a86c', '#3d8faa', '#a88c38', '#7858a8',
    '#5ea03e', '#a84e40', '#4a7fa8', '#c08030',
  ];

  // Detect non-cartesian chart types that require trigger:'item' (radar, pie, funnel, gauge, etc.)
  const seriesTypes: string[] = Array.isArray(option.series)
    ? (option.series as Record<string, unknown>[]).map((s) => String((s as any)?.type || ''))
    : [String((option.series as any)?.type || '')];
  const hasNonCartesian = seriesTypes.some((t) =>
    ['pie', 'radar', 'funnel', 'gauge', 'sankey', 'treemap', 'sunburst'].includes(t)
  ) || 'radar' in option;
  const hasPie = seriesTypes.includes('pie');
  const defaultTrigger = hasNonCartesian ? 'item' : 'axis';

  // Merge tooltip
  const tooltipBase: Record<string, unknown> = {
    trigger: defaultTrigger,
    backgroundColor: TOOLTIP_BG,
    borderColor: TOOLTIP_BORDER,
    borderWidth: 1,
    textStyle: { color: TITLE_COLOR, fontSize: 12 },
  };
  const userTooltip = option.tooltip as Record<string, unknown> | undefined;
  // For non-cartesian charts, strip axisPointer (not applicable and causes silent errors)
  const userTooltipClean = hasNonCartesian && userTooltip
    ? { ...userTooltip, trigger: defaultTrigger, axisPointer: undefined }
    : userTooltip;
  const mergedTooltip = { ...tooltipBase, ...userTooltipClean };

  // Merge legend
  const legendBase: Record<string, unknown> = {
    textStyle: { color: TEXT_COLOR },
  };
  const userLegend = option.legend as Record<string, unknown> | undefined;
  const mergedLegend = userLegend ? { ...legendBase, ...userLegend } : legendBase;

  // Pie charts: legend at bottom-right to avoid overlapping the circular chart
  if (hasPie) {
    ['top', 'left'].forEach(k => delete mergedLegend[k]);
    mergedLegend.bottom = 10;
    mergedLegend.right = 10;
  }

  // Pie chart series: readable label defaults on dark theme
  if (hasPie && Array.isArray(option.series)) {
    option.series = (option.series as Record<string, unknown>[]).map(s => {
      const item = s as Record<string, unknown>;
      if (item.type === 'pie') {
        return {
          ...item,
          label: { color: TITLE_COLOR, fontSize: 13, fontWeight: 'bold', ...(item.label as Record<string, unknown> || {}) },
        };
      }
      return item;
    });
  }

  // Patch axis styling
  const axisDefaults = {
    axisLine:  { lineStyle: { color: SPLIT_COLOR } },
    axisTick:  { lineStyle: { color: SPLIT_COLOR } },
    axisLabel: { color: TEXT_COLOR },
    splitLine: { lineStyle: { color: SPLIT_COLOR } },
  };
  const patchAxis = (axis: unknown): unknown => {
    if (!axis) return axis;
    if (Array.isArray(axis)) return axis.map((a) => ({ ...axisDefaults, ...(a as object) }));
    return { ...axisDefaults, ...(axis as object) };
  };

  // Patch title
  let titlePatched = option.title;
  if (titlePatched) {
    const titleDefaults = { textStyle: { color: TITLE_COLOR }, subtextStyle: { color: TEXT_COLOR } };
    titlePatched = Array.isArray(titlePatched)
      ? (titlePatched as object[]).map((t) => ({ ...titleDefaults, ...(t as object) }))
      : { ...titleDefaults, ...(titlePatched as object) };
  }

  const result: Record<string, unknown> = {
    ...option,
    color: option.color ?? COLOR_PALETTE,
    backgroundColor: 'transparent',
    textStyle: { color: TEXT_COLOR, fontFamily: 'system-ui, sans-serif' },
    tooltip: mergedTooltip,
    legend: mergedLegend,
  };

  if (titlePatched) result.title = titlePatched;
  if ('xAxis' in option) result.xAxis = patchAxis(option.xAxis);
  if ('yAxis' in option) result.yAxis = patchAxis(option.yAxis);

  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EChartsRendererProps {
  content: string;
}

export default function EChartsRenderer({ content }: EChartsRendererProps) {
  const chartRef = useRef<ReactECharts | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const payload = useMemo(() => parseEChartsPayload(content), [content]);

  const themedOption = useMemo(() => {
    if (!payload) return null;
    try {
      return applyOctTheme(payload.option);
    } catch (e) {
      console.warn('[EChartsRenderer] applyOctTheme error:', e);
      return payload.option; // fallback: use raw option
    }
  }, [payload]);

  // Force chart resize when container dimensions settle (flex layout takes a
  // frame to resolve — ECharts initialises before layout is complete).
  const handleChartReady = useCallback((chart: EChartsType) => {
    // Two-frame delay: first frame applies flex layout, second renders chart
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { chart.resize(); } catch { /* ignore */ }
      });
    });
  }, []);

  // ResizeObserver so the chart fills the panel if the window is resized
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const instance = chartRef.current?.getEchartsInstance?.();
      if (instance) {
        try { instance.resize(); } catch { /* ignore */ }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleExport = useCallback(async () => {
    if (exporting || !chartRef.current) return;
    setExporting(true);
    try {
      const instance = chartRef.current.getEchartsInstance();
      const dataUrl = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0d1117' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `chart-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn('[EChartsRenderer] Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  if (!payload || !themedOption) {
    return (
      <div className="oct-ec-error">
        <span>⚠ 无法解析图表数据</span>
        <pre>{content.slice(0, 600)}</pre>
      </div>
    );
  }

  return (
    <div className="oct-ec-wrapper" ref={wrapperRef}>
      <div className="oct-ec-titlebar">
        {payload.title
          ? <span className="oct-ec-title">{payload.title}</span>
          : <span />
        }
        <button
          className="oct-ec-export-btn"
          onClick={handleExport}
          disabled={exporting}
          title="Export as PNG"
        >
          {exporting ? 'Exporting…' : 'PNG'}
        </button>
      </div>

      {renderError ? (
        <div className="oct-ec-error">
          <span>⚠ 图表渲染失败</span>
          <pre>{renderError}</pre>
        </div>
      ) : (
        <div className="oct-ec-canvas">
          <ReactECharts
            ref={chartRef}
            option={themedOption}
            style={{ width: '100%', height: '100%', minHeight: 360 }}
            notMerge
            lazyUpdate
            onChartReady={handleChartReady}
            onEvents={{
              // Catch render errors surfaced as ECharts events
              rendered: () => { setRenderError(null); },
            }}
          />
        </div>
      )}
    </div>
  );
}
