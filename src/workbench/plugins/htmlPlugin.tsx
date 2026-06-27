import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkbenchDocument } from '../types';
import type { WorkbenchRendererPlugin } from './types';
import { wrapArtifactHtml } from '../../utils/artifactShell';
import { useCanvas } from '../../contexts/CanvasContext';

// 内容以此固定宽度在 iframe 内排版（相当于一块"画布纸"），再整体缩放到面板大小。
const BASE_WIDTH = 1100;
const DEFAULT_RATIO = 0.62;
// 放大上限：内容比面板小时允许放大铺满，但不无限放大以免糊。
const MAX_SCALE = 2;

function HtmlPreviewViewport({ document }: { document: WorkbenchDocument }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState<number>(Math.round(BASE_WIDTH * DEFAULT_RATIO));
  const [scale, setScale] = useState<number>(1);
  // 内容（按缩放后）是否超出面板可视高度——超出时改用"顶部对齐+纵向滚动"，
  // 而不是把整张画布硬缩到能塞进一屏。曾经为了"整图零滚动"按高度反推缩放，
  // 长文档(如长篇 skill 方案)动辄四五千像素高，缩放比例被拉到 0.1~0.2，
  // 文字直接缩成几乎不可读的一小块——这是真实事故，不是假设场景。
  const [overflowing, setOverflowing] = useState(false);
  const { onNodeInspect } = useCanvas();

  // Inject the Claude-style design-system shell (reset + font stack + tokens +
  // 尺寸上报脚本) so raw AI HTML/SVG renders polished and可被父层量到真实高度。
  const srcDoc = useMemo(() => wrapArtifactHtml(document.content), [document.content]);

  // iframe 内脚本通过 postMessage 上报：①内容真实高度（缩放用）②点击解释（点节点→追问）
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { __octArtifactSize?: boolean; height?: number; __octArtifactInspect?: boolean; label?: string } | null;
      if (!data) return;
      if (data.__octArtifactSize) {
        const h = Math.max(120, Math.round(Number(data.height) || 0));
        if (h) setContentHeight(h);
        return;
      }
      if (data.__octArtifactInspect) {
        const label = String(data.label || '').trim();
        if (label) onNodeInspect?.(label);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onNodeInspect]);

  // 宽度优先铺满：按面板宽把"画布纸"铺满（消灭右侧 pillarbox 留白），不再按高度
  // 反推缩放——那样会把长文档硬缩到不可读。铺满后如果比面板高，就让它纵向
  // 滚动（见下方 JSX 的 overflowY），而不是继续缩小。允许放大（上限 MAX_SCALE）。
  const recompute = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (!sw || !sh) return;
    const widthFit = sw / BASE_WIDTH;
    const next = Math.min(widthFit, MAX_SCALE);
    setScale(next > 0 ? next : 1);
    setOverflowing(contentHeight * next > sh);
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
        style={{
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          alignItems: overflowing ? 'flex-start' : 'center',
          justifyContent: 'center',
        }}
      >
        {/* 外层 sizer：布局盒子大小=缩放后的真实视觉大小，滚动条按这个量算，
            和内层 transform:scale 的视觉效果对齐（transform 本身不改变布局尺寸，
            需要这层 sizer 才能让"滚动距离"和"看到的内容"一致）。 */}
        <div
          className="canvas-ui-frame-wrap"
          style={{
            width: Math.round(BASE_WIDTH * scale),
            height: Math.round(contentHeight * scale),
            flex: '0 0 auto',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: BASE_WIDTH,
              height: contentHeight,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              position: 'absolute',
              top: 0,
              left: 0,
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
