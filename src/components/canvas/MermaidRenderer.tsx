import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { useTheme } from '../../themes/ThemeProvider';

const renderCache = new Map<string, string>();
const CACHE_VERSION = 'v10'; // bump when source normalization or polishSvg logic changes
// Guard: only call mermaid.initialize() when theme+compact actually changes.
// mermaid.initialize() is synchronous and rebuilds global config — no need to
// repeat it for every cache-hit render or StrictMode re-invoke.
let lastMermaidInitKey = '';

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

function normalizeMermaidSource(source: string): string {
  let next = String(source || '');

  // Common AI mistake: empty double-circle nodes like A(()) are invalid Mermaid.
  // Rewrite them to a valid minimal label so chat preview does not hard-fail.
  next = next.replace(/\b([A-Za-z][A-Za-z0-9_]*)\(\(\)\)/g, (_m, id) => `${id}((${id}))`);

  // Common AI mistake: empty stadium nodes like A([]) or malformed placeholder labels.
  next = next.replace(/\b([A-Za-z][A-Za-z0-9_]*)\(\[\]\)/g, (_m, id) => `${id}["${id}"]`);

  // AI often writes multi-line node labels: ["客户端\nSYN_SEND"] or ["line1\nline2"].
  // Mermaid renders both lines but node height is fixed — the second line is clipped.
  // Fix: replace \n (both the literal escape sequence and real newlines) inside any
  // double-quoted string with a single space, keeping all content on one line.
  next = next.replace(/"([^"]*?)"/g, (_m, inner) =>
    '"' + inner.replace(/\\n/g, ' ').replace(/\n/g, ' ').trim() + '"'
  );

  return rewriteReservedNodeIds(next).trim();
}

function rewriteReservedNodeIds(source: string): string {
  const reservedIds = new Set(['end']);
  const replacements = new Map<string, string>();
  const lines = String(source || '').split(/\r?\n/);

  const declareReplacement = (id: string) => {
    if (!reservedIds.has(id)) return;
    if (!replacements.has(id)) {
      replacements.set(id, `${id}_node`);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const nodeDeclMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_]*)\s*(?:\[\s*"|[\[\(\{])/);
    if (nodeDeclMatch?.[1]) {
      declareReplacement(nodeDeclMatch[1]);
    }
  }

  if (!replacements.size) {
    return source;
  }

  return lines
    .map((line) => {
      let next = line;
      for (const [from, to] of replacements.entries()) {
        next = next.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
      }
      return next;
    })
    .join('\n');
}

function aggressivelySanitizeMermaidSource(source: string): string {
  let next = normalizeMermaidSource(source);

  // AI frequently uses Unicode arrows in Mermaid code blocks. Mermaid expects
  // ASCII edge operators like --> / -.-> / ==>, so normalize the common case.
  next = next.replace(/\s*[→⟶⟹⇢➜]+\s*/g, ' --> ');

  // Mermaid labels do not reliably handle HTML line breaks in free-form AI output.
  next = next.replace(/<br\s*\/?>/gi, ' ');

  // Strip emoji/presentation selectors that commonly break parsing inside labels.
  next = next
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\uFE0E\uFE0F]/g, '');

  // Collapse repeated whitespace introduced by cleanup.
  next = next
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n');

  return next.trim();
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
    fontSize: compact ? '13px' : '15px',
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
    // ── Pie chart slice colors — read per-theme CSS vars, fallback to muted universals ──
    pie1:  cssVar('--mermaid-pie-1', '#b06840'),
    pie2:  cssVar('--mermaid-pie-2', '#3f9090'),
    pie3:  cssVar('--mermaid-pie-3', '#a88840'),
    pie4:  cssVar('--mermaid-pie-4', '#806890'),
    pie5:  cssVar('--mermaid-pie-5', '#4e9258'),
    pie6:  cssVar('--mermaid-pie-6', '#a05870'),
    pie7:  cssVar('--mermaid-pie-7', '#4878a0'),
    pie8:  cssVar('--mermaid-pie-8', '#8a7840'),
    pie9:  cssVar('--mermaid-pie-1', '#b06840'),  // wrap for >8 slices
    pie10: cssVar('--mermaid-pie-2', '#3f9090'),
    pie11: cssVar('--mermaid-pie-3', '#a88840'),
    pie12: cssVar('--mermaid-pie-4', '#806890'),
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

    // Strip rogue inline fill/stroke colours that the AI may have injected via
    // `style A fill:#xxx` or `classDef highlight fill:#xxx` Mermaid commands.
    // Those bypass the theme system and produce garish off-theme nodes.
    // We read the intended theme colours from CSS vars and restore them here.
    const themeFill   = cssVar('--mermaid-node-fill',   '#2b448e');
    const themeStroke = cssVar('--mermaid-node-border',  '#8ea2ff');
    const themeText   = cssVar('--mermaid-node-text',    '#f5f7ff');
    const themeEdge   = cssVar('--mermaid-line',         themeStroke);

    // Helper: strip fill/stroke from style="" attribute, return cleaned string
    const stripStyleColors = (styleAttr: string) =>
      styleAttr
        .replace(/\bfill\s*:[^;]+;?/gi, '')
        .replace(/\bstroke\s*:[^;]+;?/gi, '')
        .trim();

    svgEl.querySelectorAll<SVGElement>('.node rect, .node circle, .node ellipse, .node polygon').forEach((shape) => {
      const inlineFill  = shape.getAttribute('fill') ?? '';
      const styleAttr   = shape.getAttribute('style') ?? '';
      const hasFillAttr = inlineFill && inlineFill !== 'none' && !inlineFill.startsWith('var(');
      // Mermaid may inject colors via style="fill:#xxx" rather than fill="" attribute
      const hasFillStyle = /\bfill\s*:/.test(styleAttr);

      if (hasFillAttr || hasFillStyle) {
        shape.setAttribute('fill',   themeFill);
        shape.setAttribute('stroke', themeStroke);
        const cleaned = stripStyleColors(styleAttr);
        if (cleaned) shape.setAttribute('style', cleaned);
        else shape.removeAttribute('style');
      }
      shape.setAttribute('rx', nodeRadius);
      shape.setAttribute('ry', nodeRadius);
    });

    // Restore text colour on nodes that may have been re-coloured
    svgEl.querySelectorAll<SVGElement>('.node .label text, .node .label tspan').forEach((t) => {
      const inlineFill = t.getAttribute('fill') ?? '';
      const styleAttr  = t.getAttribute('style') ?? '';
      const hasFillAttr  = inlineFill && inlineFill !== 'none' && !inlineFill.startsWith('var(');
      const hasFillStyle = /\bfill\s*:/.test(styleAttr);
      if (hasFillAttr || hasFillStyle) {
        t.setAttribute('fill', themeText);
        const cleaned = stripStyleColors(styleAttr);
        if (cleaned) t.setAttribute('style', cleaned);
        else t.removeAttribute('style');
      }
    });

    // Restore edge/link colours
    svgEl.querySelectorAll<SVGElement>('.edgePath path, .flowchart-link').forEach((path) => {
      const inlineStroke = path.getAttribute('stroke') ?? '';
      const styleAttr    = path.getAttribute('style') ?? '';
      const hasStrokeAttr  = inlineStroke && inlineStroke !== 'none' && !inlineStroke.startsWith('var(');
      const hasStrokeStyle = /\bstroke\s*:/.test(styleAttr);
      if (hasStrokeAttr || hasStrokeStyle) {
        path.setAttribute('stroke', themeEdge);
        const cleaned = stripStyleColors(styleAttr);
        if (cleaned) path.setAttribute('style', cleaned);
        else path.removeAttribute('style');
      }
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

    // Always remove Mermaid's inline max-width so our viewer controls can
    // determine the final viewport size and zoom behavior.
    const style = svgEl.getAttribute('style') ?? '';
    const cleaned = style.replace(/max-width\s*:[^;]+;?\s*/gi, '').trim();
    if (cleaned) svgEl.setAttribute('style', cleaned);
    else svgEl.removeAttribute('style');

    return new XMLSerializer().serializeToString(svgEl);
  } catch {
    return rawSvg;
  }
}

function getDiagramKind(source: string): string {
  const firstDirective =
    String(source || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('%%')) || '';
  const typeMatch = firstDirective.match(
    /^(flowchart|graph|sequencediagram|classdiagram|erdiagram|statediagram(?:-v2)?|gantt|pie|mindmap|journey|timeline|quadrantchart|requirementdiagram|gitgraph)\b/i
  );
  return (typeMatch?.[1] || 'unknown').toLowerCase();
}

function getSvgBounds(rawSvg: string): { width: number; height: number } | null {
  if (!rawSvg || typeof DOMParser === 'undefined') return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return null;

    const viewBox = svgEl.getAttribute('viewBox')?.trim().split(/\s+/).map(Number) || [];
    const widthAttr = Number(svgEl.getAttribute('width'));
    const heightAttr = Number(svgEl.getAttribute('height'));
    const width = Number.isFinite(viewBox[2]) ? viewBox[2] : widthAttr;
    const height = Number.isFinite(viewBox[3]) ? viewBox[3] : heightAttr;
    if (!width || !height) return null;

    return { width, height };
  } catch {
    return null;
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
  const fullShellRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number; dragging: boolean } | null>(null);
  const manualZoomRef = useRef(false);
  const zoomRafRef = useRef<number | null>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<'diagram' | 'code'>('diagram');

  const source = normalizeMermaidSource(extractMermaidSource(content));
  const diagramKind = getDiagramKind(source);
  const isPieDiagram = diagramKind === 'pie';
  const isHierarchyDiagram = diagramKind === 'hierarchy';
  const svgBounds = getSvgBounds(svg);
  const compactFitMaxZoom = 2.4;
  const clampZoom = (value: number) => Math.min(compact ? 6 : 5, Math.max(compact ? 0.35 : 0.55, value));

  const getDiagramSize = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    const svgNode = stage.querySelector('svg');
    if (!svgNode) return null;

    const viewBox = svgNode.viewBox?.baseVal;
    // viewBox values are unaffected by CSS zoom — prefer them.
    // getBBox() returns intrinsic geometry; clientWidth is zoom-scaled (avoid as fallback).
    const rawWidth  = (viewBox?.width  || 0) || svgNode.getBBox?.().width  || svgNode.clientWidth;
    const rawHeight = (viewBox?.height || 0) || svgNode.getBBox?.().height || svgNode.clientHeight;
    if (!rawWidth || !rawHeight) return null;

    return { stageWidth: stage.clientWidth, stageHeight: stage.clientHeight, rawWidth, rawHeight };
  };

  const fitToStage = () => {
    if (manualZoomRef.current) return;
    const size = getDiagramSize();
    if (!size) return;
    // 同时按宽度/高度适配，避免出现“下半区大片空白”。
    const widthPaddingRatio = compact ? (isPieDiagram ? 0.96 : 0.94) : 0.94;
    const heightPaddingRatio = compact ? (isPieDiagram ? 0.92 : 0.9) : 0.9;
    const scaleByWidth = (size.stageWidth * widthPaddingRatio) / size.rawWidth;
    const scaleByHeight = (size.stageHeight * heightPaddingRatio) / size.rawHeight;
    const nextZoom = compact
      ? Math.min(compactFitMaxZoom, clampZoom(Math.min(scaleByWidth, scaleByHeight)))
      : Math.min(1, clampZoom(Math.min(scaleByWidth, scaleByHeight)));
    setZoom(nextZoom);
    if (!compact) {
      requestAnimationFrame(() => {
        const stage = stageRef.current;
        if (!stage) return;
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
      });
    }
  };

  const centerViewport = () => {
    if (!compact) return;
    if (manualZoomRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const maxLeft = Math.max(0, stage.scrollWidth - stage.clientWidth);
    const maxTop = Math.max(0, stage.scrollHeight - stage.clientHeight);
    stage.scrollLeft = Math.round(maxLeft / 2);
    stage.scrollTop = compact ? 0 : Math.round(maxTop / 2);
  };

  const stepZoom = (direction: 1 | -1) => {
    const stage = stageRef.current;
    manualZoomRef.current = true;
    setZoom((prev) => {
      const factor = compact
        ? (direction > 0 ? 1.35 : 1 / 1.35)
        : (direction > 0 ? 1.22 : 1 / 1.22);
      const next = clampZoom(prev * factor);
      if (stage && next !== prev) {
        if (compact) {
          const centerX = stage.scrollLeft + stage.clientWidth / 2;
          const centerY = stage.scrollTop + stage.clientHeight / 2;
          const ratio = next / prev;
          if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
          zoomRafRef.current = requestAnimationFrame(() => {
            stage.scrollLeft = Math.max(0, centerX * ratio - stage.clientWidth / 2);
            stage.scrollTop = Math.max(0, centerY * ratio - stage.clientHeight / 2);
          });
        } else if (svgBounds) {
          const centerX = stage.scrollLeft + stage.clientWidth / 2;
          const centerY = stage.scrollTop + stage.clientHeight / 2;
          const ratio = next / prev;
          if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
          zoomRafRef.current = requestAnimationFrame(() => {
            stage.scrollLeft = Math.max(
              0,
              Math.min(centerX * ratio - stage.clientWidth / 2, Math.max(0, svgBounds.width * next - stage.clientWidth))
            );
            stage.scrollTop = Math.max(
              0,
              Math.min(centerY * ratio - stage.clientHeight / 2, Math.max(0, svgBounds.height * next - stage.clientHeight))
            );
          });
        }
      }
      return next;
    });
  };

  useEffect(() => {
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

      const initKey = `${themeId}:${compact ? 'compact' : 'full'}`;
      if (initKey !== lastMermaidInitKey) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'base',
          flowchart: {
            useMaxWidth: false,
            nodeSpacing: compact ? 56 : 64,
            rankSpacing: compact ? 84 : 100,
            curve: 'basis',
          },
          themeVariables: getMermaidThemeVariables(compact),
        });
        lastMermaidInitKey = initKey;
      }

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
          manualZoomRef.current = false;
          setSvg(polishedSvg);
          setError(null);
          // fitToStage is called by the svg useEffect after React commits the DOM
        } else {
          console.warn('[OCT Mermaid] render completed but effect was cancelled');
        }
      } catch (err) {
        console.warn('[OCT Mermaid] primary render failed, retrying with sanitized source:', err);
        try {
          const fallbackSource = aggressivelySanitizeMermaidSource(source);
          if (!fallbackSource || fallbackSource === source) throw err;
          const retryId = `oct_mermaid_${graphId}_${Date.now()}_retry`;
          const staleRetry = document.getElementById(retryId);
          if (staleRetry) staleRetry.remove();
          const { svg: retriedSvg } = await mermaid.render(retryId, fallbackSource);
          const polishedSvg = polishSvg(retriedSvg, compact);
          renderCache.set(cacheKey, polishedSvg);
          if (!cancelled) {
            manualZoomRef.current = false;
            setSvg(polishedSvg);
            setError(null);
          }
        } catch (retryErr) {
          console.error('[OCT Mermaid] render error:', retryErr);
          if (!cancelled) {
            setSvg('');
            setError(retryErr instanceof Error ? retryErr.message : 'Mermaid render failed');
          }
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [compact, graphId, source, themeId]);

  // Fit after SVG is committed to DOM (ResizeObserver alone misses cases where
  // the stage size doesn't change, e.g. compact mode with a fixed min-height).
  useEffect(() => {
    if (!svg || viewMode !== 'diagram') return;
    let frameId: number = 0;
    let centerId: number = 0;
    const outer = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(() => {
        fitToStage();
        centerId = requestAnimationFrame(() => {
          centerViewport();
        });
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(centerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, viewMode]);

  useEffect(() => {
    if (viewMode !== 'diagram') {
      manualZoomRef.current = false;
    }
  }, [viewMode]);

  useEffect(() => {
    return () => {
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined' || viewMode !== 'diagram') return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitToStage();
        requestAnimationFrame(() => {
          centerViewport();
        });
      });
    });

    observer.observe(stage);
    return () => observer.disconnect();
  }, [svg, viewMode]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || viewMode !== 'diagram') return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        stepZoom(event.deltaY > 0 ? -1 : 1);
        return;
      }

      if (compact) {
        const canScrollY = stage.scrollHeight > stage.clientHeight;
        const canScrollX = stage.scrollWidth > stage.clientWidth;
        if (!canScrollY && !canScrollX) return;

        event.preventDefault();
        if (canScrollY && event.deltaY) stage.scrollTop += event.deltaY;
        if (canScrollX && event.deltaX) stage.scrollLeft += event.deltaX;
        return;
      }
    };

    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [viewMode]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode !== 'diagram') return;
    const stage = stageRef.current;
    if (!stage) return;
    if (event.button !== 0) return;
    const canPan = stage.scrollWidth > stage.clientWidth || stage.scrollHeight > stage.clientHeight;
    if (!canPan) return;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
      dragging: true,
    };
    stage.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    const drag = dragStateRef.current;
    if (!stage || !drag?.dragging) return;
    event.preventDefault();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    stage.scrollLeft = drag.scrollLeft - dx;
    stage.scrollTop = drag.scrollTop - dy;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (stage) {
      stage.releasePointerCapture?.(event.pointerId);
    }
    if (dragStateRef.current) {
      dragStateRef.current.dragging = false;
    }
  };

  const toggleFullscreen = async () => {
    const el = fullShellRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  if (error) {
    return (
      <div className="canvas-mermaid-fallback">
        <div className="canvas-mermaid-error">Mermaid render failed: {error}</div>
        <pre className="canvas-code-preview">{source}</pre>
      </div>
    );
  }

  return (
    <div className={`canvas-mermaid-preview${compact ? ' canvas-mermaid-preview--compact' : ''}`}>
      {compact ? (
        <>
          <div className="canvas-mermaid-toolbar canvas-mermaid-toolbar--compact">
            <div className="canvas-mermaid-segmented" role="tablist" aria-label="Mermaid view mode">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'diagram'}
                className={`canvas-mermaid-segmented__option${viewMode === 'diagram' ? ' is-active' : ''}`}
                onClick={() => setViewMode('diagram')}
                title="查看图形预览"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M1.5 8c1.7-2.8 4-4.2 6.5-4.2S12.8 5.2 14.5 8c-1.7 2.8-4 4.2-6.5 4.2S3.2 10.8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'code'}
                className={`canvas-mermaid-segmented__option${viewMode === 'code' ? ' is-active' : ''}`}
                onClick={() => setViewMode('code')}
                title="查看源码"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M6 4 2.8 8 6 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="m10 4 3.2 4-3.2 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
          <div className="canvas-mermaid-stage-shell canvas-mermaid-stage-shell--compact">
        <div
          className={`canvas-mermaid-stage canvas-mermaid-stage--compact${compact && isPieDiagram ? ' canvas-mermaid-stage--compact-pie' : ''}${compact && isHierarchyDiagram ? ' canvas-mermaid-stage--compact-centered' : ''}${viewMode === 'diagram' ? ' is-draggable' : ''}`}
          ref={stageRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {viewMode === 'code' ? (
                <pre className="canvas-code-preview">{source}</pre>
              ) : (
                <div className="canvas-mermaid-stage--compact-inner">
                  <div
                    className="canvas-mermaid-scale-shell"
                    style={{
                      width: svgBounds ? Math.max(svgBounds.width * zoom, stageRef.current?.clientWidth || 0) : '100%',
                      height: svgBounds ? svgBounds.height * zoom : undefined,
                    }}
                  >
                    <div
                      className="canvas-mermaid-zoom canvas-mermaid-zoom--compact"
                      style={{
                        width: svgBounds ? svgBounds.width : undefined,
                        height: svgBounds ? svgBounds.height : undefined,
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top left',
                      }}
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                  </div>
                </div>
              )}
            </div>
            {viewMode === 'diagram' ? (
              <div className="canvas-mermaid-zoomdock canvas-mermaid-zoomdock--compact">
                <button
                  type="button"
                  className="canvas-mermaid-zoomdock__btn"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => stepZoom(1)}
                  aria-label="Zoom in"
                  title="放大"
                >
                  +
                </button>
                <button
                  type="button"
                  className="canvas-mermaid-zoomdock__btn"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => stepZoom(-1)}
                  aria-label="Zoom out"
                  title="缩小"
                >
                  -
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="canvas-mermaid-workbench" ref={fullShellRef}>
          <div className="canvas-mermaid-workbench__toolbar">
            <div className="canvas-mermaid-workbench__meta">
              <div className="canvas-mermaid-segmented" role="tablist" aria-label="Mermaid view mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'diagram'}
                  className={`canvas-mermaid-segmented__option${viewMode === 'diagram' ? ' is-active' : ''}`}
                  onClick={() => setViewMode('diagram')}
                  title="查看图形预览"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M1.5 8c1.7-2.8 4-4.2 6.5-4.2S12.8 5.2 14.5 8c-1.7 2.8-4 4.2-6.5 4.2S3.2 10.8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'code'}
                  className={`canvas-mermaid-segmented__option${viewMode === 'code' ? ' is-active' : ''}`}
                  onClick={() => setViewMode('code')}
                  title="查看源码"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M6 4 2.8 8 6 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="m10 4 3.2 4-3.2 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="canvas-mermaid-workbench__actions">
              {viewMode === 'diagram' && (
                <>
                  <button type="button" className="canvas-mermaid-btn canvas-mermaid-btn--icon" onClick={() => stepZoom(-1)} title="缩小">
                    -
                  </button>
                  <button type="button" className="canvas-mermaid-btn canvas-mermaid-btn--icon" onClick={fitToStage} title="适配视图">
                    适配
                  </button>
                  <button type="button" className="canvas-mermaid-btn canvas-mermaid-btn--icon" onClick={() => stepZoom(1)} title="放大">
                    +
                  </button>
                </>
              )}
              <button type="button" className="canvas-mermaid-btn" onClick={toggleFullscreen}>
                全屏
              </button>
            </div>
          </div>
          {viewMode === 'code' ? (
            <pre className="canvas-code-preview canvas-code-preview--workbench">{source}</pre>
          ) : (
            <div
              className={`canvas-mermaid-pane__viewport canvas-mermaid-pane__viewport--full${viewMode === 'diagram' ? ' is-draggable' : ''}`}
              ref={stageRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {error ? (
                <pre className="canvas-mermaid-pane__error">{error}</pre>
              ) : (
                <div
                  className="canvas-mermaid-pane__surface"
                  style={{
                    width: svgBounds ? Math.max(svgBounds.width * zoom, stageRef.current?.clientWidth || 0) : '100%',
                    height: svgBounds ? Math.max(svgBounds.height * zoom, stageRef.current?.clientHeight || 0) : '100%',
                  }}
                >
                  <div
                    className="canvas-mermaid-pane__svg"
                    style={{
                      width: svgBounds ? svgBounds.width : undefined,
                      height: svgBounds ? svgBounds.height : undefined,
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left',
                    }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
