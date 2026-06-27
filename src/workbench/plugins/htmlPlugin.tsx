import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkbenchDocument } from '../types';
import type { WorkbenchRendererPlugin } from './types';
import { wrapArtifactHtml } from '../../utils/artifactShell';

// 内容以此固定宽度在 iframe 内排版（相当于一块"画布纸"），再整体缩放到面板大小。
// 这样无论内容是响应式还是定宽，都能"整图一屏可见、零滚动"。
const BASE_WIDTH = 1100;
const DEFAULT_RATIO = 0.62;
// 放大上限：内容比面板小时允许放大铺满，但不无限放大以免糊。
const MAX_SCALE = 2;

function HtmlPreviewViewport({ document }: { document: WorkbenchDocument }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState<number>(Math.round(BASE_WIDTH * DEFAULT_RATIO));
  const [scale, setScale] = useState<number>(1);

  // Inject the Claude-style design-system shell (reset + font stack + tokens +
  // 尺寸上报脚本) so raw AI HTML/SVG renders polished and可被父层量到真实高度。
  const srcDoc = useMemo(() => wrapArtifactHtml(document.content), [document.content]);

  // iframe 内脚本通过 postMessage 上报内容真实高度（在 BASE_WIDTH 下排版后的高度）
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { __octArtifactSize?: boolean; height?: number } | null;
      if (!data || !data.__octArtifactSize) return;
      const h = Math.max(120, Math.round(Number(data.height) || 0));
      if (h) setContentHeight(h);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 宽度优先铺满 + 零滚动兜底：
  // 先按面板宽把"画布纸"铺满（消灭右侧 pillarbox 留白）；只有当铺满后
  // 高度会溢出面板时，才退回等比缩放保证不出现滚动条。允许放大（上限 MAX_SCALE）。
  const recompute = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (!sw || !sh) return;
    const widthFit = sw / BASE_WIDTH;
    const wouldOverflow = contentHeight * widthFit > sh;
    const raw = wouldOverflow ? Math.min(widthFit, sh / contentHeight) : widthFit;
    const next = Math.min(raw, MAX_SCALE);
    setScale(next > 0 ? next : 1);
  }, [contentHeight]);

  useEffect(() => { recompute(); }, [recompute]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [recompute]);

  return (
    <div className="canvas-preview canvas-ui-preview">
      <div
        className="canvas-ui-stage canvas-ui-stage--fit"
        ref={stageRef}
        style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div
          className="canvas-ui-frame-wrap"
          style={{
            width: BASE_WIDTH,
            height: contentHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            flex: '0 0 auto',
          }}
        >
          <iframe
            className="canvas-html-preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            title="HTML Preview"
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
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
