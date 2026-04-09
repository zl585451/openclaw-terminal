type DiagramNode = {
  id: string;
  label: string;
  shape?: 'rect' | 'round' | 'diamond' | 'circle';
};

type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
};

type PieSlice = {
  label: string;
  value: number;
};

export type FlowchartDiagramSpec = {
  diagramType: 'flowchart' | 'graph';
  title?: string;
  direction?: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type PieDiagramSpec = {
  diagramType: 'pie';
  title?: string;
  data: PieSlice[];
  showData?: boolean;
};

type HierarchyItem = {
  id: string;
  label: string;
  parentId?: string;
};

export type HierarchyDiagramSpec = {
  diagramType: 'hierarchy';
  title?: string;
  direction?: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  items: HierarchyItem[];
};

export type SupportedDiagramSpec = FlowchartDiagramSpec | PieDiagramSpec | HierarchyDiagramSpec;

function sanitizeText(value: unknown, fallback = ''): string {
  return String(value ?? fallback).replace(/\r?\n+/g, ' ').replace(/"/g, "'").trim();
}

function sanitizeNodeId(value: unknown): string {
  const raw = String(value ?? '').trim();
  const next = raw.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return next || 'node';
}

function sanitizeDirection(value: unknown): FlowchartDiagramSpec['direction'] {
  const upper = String(value ?? 'TD').toUpperCase();
  return upper === 'TB' || upper === 'BT' || upper === 'LR' || upper === 'RL' ? upper : 'TD';
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNodeShape(label: string, shape?: DiagramNode['shape']): string {
  const safe = sanitizeText(label, '节点');
  if (shape === 'round') return `("${safe}")`;
  if (shape === 'diamond') return `{${safe}}`;
  if (shape === 'circle') return `(("${safe}"))`;
  return `["${safe}"]`;
}

function parseFlowchartSpec(value: unknown): FlowchartDiagramSpec | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const edges = Array.isArray(obj.edges) ? obj.edges : [];
  if (!nodes.length || !edges.length) return null;

  const nextNodes = nodes
    .map((node) => {
      if (!node || typeof node !== 'object') return null;
      const item = node as Record<string, unknown>;
      const id = sanitizeNodeId(item.id);
      const label = sanitizeText(item.label, id);
      if (!id || !label) return null;
      const shape = item.shape === 'round' || item.shape === 'diamond' || item.shape === 'circle' ? item.shape : 'rect';
      return { id, label, shape } as DiagramNode;
    })
    .filter((node): node is DiagramNode => Boolean(node));

  const knownIds = new Set(nextNodes.map((node) => node.id));
  if (!nextNodes.length) return null;

  const nextEdges = edges
    .map((edge) => {
      if (!edge || typeof edge !== 'object') return null;
      const item = edge as Record<string, unknown>;
      const from = sanitizeNodeId(item.from);
      const to = sanitizeNodeId(item.to);
      if (!knownIds.has(from) || !knownIds.has(to)) return null;
      const label = sanitizeText(item.label);
      return { from, to, label: label || undefined } as DiagramEdge;
    })
    .filter((edge): edge is DiagramEdge => Boolean(edge));

  if (!nextEdges.length) return null;

  return {
    diagramType: 'flowchart',
    title: sanitizeText(obj.title),
    direction: sanitizeDirection(obj.direction),
    nodes: nextNodes,
    edges: nextEdges,
  };
}

function parsePieSpec(value: unknown): PieDiagramSpec | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const rawData = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.items) ? obj.items : [];
  if (!rawData.length) return null;

  const data = rawData
    .map((slice) => {
      if (!slice || typeof slice !== 'object') return null;
      const item = slice as Record<string, unknown>;
      const label = sanitizeText(item.label, '项目');
      const value = coerceNumber(item.value);
      if (!label || value === null || value < 0) return null;
      return { label, value } as PieSlice;
    })
    .filter((slice): slice is PieSlice => Boolean(slice));

  if (!data.length) return null;

  return {
    diagramType: 'pie',
    title: sanitizeText(obj.title),
    data,
    showData: obj.showData !== false,
  };
}

function parseHierarchySpec(value: unknown): HierarchyDiagramSpec | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.nodes) ? obj.nodes : [];
  if (!rawItems.length) return null;

  const items = rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = sanitizeNodeId(record.id);
      const label = sanitizeText(record.label, id);
      const parentId = record.parentId ? sanitizeNodeId(record.parentId) : undefined;
      if (!id || !label) return null;
      return { id, label, parentId } as HierarchyItem;
    })
    .filter((item): item is HierarchyItem => Boolean(item));

  if (!items.length) return null;
  const knownIds = new Set(items.map((item) => item.id));
  const normalized = items.map((item) => ({
    ...item,
    parentId: item.parentId && knownIds.has(item.parentId) ? item.parentId : undefined,
  }));

  return {
    diagramType: 'hierarchy',
    title: sanitizeText(obj.title),
    direction: sanitizeDirection(obj.direction),
    items: normalized,
  };
}

export function parseDiagramSpec(raw: string): SupportedDiagramSpec | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const diagramType = String(parsed?.diagramType ?? '').toLowerCase();
    if (diagramType === 'flowchart' || diagramType === 'graph') {
      return parseFlowchartSpec(parsed);
    }
    if (diagramType === 'pie') {
      return parsePieSpec(parsed);
    }
    if (diagramType === 'hierarchy') {
      return parseHierarchySpec(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

export function diagramSpecToMermaid(spec: SupportedDiagramSpec): string {
  if (spec.diagramType === 'pie') {
    const lines = ['pie'];
    if (spec.title) lines.push(`title ${sanitizeText(spec.title)}`);
    if (spec.showData === false) lines.push('showData false');
    for (const slice of spec.data) {
      lines.push(`"${sanitizeText(slice.label, '项目')}" : ${slice.value}`);
    }
    return lines.join('\n');
  }

  if (spec.diagramType === 'hierarchy') {
    const lines = [
      '%%{init: { "flowchart": { "useMaxWidth": false, "nodeSpacing": 50, "rankSpacing": 70, "curve": "basis" } }}%%',
      `flowchart ${sanitizeDirection(spec.direction)}`,
    ];

    for (const item of spec.items) {
      lines.push(`${item.id}["${sanitizeText(item.label, item.id)}"]`);
    }

    for (const item of spec.items) {
      if (item.parentId) {
        lines.push(`${item.parentId} --> ${item.id}`);
      }
    }

    return lines.join('\n');
  }

  const lines = [
    '%%{init: { "flowchart": { "useMaxWidth": false, "nodeSpacing": 50, "rankSpacing": 68, "curve": "basis" } }}%%',
    `flowchart ${sanitizeDirection(spec.direction)}`,
  ];

  for (const node of spec.nodes) {
    lines.push(`${node.id}${getNodeShape(node.label, node.shape)}`);
  }

  for (const edge of spec.edges) {
    lines.push(edge.label ? `${edge.from} -->|${sanitizeText(edge.label)}| ${edge.to}` : `${edge.from} --> ${edge.to}`);
  }

  return lines.join('\n');
}

export function normalizeDiagramContent(raw: string): string {
  const spec = parseDiagramSpec(raw);
  return spec ? diagramSpecToMermaid(spec) : raw;
}
