/**
 * 清洗 AI 思维链，避免 [cot] / <think> 被写入记忆或再次注入上下文。
 */
const { parseDiagramSpec } = require('./diagram_schema');

function stripCotText(input) {
  const text = String(input || '');
  if (!text) return '';

  let out = text;
  out = out.replace(/\[cot\][\s\S]*?\[\/cot\]/gi, ' ');
  out = out.replace(/\[cot\][\s\S]*$/gi, ' ');
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, ' ');
  out = out.replace(/<think>[\s\S]*$/gi, ' ');
  out = out.replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, ' ');
  out = out.replace(/<redacted_thinking>[\s\S]*$/gi, ' ');

  return out
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripTextToolAnnotations(input) {
  const text = String(input || '');
  if (!text) return '';

  function removeBalancedBlocks(source, headerRe) {
    let out = '';
    let cursor = 0;
    let match;

    while ((match = headerRe.exec(source)) !== null) {
      const start = match.index;
      const openBracePos = source.indexOf('{', start);
      if (openBracePos < 0) break;

      out += source.slice(cursor, start);

      let depth = 0;
      let inString = false;
      let escaped = false;
      let quoteChar = '"';
      let i = openBracePos;
      let foundEnd = false;

      for (; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            continue;
          }
          if (ch === quoteChar) {
            inString = false;
          }
          continue;
        }

        if (ch === '"' || ch === "'") {
          inString = true;
          quoteChar = ch;
          continue;
        }
        if (ch === '{') {
          depth += 1;
          continue;
        }
        if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            foundEnd = true;
            i += 1;
            break;
          }
        }
      }

      if (!foundEnd) {
        cursor = start;
        break;
      }

      cursor = i;
      headerRe.lastIndex = i;
    }

    out += source.slice(cursor);
    return out;
  }

  let out = removeBalancedBlocks(text, /\[To=(?:"[^"]+"|'[^']+')\]\s*\{/g);
  out = removeBalancedBlocks(out, /\{tool\s*=>\s*(?:"[^"]+"|'[^']+'|[a-zA-Z_][\w-]*)\s*,\s*args\s*=>\s*\{/g);
  out = out
    .replace(/\[[a-zA-Z0-9_.-]+\]\s*<tool_code>\s*[\s\S]*?\s*<\/tool_code>/gi, ' ')
    .replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/gi, ' ')
    .replace(/\[\/?TOOL_CALLS?\]/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return out;
}

function normalizeBareDiagramJsonReply(input) {
  const text = String(input || '');
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('```')) return trimmed;
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return trimmed;

  const spec = parseDiagramSpec(trimmed);
  if (!spec) return trimmed;

  return `\`\`\`json\n${trimmed}\n\`\`\``;
}

function tryParseJsonObjectCandidate(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const candidates = [];
  if (text.startsWith('{') && text.endsWith('}')) {
    candidates.push(text);
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace > 0 && lastBrace > firstBrace) {
    const prefix = text.slice(0, firstBrace).trim();
    if (/^[\p{Script=Han}\s，。、“”"'':：,.-]{0,8}$/u.test(prefix)) {
      candidates.push(text.slice(firstBrace, lastBrace + 1));
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }

  return null;
}

function toUserVisibleAssistantText(input) {
  const text = String(input || '').trim();
  if (!text) return '';

  const parsed = tryParseJsonObjectCandidate(text);
  if (!parsed) return text;

  if (
    parsed.role === 'assistant'
    && typeof parsed.content === 'string'
    && parsed.content.trim()
  ) {
    return parsed.content.trim();
  }

  if (
    parsed.status === 'waiting_user_reply'
    && typeof parsed.message === 'string'
  ) {
    return '';
  }

  if (typeof parsed.message === 'string' && parsed.message.trim()) {
    return parsed.message.trim();
  }

  if (typeof parsed.error === 'string' && parsed.error.trim()) {
    return parsed.error.trim();
  }

  return text;
}

function sanitizeAssistantReply(reply) {
  return normalizeBareDiagramJsonReply(
    toUserVisibleAssistantText(stripCotText(stripTextToolAnnotations(reply)))
  );
}

function sanitizeMemoryNodeContent(raw) {
  const text = String(raw || '');
  if (!text) return { changed: false, content: text };

  try {
    const parsed = JSON.parse(text);
    const next = { ...parsed };
    let changed = false;

    for (const key of ['amy', 'amy_reply', 'content']) {
      if (typeof next[key] === 'string') {
        const sanitized = stripCotText(next[key]);
        if (sanitized !== next[key]) {
          next[key] = sanitized;
          changed = true;
        }
      }
    }

    return {
      changed,
      content: changed ? JSON.stringify(next, null, 0) : text,
      data: changed ? next : parsed,
    };
  } catch {
    const sanitized = stripCotText(text);
    return {
      changed: sanitized !== text,
      content: sanitized,
    };
  }
}

module.exports = {
  stripTextToolAnnotations,
  stripCotText,
  toUserVisibleAssistantText,
  sanitizeAssistantReply,
  sanitizeMemoryNodeContent,
};
