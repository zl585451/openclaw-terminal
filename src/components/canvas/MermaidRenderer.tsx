import { useEffect, useId, useMemo, useState } from 'react';
import mermaid from 'mermaid';
import { normalizeDiagramContent } from '../../utils/diagramSchema';

function extractMermaidSource(content: string): string {
  const trimmed = (content || '').trim();
  const fenced = trimmed.match(/```mermaid\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const lines = trimmed.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    /^(flowchart|graph|sequencediagram|classdiagram|erdiagram|statediagram|gantt|pie|mindmap|journey|timeline|quadrantchart|requirementdiagram|gitgraph)\b/i
      .test(line.trim())
  );
  return startIndex >= 0 ? lines.slice(startIndex).join('\n').trim() : trimmed;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getThemeVariables() {
  const accent = cssVar('--mermaid-node-border', cssVar('--accent-primary', '#d4764e'));
  const stageBg = cssVar('--mermaid-stage-bg', cssVar('--bg-code', '#1e1d1a'));
  const panelBg = cssVar('--mermaid-cluster-fill', cssVar('--bg-panel', '#353430'));
  const textPrimary = cssVar('--text-primary', '#e8e4dd');
  const textSecondary = cssVar('--mermaid-cluster-text', cssVar('--text-secondary', '#b9aea0'));
  const nodeFill = cssVar('--mermaid-node-fill', '#6c4c3b');
  const nodeText = cssVar('--mermaid-node-text', '#fff6ed');

  return {
    background: stageBg,
    primaryColor: nodeFill,
    primaryTextColor: nodeText,
    primaryBorderColor: accent,
    lineColor: accent,
    secondaryColor: nodeFill,
    secondaryBorderColor: accent,
    secondaryTextColor: nodeText,
    tertiaryColor: nodeFill,
    tertiaryBorderColor: accent,
    tertiaryTextColor: nodeText,
    mainBkg: nodeFill,
    textColor: textPrimary,
    nodeTextColor: nodeText,
    edgeLabelBackground: panelBg,
    clusterBkg: panelBg,
    clusterBorder: accent,
    titleColor: textPrimary,
    actorTextColor: textPrimary,
    labelTextColor: textSecondary,
    noteBkgColor: nodeFill,
    noteTextColor: nodeText,
    noteBorderColor: accent,
    pie1: cssVar('--mermaid-pie-1', '#b06840'),
    pie2: cssVar('--mermaid-pie-2', '#3f9090'),
    pie3: cssVar('--mermaid-pie-3', '#a88840'),
    pie4: cssVar('--mermaid-pie-4', '#806890'),
    pie5: cssVar('--mermaid-pie-5', '#4e9258'),
    pie6: cssVar('--mermaid-pie-6', '#a05870'),
    pie7: cssVar('--mermaid-pie-7', '#4878a0'),
    pie8: cssVar('--mermaid-pie-8', '#8a7840'),
  };
}

export default function MermaidRenderer({ content }: { content: string }) {
  const graphId = useId().replace(/:/g, '_');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);

  const source = useMemo(
    () => normalizeDiagramContent(extractMermaidSource(content)),
    [content]
  );

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (!source) {
        setSvg('');
        setError(null);
        return;
      }

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'base',
        flowchart: { useMaxWidth: false, nodeSpacing: 50, rankSpacing: 68, curve: 'basis' },
        themeVariables: getThemeVariables(),
      });

      try {
        const renderId = `oct_mermaid_${graphId}_${Date.now()}`;
        const stale = document.getElementById(renderId);
        if (stale) stale.remove();
        const result = await mermaid.render(renderId, source);
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (err) {
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
  }, [graphId, source]);

  if (error) {
    return (
      <div className="canvas-mermaid-fallback">
        <div className="canvas-mermaid-error">Mermaid render failed: {error}</div>
        <pre className="canvas-code-preview">{source}</pre>
      </div>
    );
  }

  return (
    <div className="canvas-mermaid-preview">
      <div className="canvas-mermaid-stage">
        <div className="canvas-mermaid-stage-inner">
          <div className="canvas-mermaid-zoom" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>
    </div>
  );
}
