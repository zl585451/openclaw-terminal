import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';

let mermaidInitialized = false;

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

export default function MermaidRenderer({ content }: { content: string }) {
  const graphId = useId().replace(/:/g, '_');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const clampZoom = (value: number) => Math.min(2.6, Math.max(0.55, value));

  const fitToStage = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const svgNode = stage.querySelector('svg');
    if (!svgNode) return;

    const stageWidth = stage.clientWidth;
    const rawWidth = svgNode.viewBox?.baseVal?.width || svgNode.getBBox?.().width || svgNode.clientWidth;
    if (!stageWidth || !rawWidth) return;

    // Leave horizontal breathing room so labels are less likely to touch viewport edges.
    const nextZoom = clampZoom((stageWidth * 0.92) / rawWidth);
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

      if (!mermaidInitialized) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'base',
          themeVariables: {
            background: '#0f141c',
            primaryColor: '#f5f8ff',
            primaryTextColor: '#0f1725',
            primaryBorderColor: '#4f6b95',
            lineColor: '#8ea8cc',
            secondaryColor: '#dbe8ff',
            secondaryBorderColor: '#5f7fae',
            secondaryTextColor: '#0f1725',
            tertiaryColor: '#e8f0ff',
            tertiaryBorderColor: '#6d8ebf',
            tertiaryTextColor: '#0f1725',
            mainBkg: '#f5f8ff',
            textColor: '#dbe7ff',
            nodeTextColor: '#0f1725',
            fontSize: '15px',
            edgeLabelBackground: '#f0f6ff',
            clusterBkg: '#1a2432',
            clusterBorder: '#5878a7',
          },
        });
        mermaidInitialized = true;
      }

      try {
        const { svg: nextSvg } = await mermaid.render(`oct_mermaid_${graphId}`, source);
        if (!cancelled) {
          setSvg(nextSvg);
          setError(null);
          requestAnimationFrame(() => {
            fitToStage();
          });
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
  }, [content, graphId]);

  if (error) {
    return (
      <div className="canvas-mermaid-fallback">
        <div className="canvas-mermaid-error">Mermaid render failed: {error}</div>
        <pre className="canvas-code-preview">{extractMermaidSource(content)}</pre>
      </div>
    );
  }

  return (
    <div className="canvas-mermaid-preview">
      <div className="canvas-mermaid-toolbar">
        <button type="button" className="canvas-mermaid-btn" onClick={() => setZoom((value) => clampZoom(value - 0.15))}>
          -
        </button>
        <button type="button" className="canvas-mermaid-btn" onClick={fitToStage}>
          Fit
        </button>
        <button type="button" className="canvas-mermaid-btn" onClick={() => setZoom(1)}>
          Reset
        </button>
        <button type="button" className="canvas-mermaid-btn" onClick={() => setZoom((value) => clampZoom(value + 0.15))}>
          +
        </button>
      </div>
      <div className="canvas-mermaid-stage" ref={stageRef}>
        <div
          className="canvas-mermaid-zoom"
          style={{ transform: `scale(${zoom})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
