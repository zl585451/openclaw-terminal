/**
 * 清洗 AI 思维链，避免 [cot] / <think> 被写入记忆或再次注入上下文。
 */

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

  const headerRe = /\[To=(?:"[^"]+"|'[^']+')\]\s*\{/g;
  let out = '';
  let cursor = 0;
  let match;

  while ((match = headerRe.exec(text)) !== null) {
    const start = match.index;
    const openBracePos = text.indexOf('{', start);
    if (openBracePos < 0) break;

    out += text.slice(cursor, start);

    let depth = 0;
    let inString = false;
    let escaped = false;
    let quoteChar = '"';
    let i = openBracePos;
    let foundEnd = false;

    for (; i < text.length; i++) {
      const ch = text[i];
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

  out += text.slice(cursor);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function sanitizeAssistantReply(reply) {
  return stripCotText(stripTextToolAnnotations(reply));
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
  sanitizeAssistantReply,
  sanitizeMemoryNodeContent,
};
