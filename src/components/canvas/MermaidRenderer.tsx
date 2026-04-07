import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { useTheme } from '../../themes/ThemeProvider';

const renderCache = new Map<string, string>();
const CACHE_VERSION = 'v4'; // bump when polishSvg logic changes

function extractMermaidSource(content: string): string {
  const trimmed = (content || '').trim();
  const fenced = trimmed.match(/```mermaid\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const lines = trimmed.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    /^(flowchart|graph|sequencediagram|classdiagram|erdiagram|statediagram|gantt|pie|mindmap|journey|timeline|quadrantchart|requirementdiagram|gitgraph)\b/i
      .test(line.trim())
  );
  if (startIndex >= 0) {
    return lines.slice(startIndex).join('\n').trim();
  }

  return trimmed;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getMermaidThemeVariables(compact: boolean) {
  const accent = cssVar('--mermaid-node-border', cssVar('--accent-primary', '#d4764e'));
  const bgCode = cssVar('--mermaid-stage-bg', cssVar('--bg-code', '#1e1d1a'));
  const bgPanel = cssVar('--mermaid-cluster-fill', cssVar('--bg-panel', '#353430'));
  const textPrimary = cssVar('--text-primary', '#e8e4dd');
  const textSecondary = cssVar('--mermaid-cluster-text', cssVar('--text-secondary', '#b9aea0'));
  const borderSubtle = cssVar('--border-subtle', 'rgba(212, 118, 78, 0.2)');
  const fontSans = cssVar('--mermaid-font-family', cssVar('--font-display', cssVar('--font-sans', "'Inter', 'Noto Sans SC', sans-serif")));
  const nodeFill = cssVar('--mermaid-node-fill', '#6c4c3b');
  const nodeText = cssVar('--mermaid-node-text', '#fff6ed');
  const clusterBorder = cssVar('--mermaid-cluster-border', accent);
  const lineColor = cssVar('--mermaid-line', accent);
  const edgeLabelBackground = cssVar('--mermaid-edge-label-bg', cssVar('--bg-panel', '#353430'));

  return {
    background: bgCode,
    primaryColor: nodeFill,
    primaryTextColor: nodeText,
    primaryBorderColor: accent,
    lineColor,
    secondaryColor: nodeFill,
    secondaryBorderColor: accent,
    secondaryTextColor: nodeText,
    tertiaryColor: nodeFill,
    tertiaryBorderColor: accent,
    tertiaryTextColor: nodeText,
    mainBkg: nodeFill,
    textColor: textPrimary,
    nodeTextColor: nodeText,
    fontSize: compact ? '15px' : '16px',
    fontFamily: fontSans,
    edgeLabelBackground,
    clusterBkg: bgPanel,
    clusterBorder,
    titleColor: textPrimary,
    actorTextColor: textPrimary,
    labelTextColor: textSecondary,
    noteBkgColor: nodeFill,
    noteTextColor: nodeText,
    noteBorderColor: accent,
    activationBorderColor: accent,
    sectionBkgColor: bgPanel,
    altSectionBkgColor: bgCode,
    gridColor: borderSubtle,
    // ── Pie chart slice colors ────────────────────────────────────────────
    // 8 visually distinct hues that work on OCT's dark background.
    // Ordered so adjacent slices always contrast (warm / cool alternating).
    pie1: '#d4764e',  // OCT orange (primary accent)
    pie2: '#5eaaa0',  // teal
    pie3: '#deba62',  // amber gold
    pie4: '#c85873',  // rose
    pie5: '#82b06e',  // sage green
    pie6: '#7a8ec8',  // slate blue
    pie7: '#b07ac8',  // purple
    pie8: '#d49860',  // warm terracotta
    pie9: '#e87c6e',  // coral
    pie10: '#6ab098', // mint
    pie11: '#9878c8', // violet
    pie12: '#c8b462', // gold
    pieSectionTextColor: '#ffffff',
    pieSectionTextSize: compact ? '13px' : '15px',
    pieTitleTextColor: textPrimary,
    pieTitleTextSize: compact ? '13px' : '15px',
    pieStrokeColor: bgCode,
    pieStrokeWidth: '2px',
    pieOpacity: '1',
  };
}

function polishSvg(rawSvg: string, compact: boolean): string {
  if (typeof DOMParser === 'undefined') return rawSvg;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return rawSvg;

    const nodeRadius = compact ? '14' : '16';
    const clusterRadius = compact ? '18' : '20';

    svgEl.querySelectorAll('.node rect').forEach((node) => {
      node.setAttribute('rx', nodeRadius);
      node.setAttribute('ry', nodeRadius);
    });

    svgEl.querySelectorAll('.cluster rect').forEach((node) => {
      node.setAttribute('rx', clusterRadius);
      node.setAttribute('ry', clusterRadius);
    });

    svgEl.querySelectorAll('.label text, .label foreignObject div, .cluster-label text').forEach((node) => {
      if (node instanceof Element) {
        node.setAttribute('font-weight', compact ? '600' : '700');
      }
    });

    // For compact (chat) mode: bake the target dimensions into the SVG itself.
    // This is more reliable than CSS transform scaling, which doesn't affect layout
    // and causes the content to be clipped by overflow:hidden.
    if (compact) {
      const vbAttr = svgEl.getAttribute('viewBox');
      if (vbAttr) {
        const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
        if (parts.length >= 4 && !parts.some(Number.isNaN)) {
          const [, , vbw, vbh] = parts;
          if (vbw > 0 && vbh > 0) {
            // Fit within a 580×380 box, maintain aspect ratio.
            // 580px ≈ typical chat message width; 380px gives pie charts
            // (~square viewBox) enough room to be clearly readable.
            const maxW = 580;
            const maxH = 380;
            const scale = Math.min(maxW / vbw, maxH / vbh, 1);
            svgEl.setAttribute('width', String(Math.round(vbw * scale)));
            svgEl.setAttribute('height', String(Math.round(vbh * scale)));
          }
        }
      }
      // Remove Mermaid's inline max-width so our explicit dimensions take effect
      const style = svgEl.getAttribute('style') ?? '';
      const cleaned = style.replace(/max-width\s*:[^;]+;?\s*/gi, '').trim();
      if (cleaned) svgEl.setAttribute('style', cleaned);
      else svgEl.removeAttribute('style');
    }

    return new XMLSerializer().serializeToString(svgEl);
  } catch {
    return rawSvg;
  }
}

export default function MermaidRenderer({
  content,
  compact = false,
}: {
  content: string;
  compact?: boolean;
}) {
  const { themeId } = useTheme();
  const graphId = useId().replace(/:/g, '_');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState(1);

  const clampZoom = (value: number) => Math.min(2.6, Math.max(0.55, value));

  const getDiagramSize = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    const svgNode = stage.querySelector('svg');
    if (!svgNode) return null;

    const viewBox = svgNode.viewBox?.baseVal;
    const rawWidth = viewBox?.width || svgNode.getBBox?.().width || svgNode.clientWidth;
    const rawHeight = viewBox?.height || svgNode.getBBox?.().height || svgNode.clientHeight;
    if (!rawWidth || !rawHeight) return null;

    return { stageWidth: stage.clientWidth, stageHeight: stage.clientHeight, rawWidth, rawHeight };
  };

  const fitToStage = () => {
    const size = getDiagramSize();
    if (!size) return;
    // 同时按宽度/高度适配，避免出现“下半区大片空白”。
    const widthPaddingRatio = compact ? 0.9 : 0.94;
    const heightPaddingRatio = compact ? 0.86 : 0.9;
    const scaleByWidth = (size.stageWidth * widthPaddingRatio) / size.rawWidth;
    const scaleByHeight = (size.stageHeight * heightPaddingRatio) / size.rawHeight;
    const nextZoom = clampZoom(Math.min(scaleByWidth, scaleByHeight));
    setZoom(nextZoom);
  };

  useEffect(() => {
    const source = extractMermaidSource(content);
    let cancelled = false;

    async function renderDiagram() {
      if (!source) {
        setSvg('');
        setError(null);
        return;
      }

      const cacheKey = `${CACHE_VERSION}:${themeId}:${compact ? 'compact' : 'full'}:${source}`;
      const cached = renderCache.get(cacheKey);
      if (cached) {
        setSvg(cached);
        setError(null);
        // fitToStage is called by the svg useEffect after React commits the DOM
        return;
      }

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'base',
        flowchart: {
          useMaxWidth: false,
          nodeSpacing: compact ? 42 : 56,
          rankSpacing: compact ? 58 : 76,
          curve: 'basis',
        },
        themeVariables: getMermaidThemeVariables(compact),
      });

      try {
        // Each attempt gets a unique suffix to avoid Mermaid's internal ID conflicts
        // (can happen in React StrictMode double-invoke and concurrent renders).
        const renderId = `oct_mermaid_${graphId}_${Date.now()}`;
        const stale = document.getElementById(renderId);
        if (stale) stale.remove();

        console.log('[OCT Mermaid] render start', { compact, type: source.trim().split(/\s/)[0], id: renderId });
        const { svg: nextSvg } = await mermaid.render(renderId, source);
        console.log('[OCT Mermaid] render ok, svg bytes:', nextSvg.length);

        const polishedSvg = polishSvg(nextSvg, compact);
        renderCache.set(cacheKey, polishedSvg);
        if (renderCache.size > 80) {
          const firstKey = renderCache.keys().next().value;
          if (firstKey) renderCache.delete(firstKey);
        }
        if (!cancelled) {
          setSvg(polishedSvg);
          setError(null);
          // fitToStage is called by the svg useEffect after React commits the DOM
        } else {
          console.warn('[OCT Mermaid] render completed but effect was cancelled');
        }
      } catch (err) {
        console.error('[OCT Mermaid] render error:', err);
        if (!cancelled) {
          setSvg('');
          setError(err instanceof Error ? err.message : 'Mermaid render failed');
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [compact, content, graphId, themeId]);

  // Fit after SVG is committed to DOM (ResizeObserver alone misses cases where
  // the stage size doesn't change, e.g. compact mode with a fixed min-height).
  useEffect(() => {
    if (!svg) return;
    let frameId: number = 0;
    const outer = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(() => {
        fitToStage();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(frameId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitToStage();
      });
    });

    observer.observe(stage);
    return () => observer.disconnect();
  }, [svg]);

  const exportPng = async () => {
    if (!svg || exporting) return;
    setExporting(true);
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (!svgEl) throw new Error('Invalid svg');

      const viewBox = svgEl.getAttribute('viewBox')?.trim().split(/\s+/).map(Number) || [];
      const widthAttr = Number(svgEl.getAttribute('width'));
      const heightAttr = Number(svgEl.getAttribute('height'));

      const rawWidth = Number.isFinite(viewBox[2]) ? viewBox[2] : widthAttr;
      const rawHeight = Number.isFinite(viewBox[3]) ? viewBox[3] : heightAttr;
      if (!rawWidth || !rawHeight) throw new Error('Cannot detect diagram size');

      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rawWidth * scale));
      canvas.height = Math.max(1, Math.round(rawHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot create canvas context');

      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      try {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            ctx.clearRect(0, 0, rawWidth, rawHeight);
            ctx.drawImage(img, 0, 0, rawWidth, rawHeight);
            resolve();
          };
          img.onerror = () => reject(new Error('Failed to render SVG'));
          img.src = svgUrl;
        });
      } finally {
        URL.revokeObjectURL(svgUrl);
      }

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `diagram-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn('Failed to export Mermaid PNG:', err);
    } finally {
      setExporting(false);
    }
  };

  if (error) {
    return (
      <div className="canvas-mermaid-fallback">
        <div className="canvas-mermaid-error">Mermaid render failed: {error}</div>
        <pre className="canvas-code-preview">{extractMermaidSource(content)}</pre>
      </div>
    );
  }

  return (
    <div className={`canvas-mermaid-preview${compact ? ' canvas-mermaid-preview--compact' : ''}`}>
      {!compact && (
        <div className="canvas-mermaid-toolbar">
          <button
            type="button"
            className="canvas-mermaid-btn"
            onClick={() => {
              const next = clampZoom(zoom - 0.15);
              setZoom(next);
            }}
          >
            -
          </button>
          <button type="button" className="canvas-mermaid-btn" onClick={fitToStage}>
            Fit
          </button>
          <button
            type="button"
            className="canvas-mermaid-btn"
            onClick={() => {
              setZoom(1);
            }}
          >
            100%
          </button>
          <button
            type="button"
            className="canvas-mermaid-btn"
            onClick={() => {
              const next = clampZoom(zoom + 0.15);
              setZoom(next);
            }}
          >
            +
          </button>
          <button type="button" className="canvas-mermaid-btn" onClick={exportPng} disabled={!svg || exporting}>
            {exporting ? 'Exporting...' : 'PNG'}
          </button>
        </div>
      )}
      <div className={`canvas-mermaid-stage${compact ? ' canvas-mermaid-stage--compact' : ''}`} ref={stageRef}>
        <div
          className={`canvas-mermaid-zoom${compact ? ' canvas-mermaid-zoom--compact' : ''}`}
          style={compact ? undefined : {
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
