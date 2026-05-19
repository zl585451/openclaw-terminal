'use strict';

const BLOCK_VERSION = '3.0';
const KNOWN_TYPES = new Set([
  'markdown',
  'code',
  'table',
  'tasklist',
  'pills',
  'checkbox',
  'question',
  'clarify_card',
  'notice',
]);
const SYMBOL_CHARS = '■●◆○◉▪▸•·';

function normalizeRenderBlocks(input) {
  const text = String(input == null ? '' : input);
  const fenced = extractRenderBlocksFence(text);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced.json);
      const normalized = normalizeEnvelope(parsed);
      if (normalized.blocks.length > 0) {
        return {
          version: BLOCK_VERSION,
          blocks: normalized.blocks,
          source: 'render_blocks',
          errors: normalized.errors,
        };
      }
      return markdownResult(text, ['render_blocks contained no valid blocks']);
    } catch (error) {
      return markdownResult(text, [`invalid render_blocks JSON: ${error.message}`]);
    }
  }

  const legacy = extractLegacyBlocks(text);
  if (legacy.blocks.length > 0) {
    return {
      version: BLOCK_VERSION,
      blocks: legacy.blocks,
      source: 'legacy',
      errors: legacy.errors,
    };
  }

  return markdownResult(text, []);
}

function markdownResult(text, errors) {
  const content = clampText(text, 12000);
  return {
    version: BLOCK_VERSION,
    blocks: content ? [{ type: 'markdown', content }] : [],
    source: 'markdown',
    errors,
  };
}

function extractRenderBlocksFence(text) {
  const fenceRx = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = fenceRx.exec(text)) !== null) {
    const info = String(match[1] || '').trim().toLowerCase();
    if (info === 'render_blocks' || info === 'json render_blocks' || info === 'render_blocks json') {
      return {
        json: String(match[2] || '').trim(),
        start: match.index,
        end: match.index + match[0].length,
      };
    }
  }
  return null;
}

function normalizeEnvelope(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { blocks: [], errors: ['envelope must be an object'] };
  if (raw.version && String(raw.version) !== BLOCK_VERSION) {
    errors.push(`unsupported version ${String(raw.version)}`);
  }
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  const blocks = [];
  let clarifySeen = false;

  for (const rawBlock of rawBlocks) {
    const normalized = normalizeBlock(rawBlock, { clarifySeen });
    if (normalized.error) errors.push(normalized.error);
    if (normalized.block) {
      if (normalized.block.type === 'clarify_card') clarifySeen = true;
      blocks.push(normalized.block);
    }
  }

  return { blocks, errors };
}

function normalizeBlock(rawBlock, context = {}) {
  if (!rawBlock || typeof rawBlock !== 'object') {
    return { block: null, error: 'block must be an object' };
  }
  const type = normalizeString(rawBlock.type, 40);
  if (!KNOWN_TYPES.has(type)) {
    const summary = JSON.stringify(rawBlock).slice(0, 800);
    return {
      block: { type: 'markdown', content: summary },
      error: `unknown block type ${type || '(empty)'}`,
    };
  }

  switch (type) {
    case 'markdown':
      return normalizeMarkdownBlock(rawBlock);
    case 'code':
      return normalizeCodeBlock(rawBlock);
    case 'table':
      return normalizeTableBlock(rawBlock);
    case 'tasklist':
      return normalizeListBlock(rawBlock, 'tasklist', 1, 20);
    case 'pills':
      return normalizeListBlock(rawBlock, 'pills', 2, 6, { sanitizeValue: true });
    case 'checkbox':
      return normalizeListBlock(rawBlock, 'checkbox', 2, 20, { sanitizeValue: true });
    case 'question':
      return normalizeListBlock(rawBlock, 'question', 2, 5, { questionOnly: true });
    case 'clarify_card':
      if (context.clarifySeen) {
        return {
          block: { type: 'markdown', content: '[clarify_card omitted: only one card is allowed per message]' },
          error: 'multiple clarify_card blocks',
        };
      }
      return normalizeClarifyCardBlock(rawBlock);
    case 'notice':
      return normalizeNoticeBlock(rawBlock);
    default:
      return { block: null, error: `unsupported block type ${type}` };
  }
}

function normalizeMarkdownBlock(rawBlock) {
  const content = clampText(rawBlock.content, 12000);
  if (!content) return { block: null, error: 'markdown.content is required' };
  return { block: withOptionalId({ type: 'markdown', content }, rawBlock), error: null };
}

function normalizeCodeBlock(rawBlock) {
  const content = clampText(rawBlock.content, 12000);
  if (!content) return { block: null, error: 'code.content is required' };
  const language = normalizeString(rawBlock.language, 40);
  return {
    block: withOptionalId({ type: 'code', ...(language ? { language } : {}), content }, rawBlock),
    error: null,
  };
}

function normalizeTableBlock(rawBlock) {
  const columns = Array.isArray(rawBlock.columns)
    ? rawBlock.columns.map((item) => clampText(item, 200)).filter(Boolean).slice(0, 6)
    : [];
  const rawRows = Array.isArray(rawBlock.rows) ? rawBlock.rows.slice(0, 50) : [];
  const rows = rawRows
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((cell) => clampText(cell, 200)).slice(0, columns.length))
    .filter((row) => row.length === columns.length);
  if (columns.length === 0 || rows.length === 0) {
    return { block: null, error: 'table.columns and table.rows are required' };
  }
  return { block: withOptionalId({ type: 'table', columns, rows }, rawBlock), error: null };
}

function normalizeListBlock(rawBlock, type, minItems, maxItems, options = {}) {
  const items = normalizeItems(rawBlock.items, maxItems, options);
  if (items.length < minItems) {
    return { block: null, error: `${type}.items requires at least ${minItems} valid items` };
  }
  const prompt = clampText(rawBlock.prompt, 200);
  const title = clampText(rawBlock.title, 200);
  return {
    block: withOptionalId({
      type,
      ...(title ? { title } : {}),
      ...(prompt ? { prompt } : {}),
      items,
    }, rawBlock),
    error: null,
  };
}

function normalizeItems(rawItems, maxItems, options = {}) {
  if (!Array.isArray(rawItems)) return [];
  const items = [];
  for (const raw of rawItems) {
    const item = typeof raw === 'string' ? { label: raw } : raw;
    if (!item || typeof item !== 'object') continue;
    const label = clampText(item.label, 200);
    if (!label) continue;
    if (options.questionOnly && !/[?？]$/.test(label)) continue;
    const id = normalizeId(item.id);
    const valueRaw = clampText(item.value || label, 200);
    const value = options.sanitizeValue ? sanitizeInteractiveValue(valueRaw, label) : valueRaw;
    items.push({
      ...(id ? { id } : {}),
      label,
      ...(value && value !== label ? { value } : {}),
    });
    if (items.length >= maxItems) break;
  }
  return items;
}

function normalizeClarifyCardBlock(rawBlock) {
  const fields = Array.isArray(rawBlock.fields)
    ? rawBlock.fields.map(normalizeClarifyField).filter(Boolean).slice(0, 6)
    : [];
  if (fields.length === 0) return { block: null, error: 'clarify_card.fields requires at least 1 valid field' };
  const title = clampText(rawBlock.title, 200);
  const variant = rawBlock.variant === 'confirm' ? 'confirm' : 'normal';
  return {
    block: withOptionalId({
      type: 'clarify_card',
      ...(title ? { title } : {}),
      variant,
      fields,
    }, rawBlock),
    error: null,
  };
}

function normalizeClarifyField(rawField, index) {
  if (!rawField || typeof rawField !== 'object') return null;
  const id = normalizeId(rawField.id) || `field_${index + 1}`;
  const label = ensureQuestion(clampText(rawField.label, 200));
  const type = ['single', 'multi', 'text', 'confirm'].includes(rawField.type) ? rawField.type : '';
  if (!label || !type) return null;
  const field = { id, label, type };
  if (type !== 'text') {
    const options = Array.isArray(rawField.options)
      ? rawField.options.map((item) => clampText(item, 200)).filter(Boolean).slice(0, 12)
      : [];
    if (options.length < 2) return null;
    field.options = options;
  }
  const placeholder = clampText(rawField.placeholder, 200);
  if (placeholder) field.placeholder = placeholder;
  if (rawField.allow_custom === true) field.allow_custom = true;
  return field;
}

function normalizeNoticeBlock(rawBlock) {
  const content = clampText(rawBlock.content, 1000);
  if (!content) return { block: null, error: 'notice.content is required' };
  const variant = ['info', 'success', 'warning', 'error'].includes(rawBlock.variant) ? rawBlock.variant : 'info';
  return { block: withOptionalId({ type: 'notice', variant, content }, rawBlock), error: null };
}

function extractLegacyBlocks(text) {
  const codeRanges = getCodeBlockRanges(text);
  const tagRx = /\[\s*(pills|tasklist|question|clarify_card)(?:\s+[^\]]*)?\s*\]([\s\S]*?)\[\s*\/\s*\1\s*\]/gi;
  const matches = [];
  let match;
  while ((match = tagRx.exec(text)) !== null) {
    if (isInsideRanges(match.index, codeRanges)) continue;
    matches.push({
      type: match[1].toLowerCase(),
      inner: String(match[2] || '').trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  if (matches.length === 0) return { blocks: [], errors: [] };

  const blocks = [];
  const errors = [];
  let cursor = 0;
  let clarifySeen = false;
  for (const item of matches) {
    const before = text.slice(cursor, item.start).trim();
    if (before) blocks.push({ type: 'markdown', content: before });
    const normalized = legacyTagToBlock(item, { clarifySeen });
    if (normalized.error) errors.push(normalized.error);
    if (normalized.block) {
      if (normalized.block.type === 'clarify_card') clarifySeen = true;
      blocks.push(normalized.block);
    }
    cursor = item.end;
  }
  const after = text.slice(cursor).trim();
  if (after) blocks.push({ type: 'markdown', content: after });
  return { blocks, errors };
}

function legacyTagToBlock(item, context = {}) {
  if (item.type === 'pills') {
    const items = parseSymbolItems(item.inner, 6);
    if (items.length < 2) return { block: null, error: 'legacy pills requires at least 2 items' };
    return { block: { type: 'pills', items }, error: null };
  }
  if (item.type === 'tasklist') {
    const items = parseCheckboxItems(item.inner, 20);
    if (items.length < 1) return { block: null, error: 'legacy tasklist requires at least 1 item' };
    return { block: { type: 'tasklist', items }, error: null };
  }
  if (item.type === 'question') {
    const items = parseQuestionItems(item.inner, 5);
    if (items.length < 2) return { block: null, error: 'legacy question requires at least 2 questions' };
    return { block: { type: 'question', items }, error: null };
  }
  if (item.type === 'clarify_card') {
    if (context.clarifySeen) {
      return {
        block: { type: 'markdown', content: '[clarify_card omitted: only one card is allowed per message]' },
        error: 'multiple legacy clarify_card blocks',
      };
    }
    return legacyClarifyCardToBlock(item.inner);
  }
  return { block: null, error: `unsupported legacy tag ${item.type}` };
}

function legacyClarifyCardToBlock(inner) {
  const start = inner.indexOf('{');
  const end = inner.lastIndexOf('}');
  if (start < 0 || end <= start) return { block: null, error: 'legacy clarify_card JSON missing' };
  try {
    const raw = JSON.parse(inner.slice(start, end + 1));
    return normalizeClarifyCardBlock({ ...raw, type: 'clarify_card' });
  } catch (error) {
    return { block: null, error: `legacy clarify_card invalid JSON: ${error.message}` };
  }
}

function parseSymbolItems(text, maxItems) {
  const rx = new RegExp(`^[\\s]*(?:[-*+]\\s*)?[${SYMBOL_CHARS}]\\s*(.+)$`);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(rx);
      return match ? clampText(match[1], 200) : '';
    })
    .filter(Boolean)
    .slice(0, maxItems)
    .map((label) => ({ label }));
}

function parseCheckboxItems(text, maxItems) {
  const rx = /^[\s]*(?:[-*+]\s*)?(?:\[\s*(?:[✓xX]|\s)\s*\]|[☐□☑✓])\s*(.+)$/;
  return text
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(rx);
      if (!match) return '';
      return clampText(match[1].replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1'), 200);
    })
    .filter(Boolean)
    .slice(0, maxItems)
    .map((label) => ({ label }));
}

function parseQuestionItems(text, maxItems) {
  const rx = /^[\s]*(?:\d+[.）、]\s*|[-*+]\s*)?(.+[?？])\s*$/;
  return text
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(rx);
      return match ? clampText(match[1], 200) : '';
    })
    .filter(Boolean)
    .slice(0, maxItems)
    .map((label) => ({ label }));
}

function getCodeBlockRanges(text) {
  const ranges = [];
  const rx = /```[^\r\n`]*\r?\n[\s\S]*?```/g;
  let match;
  while ((match = rx.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function isInsideRanges(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function withOptionalId(block, rawBlock) {
  const id = normalizeId(rawBlock.id);
  return id ? { id, ...block } : block;
}

function normalizeString(value, max) {
  return clampText(value, max).toLowerCase();
}

function normalizeId(value) {
  const id = clampText(value, 80).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return id || '';
}

function clampText(value, max) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function ensureQuestion(text) {
  if (!text) return '';
  return /[?？]$/.test(text) ? text : `${text}？`;
}

function sanitizeInteractiveValue(value, fallback) {
  const text = clampText(value, 200);
  if (!text) return fallback;
  if (/```|(?:^|\s)(?:git|npm|npx|node|powershell|cmd|rm|del|Remove-Item|curl)\b/i.test(text)) {
    return fallback;
  }
  return text;
}

module.exports = {
  normalizeRenderBlocks,
  _internals: {
    extractRenderBlocksFence,
    extractLegacyBlocks,
    normalizeEnvelope,
    normalizeBlock,
  },
};
