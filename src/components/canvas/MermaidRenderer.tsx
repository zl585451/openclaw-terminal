import { useEffect, useId, useState } from 'react';
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
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.4);

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
          theme: 'dark',
        });
        mermaidInitialized = true;
      }

      try {
        const { svg: nextSvg } = await mermaid.render(`oct_mermaid_${graphId}`, source);
        if (!cancelled) {
          setSvg(nextSvg);
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
        <button type="button" className="canvas-mermaid-btn" onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}>
          -
        </button>
        <button type="button" className="canvas-mermaid-btn" onClick={() => setZoom(1.4)}>
          Reset
        </button>
        <button type="button" className="canvas-mermaid-btn" onClick={() => setZoom((value) => Math.min(3, value + 0.2))}>
          +
        </button>
      </div>
      <div className="canvas-mermaid-stage">
        <div
          className="canvas-mermaid-zoom"
          style={{ transform: `scale(${zoom})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
