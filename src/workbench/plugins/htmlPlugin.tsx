import { useMemo, useState } from 'react';
import type { WorkbenchDocument } from '../types';
import type { WorkbenchRendererPlugin } from './types';

type ViewportKey = 'desktop' | 'tablet' | 'mobile';

const VIEWPORTS: Record<ViewportKey, { label: string; width: number; height: number }> = {
  desktop: { label: 'Desktop', width: 1280, height: 800 },
  tablet: { label: 'Tablet', width: 834, height: 1112 },
  mobile: { label: 'Mobile', width: 390, height: 844 },
};

function HtmlPreviewViewport({ document }: { document: WorkbenchDocument }) {
  const [viewport, setViewport] = useState<ViewportKey>('desktop');
  const viewportDef = VIEWPORTS[viewport];

  const frameStyle = useMemo(() => ({
    width: `${viewportDef.width}px`,
    height: `${viewportDef.height}px`,
  }), [viewportDef.height, viewportDef.width]);

  return (
    <div className="canvas-preview canvas-ui-preview">
      <div className="canvas-ui-toolbar">
        {Object.entries(VIEWPORTS).map(([key, def]) => (
          <button
            key={key}
            type="button"
            className={`canvas-ui-viewport-btn${viewport === key ? ' active' : ''}`}
            onClick={() => setViewport(key as ViewportKey)}
          >
            {def.label}
          </button>
        ))}
        <span className="canvas-ui-viewport-size">{viewportDef.width} x {viewportDef.height}</span>
      </div>
      <div className="canvas-ui-stage">
        <div className="canvas-ui-frame-wrap" style={frameStyle}>
          <iframe
            className="canvas-html-preview"
            srcDoc={document.content}
            sandbox="allow-scripts"
            title="HTML Preview"
          />
        </div>
      </div>
    </div>
  );
}

export const htmlPlugin: WorkbenchRendererPlugin = {
  id: 'html',
  canRender: (document) => document.mode === 'html',
  render: (document) => (
    <HtmlPreviewViewport document={document} />
  ),
  getExportFilename: () => 'canvas.html',
};
