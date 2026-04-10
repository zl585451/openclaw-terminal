import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsType } from 'echarts';
import './EChartsRenderer.css';

interface EChartPayload {
  title?: string;
  option: Record<string, unknown>;
}

function parseContent(raw: string): EChartPayload | null {
  const s = raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  try {
    const parsed = JSON.parse(s);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.option && typeof parsed.option === 'object' && !Array.isArray(parsed.option)) {
      return { title: String(parsed.title || ''), option: parsed.option as Record<string, unknown> };
    }
    const knownKeys = ['series', 'xAxis', 'yAxis', 'legend', 'tooltip', 'radar', 'geo', 'dataset'];
    if (knownKeys.some((key) => key in parsed)) {
      const titleText = (parsed.title as { text?: string } | undefined)?.text ?? '';
      return { title: titleText, option: parsed as Record<string, unknown> };
    }
    return null;
  } catch {
    return null;
  }
}

function ensureObj(val: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>;
  if (typeof val === 'string') {
    const pos = ['top', 'bottom', 'left', 'right', 'center', 'middle'];
    if (pos.includes(val)) return { [val]: val === 'center' || val === 'middle' ? '50%' : '5%' };
    if (val === 'item' || val === 'axis' || val === 'none') return { trigger: val };
  }
  return fallback;
}

function sanitizeOption(raw: Record<string, unknown>): Record<string, unknown> {
  const opt = { ...raw };
  const componentFields = ['legend', 'tooltip', 'grid', 'toolbox', 'dataZoom', 'visualMap'];
  for (const field of componentFields) {
    if (field in opt) {
      opt[field] = Array.isArray(opt[field])
        ? (opt[field] as unknown[]).map((item) => ensureObj(item))
        : ensureObj(opt[field]);
    }
  }
  if ('title' in opt) {
    opt.title = Array.isArray(opt.title)
      ? (opt.title as unknown[]).map((item) => ensureObj(item))
      : ensureObj(opt.title, { text: '' });
  }
  const axisFix = (val: unknown): unknown => (Array.isArray(val) ? val.map((item) => ensureObj(item)) : ensureObj(val));
  if ('xAxis' in opt) opt.xAxis = axisFix(opt.xAxis);
  if ('yAxis' in opt) opt.yAxis = axisFix(opt.yAxis);
  return opt;
}

function applyOctTheme(rawOption: Record<string, unknown>): Record<string, unknown> {
  const option = sanitizeOption(rawOption);
  const textColor = '#8b949e';
  const titleColor = '#e6edf3';
  const splitColor = 'rgba(255,255,255,0.07)';
  const tooltipBg = '#1a232d';
  const tooltipBorder = 'rgba(255,255,255,0.15)';
  const palette = ['#38a86c', '#3d8faa', '#a88c38', '#7858a8', '#5ea03e', '#a84e40', '#4a7fa8', '#c08030'];

  const tooltipBase = {
    trigger: 'axis',
    backgroundColor: tooltipBg,
    borderColor: tooltipBorder,
    borderWidth: 1,
    textStyle: { color: titleColor, fontSize: 12 },
  };

  const axisDefaults = {
    axisLine: { lineStyle: { color: splitColor } },
    axisTick: { lineStyle: { color: splitColor } },
    axisLabel: { color: textColor },
    splitLine: { lineStyle: { color: splitColor } },
  };
  const patchAxis = (axis: unknown): unknown => Array.isArray(axis)
    ? axis.map((item) => ({ ...axisDefaults, ...(item as object) }))
    : { ...axisDefaults, ...(axis as object) };

  const result: Record<string, unknown> = {
    ...option,
    color: option.color ?? palette,
    backgroundColor: 'transparent',
    textStyle: { color: textColor, fontFamily: 'system-ui, sans-serif' },
    tooltip: { ...tooltipBase, ...(option.tooltip as object | undefined) },
    legend: option.legend ? { textStyle: { color: textColor }, ...(option.legend as object) } : { textStyle: { color: textColor } },
  };

  if (option.title) {
    result.title = Array.isArray(option.title)
      ? (option.title as object[]).map((item) => ({ textStyle: { color: titleColor }, subtextStyle: { color: textColor }, ...item }))
      : { textStyle: { color: titleColor }, subtextStyle: { color: textColor }, ...(option.title as object) };
  }
  if ('xAxis' in option) result.xAxis = patchAxis(option.xAxis);
  if ('yAxis' in option) result.yAxis = patchAxis(option.yAxis);
  return result;
}

export default function EChartsRenderer({ content }: { content: string }) {
  const chartRef = useRef<ReactECharts | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const payload = useMemo(() => parseContent(content), [content]);
  const themedOption = useMemo(() => {
    if (!payload) return null;
    try {
      return applyOctTheme(payload.option);
    } catch (error) {
      console.warn('[EChartsRenderer] applyOctTheme error:', error);
      return payload.option;
    }
  }, [payload]);

  const handleChartReady = useCallback((chart: EChartsType) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { chart.resize(); } catch {}
      });
    });
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const instance = chartRef.current?.getEchartsInstance?.();
      if (instance) {
        try { instance.resize(); } catch {}
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
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
    } catch (error) {
      console.warn('[EChartsRenderer] Export failed:', error);
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
        {payload.title ? <span className="oct-ec-title">{payload.title}</span> : <span />}
        <button className="oct-ec-export-btn" onClick={handleExport} disabled={exporting} title="Export as PNG">
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
            onEvents={{ rendered: () => setRenderError(null) }}
          />
        </div>
      )}
    </div>
  );
}
