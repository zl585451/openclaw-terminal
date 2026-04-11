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
  MarkerType,
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

const MIN_NODE_W = 140;
const MAX_NODE_W = 220;
const MIN_NODE_H = 48;
const LAYOUT_SOFT_LIMIT = 12;
const LAYOUT_HARD_LIMIT = 18;
const LAYOUT_ABSOLUTE_LIMIT = 24;
const EXPORT_EST_NODE_W = 180;
const EXPORT_EST_NODE_H = 48;

interface EstimatedNodeSize {
  width: number;
  height: number;
}

interface LayoutDiagnostics {
  nodeCount: number;
  edgeCount: number;
  maxLevelWidth: number;
  density: number;
  recommendedMaxNodes: number;
  hardMaxNodes: number;
}

function estimateNodeSize(label: string): EstimatedNodeSize {
  const text = String(label || '').trim();
  const chars = Math.max(1, text.length);
  const estimatedLines = Math.max(1, Math.ceil(chars / 12));
  const width = Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, 132 + Math.min(chars, 22) * 4));
  const height = Math.max(MIN_NODE_H, 28 + estimatedLines * 18);
  return { width, height };
}

function computeAdaptiveSpacing(nodeCount: number, edgeCount: number, maxLevelWidth: number) {
  const density = edgeCount / Math.max(1, nodeCount);
  const crowdedLevelBoost = Math.max(0, maxLevelWidth - 3);
  const largeGraphBoost = nodeCount > LAYOUT_SOFT_LIMIT ? Math.min(120, (nodeCount - LAYOUT_SOFT_LIMIT) * 16) : 0;
  const denseBoost = density > 1.2 ? 56 : density > 0.85 ? 28 : 0;

  return {
    gapMain: 250 + largeGraphBoost + denseBoost + crowdedLevelBoost * 14,
    gapCross: 120 + Math.min(100, crowdedLevelBoost * 22) + (nodeCount > LAYOUT_SOFT_LIMIT ? 24 : 0),
    gapGroup: 80 + Math.min(50, crowdedLevelBoost * 10),
    density,
  };
}

function getHandlePositions(direction: 'LR' | 'TB' | 'RL' | 'BT') {
  if (direction === 'TB') return { source: Position.Bottom, target: Position.Top };
  if (direction === 'BT') return { source: Position.Top, target: Position.Bottom };
  if (direction === 'RL') return { source: Position.Left, target: Position.Right };
  return { source: Position.Right, target: Position.Left };
}

function computeLayout(
  nodes: RFNodeDef[],
  edges: RFEdgeDef[],
  direction: 'LR' | 'TB' | 'RL' | 'BT',
): {
  positions: Map<string, { x: number; y: number }>;
  nodeSizes: Map<string, EstimatedNodeSize>;
  diagnostics: LayoutDiagnostics;
} {
  if (!nodes.length) {
    return {
      positions: new Map(),
      nodeSizes: new Map(),
      diagnostics: {
        nodeCount: 0,
        edgeCount: 0,
        maxLevelWidth: 0,
        density: 0,
        recommendedMaxNodes: LAYOUT_SOFT_LIMIT,
        hardMaxNodes: LAYOUT_HARD_LIMIT,
      },
    };
  }

  // Build adjacency
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  const inDegree  = new Map<string, number>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nodeSizes = new Map(nodes.map((node) => [node.id, estimateNodeSize(node.label)]));
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

  // Split into weakly connected components so disconnected islands don't collapse
  // into one synthetic "last level".
  const undirected = new Map<string, Set<string>>();
  nodes.forEach((n) => undirected.set(n.id, new Set()));
  edges.forEach((e) => {
    if (!undirected.has(e.source) || !undirected.has(e.target)) return;
    undirected.get(e.source)!.add(e.target);
    undirected.get(e.target)!.add(e.source);
  });

  const components: string[][] = [];
  const seen = new Set<string>();
  nodes.forEach((n) => {
    if (seen.has(n.id)) return;
    const queue = [n.id];
    const component: string[] = [];
    seen.add(n.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      for (const next of undirected.get(cur) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    components.push(component);
  });

  const depth = new Map<string, number>();
  const componentDepths = new Map<string, Map<string, number>>();
  const componentLevels = new Map<string, number>();

  components.forEach((component) => {
    const componentSet = new Set(component);
    const localInDegree = new Map<string, number>();
    component.forEach((id) => {
      const incoming = (inEdges.get(id) ?? []).filter((parent) => componentSet.has(parent));
      localInDegree.set(id, incoming.length);
    });

    const queue = component
      .filter((id) => (localInDegree.get(id) ?? 0) === 0)
      .sort((a, b) => (nodeMap.get(a)?.label ?? a).localeCompare(nodeMap.get(b)?.label ?? b, 'zh-CN'));
    if (!queue.length) {
      queue.push(
        [...component].sort((a, b) => (nodeMap.get(a)?.label ?? a).localeCompare(nodeMap.get(b)?.label ?? b, 'zh-CN'))[0],
      );
    }

    const localDepth = new Map<string, number>();
    queue.forEach((id) => localDepth.set(id, 0));
    const pending = [...queue];

    while (pending.length > 0) {
      const cur = pending.shift()!;
      const curDepth = localDepth.get(cur) ?? 0;
      for (const next of outEdges.get(cur) ?? []) {
        if (!componentSet.has(next)) continue;
        const nextDepth = curDepth + 1;
        if (nextDepth > (localDepth.get(next) ?? -1)) {
          localDepth.set(next, nextDepth);
        }
        localInDegree.set(next, (localInDegree.get(next) ?? 0) - 1);
        if ((localInDegree.get(next) ?? 0) <= 0) {
          pending.push(next);
        }
      }
    }

    const maxKnownDepth = Math.max(0, ...localDepth.values(), 0);
    component.forEach((id) => {
      if (localDepth.has(id)) return;
      const parentDepths = (inEdges.get(id) ?? [])
        .filter((parent) => componentSet.has(parent))
        .map((parent) => localDepth.get(parent))
        .filter((value): value is number => value != null);
      localDepth.set(id, parentDepths.length ? Math.max(...parentDepths) + 1 : maxKnownDepth + 1);
    });

    const componentKey = component.join('|');
    componentDepths.set(componentKey, localDepth);
    componentLevels.set(componentKey, Math.max(0, ...localDepth.values(), 0) + 1);
  });

  // Group by depth → assign cross-axis position
  const maxLevelWidth = components.reduce((acc, component) => {
    const componentKey = component.join('|');
    const localDepth = componentDepths.get(componentKey);
    if (!localDepth) return acc;
    const levelCounts = new Map<number, number>();
    component.forEach((id) => {
      const d = localDepth.get(id) ?? 0;
      levelCounts.set(d, (levelCounts.get(d) ?? 0) + 1);
    });
    return Math.max(acc, ...levelCounts.values(), 0);
  }, 0);

  const { gapMain, gapCross, gapGroup, density } = computeAdaptiveSpacing(nodes.length, edges.length, maxLevelWidth);
  const diagnostics: LayoutDiagnostics = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    maxLevelWidth,
    density,
    recommendedMaxNodes: LAYOUT_SOFT_LIMIT,
    hardMaxNodes: LAYOUT_HARD_LIMIT,
  };

  const positions = new Map<string, { x: number; y: number }>();
  const isLR = direction === 'LR' || direction === 'RL';
  const reverseMainAxis = direction === 'RL' || direction === 'BT';

  let componentOffset = 0;
  components
    .sort((a, b) => b.length - a.length)
    .forEach((component) => {
      const componentKey = component.join('|');
      const localDepth = componentDepths.get(componentKey);
      if (!localDepth) return;
      const byDepth = new Map<number, string[]>();
      component.forEach((id) => {
        const d = localDepth.get(id) ?? 0;
        depth.set(id, d);
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d)!.push(id);
      });

      const levelOrder = new Map<string, number>();
      const getBarycenter = (nodeId: string, useParents: boolean): number | null => {
        const neighbors = (useParents ? inEdges.get(nodeId) : outEdges.get(nodeId)) ?? [];
        const known = neighbors.filter((id) => levelOrder.has(id));
        if (!known.length) return null;
        const sum = known.reduce((acc, id) => acc + (levelOrder.get(id) ?? 0), 0);
        return sum / known.length;
      };

      const sortLevel = (ids: string[], depthIndex: number, useParents: boolean) => {
        ids.sort((a, b) => {
          const baryA = getBarycenter(a, useParents);
          const baryB = getBarycenter(b, useParents);
          if (baryA != null && baryB != null && baryA !== baryB) return baryA - baryB;
          if (baryA != null && baryB == null) return -1;
          if (baryA == null && baryB != null) return 1;

          const groupA = nodeMap.get(a)?.group ?? '';
          const groupB = nodeMap.get(b)?.group ?? '';
          if (groupA !== groupB) return groupA.localeCompare(groupB, 'zh-CN');

          const degreeA = useParents ? (outEdges.get(a)?.length ?? 0) : (inEdges.get(a)?.length ?? 0);
          const degreeB = useParents ? (outEdges.get(b)?.length ?? 0) : (inEdges.get(b)?.length ?? 0);
          if (degreeA !== degreeB) return degreeB - degreeA;

          const labelCmp = (nodeMap.get(a)?.label ?? a).localeCompare(nodeMap.get(b)?.label ?? b, 'zh-CN');
          if (labelCmp !== 0) return labelCmp;
          return depthIndex;
        });

        ids.forEach((id, index) => levelOrder.set(id, index));
      };

      const depths = [...byDepth.keys()].sort((a, b) => a - b);
      depths.forEach((d) => sortLevel(byDepth.get(d) ?? [], d, true));
      [...depths].reverse().forEach((d) => sortLevel(byDepth.get(d) ?? [], d, false));

      const levelMainOffsets = new Map<number, number>();
      let cumulativeMain = 0;
      depths.forEach((d, index) => {
        if (index > 0) {
          const prevDepth = depths[index - 1];
          const prevNodes = byDepth.get(prevDepth) ?? [];
          const curNodes = byDepth.get(d) ?? [];
          const prevMainSize = Math.max(
            ...(prevNodes.map((id) => isLR ? (nodeSizes.get(id)?.width ?? EXPORT_EST_NODE_W) : (nodeSizes.get(id)?.height ?? EXPORT_EST_NODE_H))),
            isLR ? EXPORT_EST_NODE_W : EXPORT_EST_NODE_H,
          );
          const curMainSize = Math.max(
            ...(curNodes.map((id) => isLR ? (nodeSizes.get(id)?.width ?? EXPORT_EST_NODE_W) : (nodeSizes.get(id)?.height ?? EXPORT_EST_NODE_H))),
            isLR ? EXPORT_EST_NODE_W : EXPORT_EST_NODE_H,
          );
          cumulativeMain += (prevMainSize / 2) + gapMain + (curMainSize / 2);
        }
        levelMainOffsets.set(d, cumulativeMain);
      });

      const totalMainSpan = cumulativeMain;
      let maxCrossSpan = 0;
      depths.forEach((d) => {
        const ids = byDepth.get(d) ?? [];
        const centers: number[] = [];
        let currentCenter = 0;
        ids.forEach((id, i) => {
          const currentCrossSize = isLR
            ? (nodeSizes.get(id)?.height ?? EXPORT_EST_NODE_H)
            : (nodeSizes.get(id)?.width ?? EXPORT_EST_NODE_W);
          if (i === 0) {
            centers.push(0);
            return;
          }
          const prevId = ids[i - 1];
          const prevCrossSize = isLR
            ? (nodeSizes.get(prevId)?.height ?? EXPORT_EST_NODE_H)
            : (nodeSizes.get(prevId)?.width ?? EXPORT_EST_NODE_W);
          const prevGroup = nodeMap.get(prevId)?.group ?? '';
          const curGroup = nodeMap.get(id)?.group ?? '';
          currentCenter += (prevCrossSize / 2) + gapCross + (currentCrossSize / 2);
          if (prevGroup !== curGroup && (prevGroup || curGroup)) {
            currentCenter += gapGroup;
          }
          centers.push(currentCenter);
        });

        const minCenter = centers.reduce((min, value, i) => {
          const size = isLR
            ? (nodeSizes.get(ids[i])?.height ?? EXPORT_EST_NODE_H)
            : (nodeSizes.get(ids[i])?.width ?? EXPORT_EST_NODE_W);
          return Math.min(min, value - size / 2);
        }, 0);
        const maxCenter = centers.reduce((max, value, i) => {
          const size = isLR
            ? (nodeSizes.get(ids[i])?.height ?? EXPORT_EST_NODE_H)
            : (nodeSizes.get(ids[i])?.width ?? EXPORT_EST_NODE_W);
          return Math.max(max, value + size / 2);
        }, 0);
        const crossMid = (minCenter + maxCenter) / 2;
        maxCrossSpan = Math.max(maxCrossSpan, maxCenter - minCenter);

        ids.forEach((id, i) => {
          const rawMainAxis = levelMainOffsets.get(d) ?? 0;
          const mainAxis = reverseMainAxis ? totalMainSpan - rawMainAxis : rawMainAxis;
          const crossAxis = componentOffset + centers[i] - crossMid;
          positions.set(id, isLR
            ? { x: mainAxis, y: crossAxis }
            : { x: crossAxis, y: mainAxis });
        });
      });
      componentOffset += Math.max(maxCrossSpan + gapCross + EXPORT_EST_NODE_H, gapCross * 2.2);
      const levelCount = componentLevels.get(componentKey) ?? 1;
      if (!isLR && levelCount > 0) {
        componentOffset += EXPORT_EST_NODE_W / 2;
      }
    });

  return { positions, nodeSizes, diagnostics };
}

// ─── Custom node component ────────────────────────────────────────────────────

interface OCTNodeData extends Record<string, unknown> {
  label: string;
  group?: string;
  shape?: RFNodeDef['shape'];
  colorScheme: { bg: string; border: string; text: string };
  sourcePosition: Position;
  targetPosition: Position;
  /** Set by FlowCanvas when this node is selected */
  selected?: boolean;
}

function OCTNode({ data }: NodeProps<Node<OCTNodeData>>) {
  const { label, colorScheme, selected, sourcePosition, targetPosition } = data;
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
      <Handle type="target" position={targetPosition} className="oct-rf-handle" />
      <span className="oct-rf-node-label">{label}</span>
      {selected && <span className="oct-rf-node-inspect-hint">💬</span>}
      <Handle type="source" position={sourcePosition} className="oct-rf-handle" />
    </div>
  );
}

const NODE_TYPES = { octNode: OCTNode };

// ─── Main renderer ────────────────────────────────────────────────────────────

interface ReactFlowRendererProps {
  content: string; // raw JSON string from CanvasDocument
}

function extractLikelyJson(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const fenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    : trimmed;

  const tryParse = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  if (tryParse(fenced) !== null) return fenced;

  const start = fenced.search(/[\{\[]/);
  if (start < 0) return fenced;
  const opener = fenced[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < fenced.length; i += 1) {
    const ch = fenced[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth += 1;
    if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        return fenced.slice(start, i + 1);
      }
    }
  }
  return fenced.slice(start);
}

function parseContent(raw: string): RFGraphData | null {
  const jsonStr = extractLikelyJson(raw);
  try {
    const parsed = JSON.parse(jsonStr) as RFGraphData | RFGraphData[];
    if (Array.isArray(parsed)) {
      const firstGraph = parsed.find((item) => item && Array.isArray(item.nodes) && Array.isArray(item.edges)) || null;
      return normalizeGraphData(firstGraph);
    }
    return normalizeGraphData(parsed);
  } catch {
    return null;
  }
}

function normalizeGraphData(value: unknown): RFGraphData | null {
  if (!value || typeof value !== 'object') return null;

  const obj = value as Record<string, unknown>;
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
  if (!rawNodes.length) return null;

  const nodes: RFNodeDef[] = rawNodes
    .map((node, index): RFNodeDef | null => {
      if (!node || typeof node !== 'object') return null;
      const item = node as Record<string, unknown>;
      const id = String(item.id ?? `node_${index + 1}`).trim();
      const label = String(item.label ?? item.name ?? id).trim();
      if (!id || !label) return null;
      const shape = item.shape === 'rect' || item.shape === 'diamond' || item.shape === 'circle' || item.shape === 'stadium'
        ? item.shape
        : 'rect';
      const group = typeof item.group === 'string' && item.group.trim() ? item.group.trim() : undefined;
      return { id, label, group, shape } satisfies RFNodeDef;
    })
    .filter((node): node is RFNodeDef => Boolean(node));

  if (!nodes.length) return null;

  const knownIds = new Set(nodes.map((node) => node.id));
  const edges: RFEdgeDef[] = rawEdges
    .map((edge): RFEdgeDef | null => {
      if (!edge || typeof edge !== 'object') return null;
      const item = edge as Record<string, unknown>;
      // Be tolerant here: models sometimes output flowchart-style from/to
      // even when we asked for source/target.
      const source = String(item.source ?? item.from ?? '').trim();
      const target = String(item.target ?? item.to ?? '').trim();
      if (!source || !target || !knownIds.has(source) || !knownIds.has(target)) return null;
      const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : undefined;
      const style = item.style === 'dashed' ? 'dashed' : 'solid';
      return { source, target, label, style } satisfies RFEdgeDef;
    })
    .filter((edge): edge is RFEdgeDef => Boolean(edge));

  const directionRaw = String(obj.direction ?? 'TB').toUpperCase();
  const direction = directionRaw === 'LR' || directionRaw === 'RL' || directionRaw === 'BT' || directionRaw === 'TB'
    ? directionRaw
    : 'TB';
  const title = typeof obj.title === 'string' ? obj.title.trim() : undefined;

  return {
    nodes,
    edges,
    direction,
    title,
  };
}

// ─── PNG export: build a static SVG from measured node/edge positions ────────

function buildExportSvg(
  nodes: Node[],
  edges: Edge[],
  title?: string,
): string {
  if (!nodes.length) return '';

  const PAD = 40;
  const NW  = EXPORT_EST_NODE_W;  // estimated node width for export SVG
  const NH  = EXPORT_EST_NODE_H;
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
  diagnostics: LayoutDiagnostics;
}

function FlowCanvas({ rfNodes, rfEdges, title, diagnostics }: FlowCanvasProps) {
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
        <div className="oct-rf-titlemeta">
          {title
            ? <span className="oct-rf-title">{title}</span>
            : <span />
          }
          {diagnostics.nodeCount > LAYOUT_SOFT_LIMIT && (
            <span className="oct-rf-complexity">
              {`${diagnostics.nodeCount} nodes · recommend <= ${LAYOUT_SOFT_LIMIT}`}
            </span>
          )}
        </div>
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

  const { rfNodes, rfEdges, diagnostics } = useMemo(() => {
    if (!data || !Array.isArray(data.nodes)) {
      return {
        rfNodes: [],
        rfEdges: [],
        diagnostics: {
          nodeCount: 0,
          edgeCount: 0,
          maxLevelWidth: 0,
          density: 0,
          recommendedMaxNodes: LAYOUT_SOFT_LIMIT,
          hardMaxNodes: LAYOUT_HARD_LIMIT,
        } satisfies LayoutDiagnostics,
      };
    }

    const direction = (data.direction ?? 'LR') as 'LR' | 'TB' | 'RL' | 'BT';
    const safeNodes = data.nodes.slice(0, LAYOUT_ABSOLUTE_LIMIT);
    const safeNodeIds = new Set(safeNodes.map((node) => node.id));
    const safeEdges = (data.edges ?? []).filter((edge) => safeNodeIds.has(edge.source) && safeNodeIds.has(edge.target));
    const { positions, nodeSizes, diagnostics } = computeLayout(safeNodes, safeEdges, direction);
    const handlePositions = getHandlePositions(direction);

    // Map group names → colour index
    const groupIndex = new Map<string, number>();
    safeNodes.forEach((n) => {
      if (n.group && !groupIndex.has(n.group)) {
        groupIndex.set(n.group, groupIndex.size % GROUP_PALETTE.length);
      }
    });

    const rfNodes: Node[] = safeNodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      const idx = n.group != null ? (groupIndex.get(n.group) ?? 0) : 0;
      const colorScheme = GROUP_PALETTE[idx];
      const estimatedSize = nodeSizes.get(n.id) ?? estimateNodeSize(n.label);
      return {
        id: n.id,
        type: 'octNode',
        position: pos,
        width: estimatedSize.width,
        height: estimatedSize.height,
        sourcePosition: handlePositions.source,
        targetPosition: handlePositions.target,
        data: {
          label: n.label,
          group: n.group,
          shape: n.shape ?? 'rect',
          colorScheme,
          sourcePosition: handlePositions.source,
          targetPosition: handlePositions.target,
        } satisfies OCTNodeData,
      };
    });

    const EDGE_COLOR = '#5a7fa8';
    const edgeType = diagnostics.nodeCount > LAYOUT_SOFT_LIMIT ? 'step' : 'smoothstep';
    const rfEdges: Edge[] = safeEdges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      type: edgeType,
      animated: false,
      style: {
        stroke: EDGE_COLOR,
        strokeWidth: 2,
        ...(e.style === 'dashed' ? { strokeDasharray: '6,4' } : {}),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 },
      labelStyle: { fill: 'var(--text-secondary, #8b949e)', fontSize: 11, fontWeight: 500 },
      labelBgStyle: { fill: 'var(--bg-panel, #0d1117)', fillOpacity: 0.9 },
      labelBgPadding: [4, 4] as [number, number],
    }));

    return { rfNodes, rfEdges, diagnostics };
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
      <FlowCanvas rfNodes={rfNodes} rfEdges={rfEdges} title={data.title} diagnostics={diagnostics} />
    </ReactFlowProvider>
  );
}
