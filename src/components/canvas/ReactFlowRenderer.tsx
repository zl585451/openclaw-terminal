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
import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  BackgroundVariant,
} from '@xyflow/react';
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

const GAP_MAIN = 220;   // spacing along main axis (between levels)
const GAP_CROSS = 100;  // spacing along cross axis (between siblings)

function computeLayout(
  nodes: RFNodeDef[],
  edges: RFEdgeDef[],
  direction: 'LR' | 'TB' | 'RL' | 'BT',
): Map<string, { x: number; y: number }> {
  // Build adjacency
  const outEdges = new Map<string, string[]>();
  const inDegree  = new Map<string, number>();
  nodes.forEach((n) => { outEdges.set(n.id, []); inDegree.set(n.id, 0); });
  edges.forEach((e) => {
    if (outEdges.has(e.source) && inDegree.has(e.target)) {
      outEdges.get(e.source)!.push(e.target);
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

  byDepth.forEach((ids, d) => {
    const total = ids.length;
    ids.forEach((id, i) => {
      const mainAxis = d * GAP_MAIN;
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
  shape?: RFNodeDef['shape'];
  colorScheme: { bg: string; border: string; text: string };
}

function OCTNode({ data }: NodeProps<Node<OCTNodeData>>) {
  const { label, colorScheme } = data;
  return (
    <div
      className="oct-rf-node"
      style={{
        background: colorScheme.bg,
        borderColor: colorScheme.border,
        color: colorScheme.text,
      }}
    >
      <Handle type="target" position={Position.Left}  className="oct-rf-handle" />
      <Handle type="target" position={Position.Top}   className="oct-rf-handle" />
      <span className="oct-rf-node-label">{label}</span>
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
        data: { label: n.label, shape: n.shape ?? 'rect', colorScheme } satisfies OCTNodeData,
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

  const onInit = useCallback((instance: any) => {
    // fitView after a short delay so the layout has settled
    setTimeout(() => instance.fitView({ padding: 0.18, duration: 300 }), 60);
  }, []);

  if (!data) {
    return (
      <div className="oct-rf-error">
        <span>⚠ 无法解析图表数据</span>
        <pre>{content}</pre>
      </div>
    );
  }

  return (
    <div className="oct-rf-wrapper">
      {data.title && <div className="oct-rf-title">{data.title}</div>}
      <div className="oct-rf-canvas">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onInit={onInit}
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
