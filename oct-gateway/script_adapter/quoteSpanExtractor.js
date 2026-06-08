'use strict';

const DEFAULT_CONTEXT_CHARS = 80;

const QUOTE_PAIRS = [
  { open: '“', close: '”', quoteMark: 'curly', kindHint: 'speech' },
  { open: '"', close: '"', quoteMark: 'straight', kindHint: 'speech' },
  { open: '【', close: '】', quoteMark: 'fullwidth_bracket', kindHint: 'system_voice' },
];

/**
 * Extract immutable quote spans from source text and leave the rest as narration gaps.
 * Span start/end include quote marks, while text is the inner quoted content.
 * @param {{ sourceText: string, chapterTitle?: string, contextChars?: number }} params
 */
function extractQuoteSpans(params = {}) {
  const sourceText = String(params.sourceText || '');
  if (!sourceText.trim()) throw new Error('QUOTE_SPAN_NO_INPUT');

  const contextChars = normalizeContextChars(params.contextChars);
  const chapterTitle = String(params.chapterTitle || inferChapterTitle(sourceText) || '未命名片段').trim();
  const quoteRanges = scanQuoteRanges(sourceText);
  const quotes = quoteRanges.map((range, index) => ({
    quoteId: `q${String(index + 1).padStart(3, '0')}`,
    text: sourceText.slice(range.innerStart, range.innerEnd),
    rawText: sourceText.slice(range.start, range.end),
    start: range.start,
    end: range.end,
    innerStart: range.innerStart,
    innerEnd: range.innerEnd,
    leftContext: sourceText.slice(Math.max(0, range.start - contextChars), range.start),
    rightContext: sourceText.slice(range.end, Math.min(sourceText.length, range.end + contextChars)),
    quoteMark: range.quoteMark,
    kindHint: range.kindHint,
  }));

  const narrationGaps = buildNarrationGaps(sourceText, quoteRanges);
  mergeLeadingSoundSuffixIntoPreviousQuote({ quotes, narrationGaps });

  return {
    chapterTitle,
    sourceText,
    quotes,
    narrationGaps,
  };
}

function scanQuoteRanges(sourceText) {
  const ranges = [];
  let index = 0;

  while (index < sourceText.length) {
    const pair = findPairAt(sourceText, index);
    if (!pair) {
      index += 1;
      continue;
    }

    const innerStart = index + pair.open.length;
    const closeIndex = sourceText.indexOf(pair.close, innerStart);
    if (closeIndex < 0) {
      index += pair.open.length;
      continue;
    }

    const end = closeIndex + pair.close.length;
    ranges.push({
      start: index,
      end,
      innerStart,
      innerEnd: closeIndex,
      quoteMark: pair.quoteMark,
      kindHint: pair.kindHint,
    });
    index = end;
  }

  return ranges;
}

function findPairAt(sourceText, index) {
  for (const pair of QUOTE_PAIRS) {
    if (sourceText.startsWith(pair.open, index)) return pair;
  }
  return null;
}

function buildNarrationGaps(sourceText, quoteRanges) {
  const gaps = [];
  let cursor = 0;

  for (const range of quoteRanges) {
    if (range.start > cursor) {
      gaps.push(makeGap(gaps.length + 1, cursor, range.start, sourceText));
    }
    cursor = range.end;
  }

  if (cursor < sourceText.length) {
    gaps.push(makeGap(gaps.length + 1, cursor, sourceText.length, sourceText));
  }

  return gaps;
}

function mergeLeadingSoundSuffixIntoPreviousQuote({ quotes, narrationGaps }) {
  for (const gap of narrationGaps) {
    const match = gap.text.match(/^声([。，、！!？?\s]?)/);
    if (!match) continue;
    const prevQuote = findPreviousQuoteForGap(quotes, gap);
    if (!prevQuote) continue;
    const suffix = match[0];
    prevQuote.text += suffix;
    prevQuote.rawText += suffix;
    prevQuote.end += suffix.length;
    prevQuote.innerEnd += suffix.length;
    gap.text = gap.text.slice(suffix.length);
    gap.start += suffix.length;
  }
}

function findPreviousQuoteForGap(quotes, gap) {
  for (let index = quotes.length - 1; index >= 0; index -= 1) {
    if (Number(quotes[index].end) <= Number(gap.start)) return quotes[index];
  }
  return null;
}

function makeGap(index, start, end, sourceText) {
  return {
    gapId: `n${String(index).padStart(3, '0')}`,
    start,
    end,
    text: sourceText.slice(start, end),
  };
}

function inferChapterTitle(sourceText) {
  const firstNonEmpty = String(sourceText || '').split(/\r?\n/).find((line) => line.trim());
  if (!firstNonEmpty) return '';
  const line = firstNonEmpty.trim();
  if (/^(第[一二三四五六七八九十百千万零〇\d]+[章节回卷部]|【\d+】|\d+[、.．])/.test(line)) return line;
  return '';
}

function normalizeContextChars(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CONTEXT_CHARS;
  return Math.min(300, Math.max(20, parsed));
}

function reconstructFromSpans(spanDoc) {
  const sourceText = String(spanDoc?.sourceText || '');
  const parts = [
    ...(Array.isArray(spanDoc?.quotes) ? spanDoc.quotes.map((item) => ({ kind: 'quote', ...item })) : []),
    ...(Array.isArray(spanDoc?.narrationGaps) ? spanDoc.narrationGaps.map((item) => ({ kind: 'gap', ...item })) : []),
  ].sort((a, b) => Number(a.start) - Number(b.start));

  return parts.map((part) => sourceText.slice(part.start, part.end)).join('');
}

module.exports = {
  extractQuoteSpans,
  reconstructFromSpans,
};
