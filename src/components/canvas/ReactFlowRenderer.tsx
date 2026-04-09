/**
 * ReactFlowRenderer — Canvas 复杂结构图渲染器
 *
 * 接受 AI 生成的 react-flow JSON，自动布局后在 React Flow 画布上渲染。
 * 不依赖 dagre/elk，使用内置 BFS 分层布局算法。
 *
 * JSON 格式：
 * {
 *   "nodes": [{ "id":"a", "label":"节点A", "group":"分组1" }],
 *   "edges": [{ "source":"a", "target":"b", "label":"关系" }],
 *   "direction": "LR" | "TB",   // 默认 LR
 *   "title": "可选标题"
 * }
 */
import { useMemo, useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import { useCanvas } from '../../contexts/CanvasContext';
import '@xyflow/react/dist/style.css';
import './ReactFlowRenderer.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RFNodeDef {
  id: string;
  label: string;
  group?: string;
  shape?: 'rect' | 'diamond' | 'circle' | 'stadium';
}

interface RFEdgeDef {
  source: string;
  target: string;
  label?: string;
  style?: 'solid' | 'dashed';
}

interface RFGraphData {
  nodes: RFNodeDef[];
  edges: RFEdgeDef[];
  direction?: 'LR' | 'TB' | 'RL' | 'BT';
  title?: string;
}

// ─── Group colour palette (read from CSS vars at render time) ─────────────────
const GROUP_PALETTE = [
  { bg: 'var(--rf-group-1-bg)', border: 'var(--rf-group-1-border)', text: 'var(--rf-group-1-text)' },
  { bg: 'var(--rf-group-2-bg)', border: 'var(--rf-group-2-border)', text: 'var(--rf-group-2-text)' },
  { bg: 'var(--rf-group-3-bg)', border: 'var(--rf-group-3-border)', text: 'var(--rf-group-3-text)' },
  { bg: 'var(--rf-group-4-bg)', border: 'var(--rf-group-4-border)', text: 'var(--rf-group-4-text)' },
  { bg: 'var(--rf-group-5-bg)', border: 'var(--rf-group-5-border)', text: 'var(--rf-group-5-text)' },
  { bg: 'var(--rf-group-6-bg)', border: 'var(--rf-group-6-border)', text: 'var(--rf-group-6-text)' },
];

// ─── BFS layout ───────────────────────────────────────────────────────────────

const GAP_MAIN  = 280;  // spacing along main axis (between levels)
const GAP_CROSS = 150;  // spacing along cross axis (between siblings)
// Estimated node dimensions for layout (actual size depends on label length + CSS)
const EST_NODE_W = 180;
const EST_NODE_H = 48;

function computeLayout(
  nodes: RFNodeDef[],
  edges: RFEdgeDef[],
  direction: 'LR' | 'TB' | 'RL' | 'BT',
): Map<string, { x: number; y: number }> {
  // Build adjacency
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  const inDegree  = new Map<string, number>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  nodes.forEach((n) => {
    outEdges.set(n.id, []);
    inEdges.set(n.id, []);
    inDegree.set(n.id, 0);
  });
  edges.forEach((e) => {
    if (outEdges.has(e.source) && inDegree.has(e.target)) {
      outEdges.get(e.source)!.push(e.target);
      inEdges.get(e.target)!.push(e.source);
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
  });

  // BFS from roots
  const roots = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0].id); // fallback

  const depth   = new Map<string, number>();
  const queue   = [...roots];
  roots.forEach((id) => depth.set(id, 0));

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = depth.get(cur) ?? 0;
    for (const next of outEdges.get(cur) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }

  // Assign any unreachable nodes to last level + 1
  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1); });

  // Group by depth → assign cross-axis position
  const byDepth = new Map<number, string[]>();
  nodes.forEach((n) => {
    const d = depth.get(n.id)!;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n.id);
  });

  const positions = new Map<string, { x: number; y: number }>();
  const isLR = direction === 'LR' || direction === 'RL';
  const reverseMainAxis = direction === 'RL' || direction === 'BT';
  const levelOrder = new Map<string, number>();

  const getBarycenter = (nodeId: string): number | null => {
    const parents = (inEdges.get(nodeId) ?? []).filter((id) => levelOrder.has(id));
    if (parents.length === 0) return null;
    const sum = parents.reduce((acc, id) => acc + (levelOrder.get(id) ?? 0), 0);
    return sum / parents.length;
  };

  Array.from(byDepth.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([d, ids]) => {
    ids.sort((a, b) => {
      const baryA = getBarycenter(a);
      const baryB = getBarycenter(b);
      if (baryA != null && baryB != null && baryA !== baryB) return baryA - baryB;
      if (baryA != null && baryB == null) return -1;
      if (baryA == null && baryB != null) return 1;

      const groupA = nodeMap.get(a)?.group ?? '';
      const groupB = nodeMap.get(b)?.group ?? '';
      if (groupA !== groupB) return groupA.localeCompare(groupB, 'zh-CN');

      const outA = outEdges.get(a)?.length ?? 0;
      const outB = outEdges.get(b)?.length ?? 0;
      if (outA !== outB) return outB - outA;

      return (nodeMap.get(a)?.label ?? a).localeCompare(nodeMap.get(b)?.label ?? b, 'zh-CN');
    });

    const total = ids.length;
    ids.forEach((id, i) => {
      levelOrder.set(id, i);
      const mainAxis = d * GAP_MAIN * (reverseMainAxis ? -1 : 1);
      // Centre the group around 0 on the cross axis
      const crossAxis = (i - (total - 1) / 2) * GAP_CROSS;
      positions.set(id, isLR
        ? { x: mainAxis, y: crossAxis }
        : { x: crossAxis, y: mainAxis });
    });
  });

  return positions;
}

// ─── Custom node component ────────────────────────────────────────────────────

interface OCTNodeData extends Record<string, unknown> {
  label: string;
  group?: string;
  shape?: RFNodeDef['shape'];
  colorScheme: { bg: string; border: string; text: string };
  /** Set by FlowCanvas when this node is selected */
  selected?: boolean;
}

function OCTNode({ data }: NodeProps<Node<OCTNodeData>>) {
  const { label, colorScheme, selected } = data;
  return (
    <div
      className={`oct-rf-node${selected ? ' oct-rf-node--selected' : ''}`}
      style={{
        background: colorScheme.bg,
        borderColor: colorScheme.border,
        color: colorScheme.text,
      }}
      title="点击让 AI 解释此节点"
    >
      <Handle type="target" position={Position.Left}  className="oct-rf-handle" />
      <Handle type="target" position={Position.Top}   className="oct-rf-handle" />
      <span className="oct-rf-node-label">{label}</span>
      {selected && <span className="oct-rf-node-inspect-hint">💬</span>}
      <Handle type="source" position={Position.Right}  className="oct-rf-handle" />
      <Handle type="source" position={Position.Bottom} className="oct-rf-handle" />
    </div>
  );
}

const NODE_TYPES = { octNode: OCTNode };

// ─── Main renderer ────────────────────────────────────────────────────────────

interface ReactFlowRendererProps {
  content: string; // raw JSON string from CanvasDocument
}

function parseContent(raw: string): RFGraphData | null {
  const s = raw.trim();
  // Strip markdown code fence if AI wrapped the JSON
  const jsonStr = s.startsWith('```')
    ? s.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    : s;
  try {
    return JSON.parse(jsonStr) as RFGraphData;
  } catch {
    return null;
  }
}

// ─── PNG export: build a static SVG from measured node/edge positions ────────

function buildExportSvg(
  nodes: Node[],
  edges: Edge[],
  title?: string,
): string {
  if (!nodes.length) return '';

  const PAD = 40;
  const NW  = EST_NODE_W;  // estimated node width for export SVG
  const NH  = EST_NODE_H;
  const R   = 10;          // corner radius

  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((n) => {
    const w = (n.measured?.width  ?? (n as any).width  ?? NW);
    const h = (n.measured?.height ?? (n as any).height ?? NH);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  });

  const titleH = title ? 28 : 0;
  const svgW = (maxX - minX) + PAD * 2;
  const svgH = (maxY - minY) + PAD * 2 + titleH;
  const ox = PAD - minX;   // origin offset
  const oy = PAD - minY + titleH;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    `<rect width="100%" height="100%" fill="#0d1117"/>`,
  ];

  if (title) {
    lines.push(
      `<text x="${svgW / 2}" y="20" text-anchor="middle" font-family="sans-serif" ` +
      `font-size="14" font-weight="600" fill="#c9d1d9">${escXml(title)}</text>`
    );
  }

  // Edges (draw behind nodes)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  edges.forEach((e) => {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) return;
    const sw = (s.measured?.width  ?? s.width  ?? NW);
    const sh = (s.measured?.height ?? s.height ?? NH);
    const tw = (t.measured?.width  ?? t.width  ?? NW);
    const th = (t.measured?.height ?? t.height ?? NH);
    const x1 = s.position.x + sw / 2 + ox;
    const y1 = s.position.y + sh / 2 + oy;
    const x2 = t.position.x + tw / 2 + ox;
    const y2 = t.position.y + th / 2 + oy;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const edgeLabel = typeof e.label === 'string' ? e.label : '';
    lines.push(
      `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" ` +
      `fill="none" stroke="#4a7fa8" stroke-width="1.5" marker-end="url(#arr)"/>`
    );
    if (edgeLabel) {
      lines.push(
        `<text x="${mx}" y="${my - 4}" text-anchor="middle" font-family="sans-serif" ` +
        `font-size="11" fill="#8b949e">${escXml(edgeLabel)}</text>`
      );
    }
  });

  // Nodes
  nodes.forEach((n) => {
    const w  = (n.measured?.width  ?? n.width  ?? NW);
    const h  = (n.measured?.height ?? n.height ?? NH);
    const x  = n.position.x + ox;
    const y  = n.position.y + oy;
    const cs = (n.data as OCTNodeData).colorScheme;
    // color-mix() isn't understood by SVG renderers — use flat fallback colour
    const bg     = '#1c2a38';
    const border = cs?.border ?? '#4a7fa8';
    const label  = String((n.data as OCTNodeData).label ?? n.id);
    lines.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${R}" ry="${R}" ` +
      `fill="${bg}" stroke="${border}" stroke-width="1.5"/>`,
      `<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" ` +
      `font-family="sans-serif" font-size="12" font-weight="600" fill="#e6edf3">${escXml(label)}</text>`
    );
  });

  lines.push(
    `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" ` +
    `markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#4a7fa8"/></marker></defs>`,
    `</svg>`
  );
  return lines.join('\n');
}

function escXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function svgToPng(svgStr: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth  * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG render failed')); };
    img.src = url;
  });
}

// ─── Inner canvas (needs to be inside ReactFlowProvider to use useReactFlow) ──

interface FlowCanvasProps {
  rfNodes: Node[];
  rfEdges: Edge[];
  title?: string;
}

function FlowCanvas({ rfNodes, rfEdges, title }: FlowCanvasProps) {
  const { fitView, getNodes, getEdges } = useReactFlow();
  const [exporting, setExporting] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { onNodeInspect } = useCanvas();

  // Re-centre whenever the node/edge set changes (e.g. after initial mount)
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.18, duration: 300 }), 150);
    return () => clearTimeout(t);
  }, [rfNodes, rfEdges, fitView]);

  // Clear selection when graph data changes
  useEffect(() => { setSelectedNodeId(null); }, [rfNodes]);

  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    const nodeData = node.data as OCTNodeData;
    setSelectedNodeId(node.id);
    onNodeInspect?.(nodeData.label, nodeData.group);
  }, [onNodeInspect]);

  // Inject selected flag into node data
  const displayNodes = useMemo(
    () => rfNodes.map((n) => ({
      ...n,
      data: { ...n.data, selected: n.id === selectedNodeId },
    })),
    [rfNodes, selectedNodeId]
  );

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // Use measured node positions/sizes from live React Flow state
      const liveNodes = getNodes();
      const liveEdges = getEdges();
      const svgStr = buildExportSvg(liveNodes, liveEdges, title);
      if (!svgStr) return;
      const pngUrl = await svgToPng(svgStr);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `reactflow-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn('[ReactFlowRenderer] Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [exporting, getNodes, getEdges, title]);

  return (
    <div className="oct-rf-wrapper">
      <div className="oct-rf-titlebar">
        {title
          ? <span className="oct-rf-title">{title}</span>
          : <span />
        }
        <button
          className="oct-rf-export-btn"
          onClick={handleExport}
          disabled={exporting}
          title="Export as PNG"
        >
          {exporting ? 'Exporting…' : 'PNG'}
        </button>
      </div>
      <div className="oct-rf-canvas">
        <ReactFlow
          nodes={displayNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.2}
          maxZoom={2.5}
          attributionPosition="bottom-right"
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="var(--border-subtle, rgba(255,255,255,0.06))"
          />
          <Controls
            className="oct-rf-controls"
            showInteractive={false}
          />
          <MiniMap
            className="oct-rf-minimap"
            nodeColor="var(--mermaid-node-fill, #2b448e)"
            maskColor="rgba(0,0,0,0.35)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export default function ReactFlowRenderer({ content }: ReactFlowRendererProps) {
  const data = useMemo(() => parseContent(content), [content]);

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!data || !Array.isArray(data.nodes)) return { rfNodes: [], rfEdges: [] };

    const direction = (data.direction ?? 'LR') as 'LR' | 'TB' | 'RL' | 'BT';
    const positions = computeLayout(data.nodes, data.edges ?? [], direction);

    // Map group names → colour index
    const groupIndex = new Map<string, number>();
    data.nodes.forEach((n) => {
      if (n.group && !groupIndex.has(n.group)) {
        groupIndex.set(n.group, groupIndex.size % GROUP_PALETTE.length);
      }
    });

    const rfNodes: Node[] = data.nodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      const idx = n.group != null ? (groupIndex.get(n.group) ?? 0) : 0;
      const colorScheme = GROUP_PALETTE[idx];
      return {
        id: n.id,
        type: 'octNode',
        position: pos,
        data: { label: n.label, group: n.group, shape: n.shape ?? 'rect', colorScheme } satisfies OCTNodeData,
      };
    });

    const rfEdges: Edge[] = (data.edges ?? []).map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'smoothstep',
      animated: false,
      style: { stroke: 'var(--mermaid-line, #8ea2ff)', strokeWidth: 1.5 },
      labelStyle: { fill: 'var(--text-secondary)', fontSize: 12 },
      labelBgStyle: { fill: 'var(--bg-panel)', fillOpacity: 0.85 },
      ...(e.style === 'dashed' ? { strokeDasharray: '5,4' } : {}),
    }));

    return { rfNodes, rfEdges };
  }, [data]);

  if (!data) {
    return (
      <div className="oct-rf-error">
        <span>⚠ 无法解析图表数据</span>
        <pre>{content}</pre>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <FlowCanvas rfNodes={rfNodes} rfEdges={rfEdges} title={data.title} />
    </ReactFlowProvider>
  );
}
