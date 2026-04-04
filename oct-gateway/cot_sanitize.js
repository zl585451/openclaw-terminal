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

function sanitizeAssistantReply(reply) {
  return stripCotText(reply);
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
  stripCotText,
  sanitizeAssistantReply,
  sanitizeMemoryNodeContent,
};
