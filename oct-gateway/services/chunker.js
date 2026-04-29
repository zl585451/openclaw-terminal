'use strict';

function chunkByChars(text, options = {}) {
  const source = normalizeText(text);
  if (!source) return [];

  const targetSize = positiveInt(options.targetSize, 3000);
  const maxSize = Math.max(targetSize, positiveInt(options.maxSize, 4000));
  const overlap = Math.max(0, Math.min(positiveInt(options.overlap, 200), Math.floor(maxSize / 2)));
  const chunks = [];
  let start = 0;

  while (start < source.length) {
    const hardEnd = Math.min(start + maxSize, source.length);
    const targetEnd = Math.min(start + targetSize, source.length);
    let end = source.length <= hardEnd ? source.length : findNaturalBoundary(source, start, targetEnd, hardEnd);
    if (end <= start) end = hardEnd;

    chunks.push({
      index: chunks.length,
      content: source.slice(start, end),
      startChar: start,
      endChar: end,
    });

    if (end >= source.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function chunkByParagraphs(text, options = {}) {
  const source = normalizeText(text);
  if (!source) return [];

  const targetSize = positiveInt(options.targetSize, 3000);
  const paragraphs = [];
  const pattern = /[^\n]+(?:\n+|$)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const content = match[0];
    if (!content.trim()) continue;
    paragraphs.push({
      content,
      startChar: match.index,
      endChar: match.index + content.length,
    });
  }

  const chunks = [];
  let current = [];
  let startChar = 0;
  let endChar = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      index: chunks.length,
      content: current.map((item) => item.content).join('').trimEnd(),
      startChar,
      endChar,
      paragraphCount: current.length,
    });
    current = [];
  };

  for (const paragraph of paragraphs) {
    const currentLength = current.reduce((sum, item) => sum + item.content.length, 0);
    if (current.length > 0 && currentLength + paragraph.content.length > targetSize) {
      flush();
    }
    if (current.length === 0) startChar = paragraph.startChar;
    current.push(paragraph);
    endChar = paragraph.endChar;
  }
  flush();

  return chunks;
}

function chunkByChapters(text) {
  const source = normalizeText(text);
  if (!source) return [];

  const headingPattern = /(^|\n)\s*(第[一二三四五六七八九十百千零\d]+[章回][^\n]*)/g;
  const matches = [];
  let match;
  while ((match = headingPattern.exec(source)) !== null) {
    const offset = match[1] ? match[1].length : 0;
    matches.push({
      title: String(match[2] || '').trim(),
      startChar: match.index + offset,
    });
  }

  if (matches.length === 0) {
    return [{ index: 0, title: '全文', content: source, startChar: 0, endChar: source.length }];
  }

  return matches.map((item, index) => {
    const endChar = index + 1 < matches.length ? matches[index + 1].startChar : source.length;
    return {
      index,
      title: item.title,
      content: source.slice(item.startChar, endChar).trim(),
      startChar: item.startChar,
      endChar,
    };
  });
}

function findNaturalBoundary(source, start, targetEnd, hardEnd) {
  const boundarySearchStart = Math.max(start + 1, targetEnd - 700);
  const windowText = source.slice(boundarySearchStart, hardEnd);
  const boundaries = ['\n\n', '\n', '。', '！', '？', '!', '?'];
  let best = -1;

  for (const boundary of boundaries) {
    const index = windowText.lastIndexOf(boundary);
    if (index >= 0) {
      best = Math.max(best, boundarySearchStart + index + boundary.length);
    }
  }

  return best > start ? best : hardEnd;
}

function normalizeText(text) {
  return typeof text === 'string' ? text.replace(/\r\n/g, '\n') : '';
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

module.exports = {
  chunkByChars,
  chunkByParagraphs,
  chunkByChapters,
};
