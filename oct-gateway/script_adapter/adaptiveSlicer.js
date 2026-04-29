'use strict';

const DEFAULT_ANCHOR_SIZE = 200;

function createAdaptiveSlices(text, options = {}) {
  const source = normalizeText(text).trim();
  if (!source) return [];

  const anchorSize = positiveInt(options.anchorSize, DEFAULT_ANCHOR_SIZE);
  const sliceCount = options.sliceCount
    ? Math.max(1, positiveInt(options.sliceCount, 1))
    : getAdaptiveSliceCount(source.length);
  if (sliceCount === 1) {
    return [makeSlice(source, 0, source.length, 0, sliceCount, anchorSize)];
  }

  const boundaries = chooseParagraphBoundaries(source, sliceCount);
  const slices = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    slices.push(makeSlice(source, boundaries[index], boundaries[index + 1], index, sliceCount, anchorSize));
  }
  return slices;
}

function mergeSlicePayloads(results, options = {}) {
  const formatSegmentId = options.formatSegmentId || ((index) => `seg-${String(index).padStart(3, '0')}`);
  const segments = [];
  let chapterTitle = '';
  let degradedCount = 0;

  for (const result of results) {
    if (result?.ok && Array.isArray(result.payload?.segments)) {
      if (!chapterTitle && result.payload.chapterTitle) chapterTitle = result.payload.chapterTitle;
      for (const segment of result.payload.segments) {
        if (isDuplicateAnchorSegment(segments[segments.length - 1], segment)) continue;
        segments.push({
          ...segment,
          segmentId: formatSegmentId(segments.length + 1),
        });
      }
      continue;
    }

    degradedCount += 1;
    segments.push({
      segmentId: formatSegmentId(segments.length + 1),
      type: 'narration',
      text: `[第 ${Number(result?.sliceIndex ?? degradedCount)} 片改编失败：${String(result?.error || '未知错误').slice(0, 80)}]`,
      rewriteNote: 'degraded slice fallback',
    });
  }

  return {
    chapterTitle: chapterTitle || '未命名片段',
    totalCharCount: segments.reduce((sum, item) => sum + String(item.text || '').length, 0),
    segments,
  };
}

function getAdaptiveSliceCount(charCount) {
  if (charCount <= 2500) return 1;
  if (charCount <= 4000) return 2;
  return 3;
}

function makeSlice(source, coreStart, coreEnd, index, total, anchorSize) {
  const start = Math.max(0, coreStart);
  const end = Math.min(source.length, coreEnd);
  return {
    index,
    total,
    coreStart: start,
    coreEnd: end,
    coreText: source.slice(start, end).trim(),
    previousAnchor: source.slice(Math.max(0, start - anchorSize), start).trim(),
    nextAnchor: source.slice(end, Math.min(source.length, end + anchorSize)).trim(),
  };
}

function chooseParagraphBoundaries(source, sliceCount) {
  const boundaries = paragraphBoundaries(source);
  const selected = [0];

  for (let part = 1; part < sliceCount; part += 1) {
    const target = Math.round((source.length * part) / sliceCount);
    const min = selected[selected.length - 1] + 1;
    const max = source.length - (sliceCount - part);
    selected.push(nearestBoundary(boundaries, target, min, max));
  }

  selected.push(source.length);
  return selected;
}

function paragraphBoundaries(source) {
  const set = new Set([0, source.length]);
  const paragraphPattern = /\n\s*\n+/g;
  let match;
  while ((match = paragraphPattern.exec(source)) !== null) {
    set.add(match.index + match[0].length);
  }

  const linePattern = /\n+/g;
  while ((match = linePattern.exec(source)) !== null) {
    set.add(match.index + match[0].length);
  }

  if (set.size <= 2) {
    for (const boundary of sentenceBoundaries(source)) set.add(boundary);
  }

  return [...set].sort((a, b) => a - b);
}

function sentenceBoundaries(source) {
  const result = [];
  const pattern = /[。！？!?]/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    result.push(match.index + 1);
  }
  return result;
}

function nearestBoundary(boundaries, target, min, max) {
  let best = Math.max(min, Math.min(max, target));
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const boundary of boundaries) {
    if (boundary < min || boundary > max) continue;
    const distance = Math.abs(boundary - target);
    if (distance < bestDistance) {
      best = boundary;
      bestDistance = distance;
    }
  }
  return best;
}

function isDuplicateAnchorSegment(previous, current) {
  if (!previous || !current) return false;
  const prevText = normalizeSegmentText(previous.text);
  const nextText = normalizeSegmentText(current.text);
  if (!prevText || !nextText) return false;
  return prevText === nextText && previous.type === current.type && String(previous.speaker || '') === String(current.speaker || '');
}

function normalizeSegmentText(text) {
  return String(text || '').replace(/\s+/g, '');
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
  createAdaptiveSlices,
  getAdaptiveSliceCount,
  mergeSlicePayloads,
};
