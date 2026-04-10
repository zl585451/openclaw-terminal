function sanitizeText(value, fallback = '') {
  return String(value ?? fallback).replace(/\r?\n+/g, ' ').replace(/"/g, "'").trim();
}

function sanitizeNodeId(value) {
  const raw = String(value ?? '').trim();
  const next = raw.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return next || 'node';
}

function sanitizeDirection(value) {
  const upper = String(value ?? 'TD').toUpperCase();
  return upper === 'TB' || upper === 'BT' || upper === 'LR' || upper === 'RL' ? upper : 'TD';
}

function coerceNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNodeShape(label, shape) {
  const safe = sanitizeText(label, '节点');
  if (shape === 'round') return `("${safe}")`;
  if (shape === 'diamond') return `{${safe}}`;
  if (shape === 'circle') return `(("${safe}"))`;
  return `["${safe}"]`;
}

function parseFlowchartSpec(obj) {
  const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const edges = Array.isArray(obj.edges) ? obj.edges : [];
  if (!nodes.length || !edges.length) return null;

  const nextNodes = nodes
    .map((node) => {
      if (!node || typeof node !== 'object') return null;
      const id = sanitizeNodeId(node.id);
      const label = sanitizeText(node.label, id);
      if (!id || !label) return null;
      const shape = node.shape === 'round' || node.shape === 'diamond' || node.shape === 'circle' ? node.shape : 'rect';
      return { id, label, shape };
    })
    .filter(Boolean);

  const knownIds = new Set(nextNodes.map((node) => node.id));
  if (!nextNodes.length) return null;

  const nextEdges = edges
    .map((edge) => {
      if (!edge || typeof edge !== 'object') return null;
      const from = sanitizeNodeId(edge.from ?? edge.source);
      const to = sanitizeNodeId(edge.to ?? edge.target);
      if (!knownIds.has(from) || !knownIds.has(to)) return null;
      const label = sanitizeText(edge.label);
      return { from, to, label: label || undefined };
    })
    .filter(Boolean);

  if (!nextEdges.length) return null;

  return {
    diagramType: 'flowchart',
    title: sanitizeText(obj.title),
    direction: sanitizeDirection(obj.direction),
    nodes: nextNodes,
    edges: nextEdges,
  };
}

function parsePieSpec(obj) {
  const rawData = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.items) ? obj.items : [];
  if (!rawData.length) return null;

  const data = rawData
    .map((slice) => {
      if (!slice || typeof slice !== 'object') return null;
      const label = sanitizeText(slice.label, '项目');
      const value = coerceNumber(slice.value);
      if (!label || value === null || value < 0) return null;
      return { label, value };
    })
    .filter(Boolean);

  if (!data.length) return null;

  return {
    diagramType: 'pie',
    title: sanitizeText(obj.title),
    data,
    showData: obj.showData !== false,
  };
}

function parseHierarchySpec(obj) {
  const rawItems = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.nodes) ? obj.nodes : [];
  if (!rawItems.length) return null;

  const items = rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const id = sanitizeNodeId(item.id);
      const label = sanitizeText(item.label, id);
      const parentId = item.parentId ? sanitizeNodeId(item.parentId) : undefined;
      if (!id || !label) return null;
      return { id, label, parentId };
    })
    .filter(Boolean);

  if (!items.length) return null;
  const knownIds = new Set(items.map((item) => item.id));

  return {
    diagramType: 'hierarchy',
    title: sanitizeText(obj.title),
    direction: sanitizeDirection(obj.direction),
    items: items.map((item) => ({
      ...item,
      parentId: item.parentId && knownIds.has(item.parentId) ? item.parentId : undefined,
    })),
  };
}

function parseDiagramSpec(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const diagramType = String(parsed?.diagramType ?? '').toLowerCase();
    if (diagramType === 'flowchart' || diagramType === 'graph') return parseFlowchartSpec(parsed);
    if (diagramType === 'pie') return parsePieSpec(parsed);
    if (diagramType === 'hierarchy') return parseHierarchySpec(parsed);
    if (Array.isArray(parsed?.nodes) && Array.isArray(parsed?.edges)) return parseFlowchartSpec(parsed);
    if (Array.isArray(parsed?.items) && parsed.items.every((item) => item && typeof item === 'object' && 'value' in item)) {
      return parsePieSpec(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

function diagramSpecToMermaid(spec) {
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
      if (item.parentId) lines.push(`${item.parentId} --> ${item.id}`);
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

function normalizeDiagramContent(raw) {
  const spec = parseDiagramSpec(raw);
  return spec ? diagramSpecToMermaid(spec) : raw;
}

module.exports = {
  parseDiagramSpec,
  diagramSpecToMermaid,
  normalizeDiagramContent,
};
