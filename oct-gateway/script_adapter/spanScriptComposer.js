'use strict';

const { formatSegmentId } = require('./lineProtocolParser');

function composeScriptFromSpans(params = {}) {
  const spanDoc = params.spanDoc || {};
  const attributionMap = normalizeAttributionMap(params.attributions);
  const innerVoiceByGap = groupInnerVoiceSpans(params.innerVoiceSpans);
  const sourceText = String(spanDoc.sourceText || '');
  const events = [
    ...(Array.isArray(spanDoc.narrationGaps) ? spanDoc.narrationGaps.map((gap) => ({ kind: 'gap', ...gap })) : []),
    ...(Array.isArray(spanDoc.quotes) ? spanDoc.quotes.map((quote) => ({ kind: 'quote', ...quote })) : []),
  ].sort((a, b) => Number(a.start) - Number(b.start));

  const segments = [];
  const warnings = [];

  for (const event of events) {
    if (event.kind === 'gap') {
      appendGapSegments({ event, sourceText, innerVoices: innerVoiceByGap.get(event.gapId) || [], segments });
      continue;
    }

    const attribution = attributionMap.get(event.quoteId);
    if (!attribution) {
      warnings.push({ quoteId: event.quoteId, reason: 'missing_attribution' });
      continue;
    }

    const text = String(event.text || '').trim();
    if (!text) continue;

    const segment = {
      segmentId: formatSegmentId(segments.length + 1),
      type: mapVoiceTypeToSegmentType(attribution.voiceType),
      speaker: attribution.speaker,
      text,
      quoteId: event.quoteId,
      confidence: attribution.confidence,
      evidence: attribution.evidence,
    };
    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new Error('SPAN_COMPOSER_NO_SEGMENTS');
  }

  return {
    payload: {
      chapterTitle: String(spanDoc.chapterTitle || '未命名片段').trim() || '未命名片段',
      totalCharCount: segments.reduce((sum, seg) => sum + String(seg.text || '').length, 0),
      segments,
      _spanAttribution: {
        quoteCount: Array.isArray(spanDoc.quotes) ? spanDoc.quotes.length : 0,
        innerVoiceCount: Array.isArray(params.innerVoiceSpans) ? params.innerVoiceSpans.length : 0,
        warningCount: warnings.length,
      },
    },
    warnings,
    reconstructedSource: sourceText,
  };
}

function appendGapSegments({ event, sourceText, innerVoices, segments }) {
  const sorted = innerVoices
    .filter((item) => Number(item.start) >= Number(event.start) && Number(item.end) <= Number(event.end))
    .sort((a, b) => Number(a.start) - Number(b.start));
  let cursor = Number(event.start);

  for (const os of sorted) {
    if (Number(os.start) > cursor) {
      appendNarrationSegment(sourceText.slice(cursor, Number(os.start)), segments);
    }
    appendInnerVoiceSegment(os, segments);
    cursor = Number(os.end);
  }

  if (cursor < Number(event.end)) {
    appendNarrationSegment(sourceText.slice(cursor, Number(event.end)), segments);
  }
}

function appendNarrationSegment(text, segments) {
  const stripped = stripChapterTitleFromFirstGap(String(text || ''), segments.length);
  const normalizedText = normalizeNarrationGap(stripped);
  if (!normalizedText) return;
  segments.push({
    segmentId: formatSegmentId(segments.length + 1),
    type: 'narration',
    text: normalizedText,
  });
}

function appendInnerVoiceSegment(os, segments) {
  const text = normalizeInnerVoiceText(os.text);
  if (!text) return;
  segments.push({
    segmentId: formatSegmentId(segments.length + 1),
    type: 'inner_monologue',
    speaker: String(os.speaker || '').trim() || '宁默',
    text,
    osId: os.osId,
    confidence: os.confidence || 'high',
    evidence: os.evidence || 'inner_voice_rule',
  });
}

function normalizeAttributionMap(attributions) {
  if (attributions instanceof Map) return attributions;
  const map = new Map();
  for (const item of Array.isArray(attributions) ? attributions : []) {
    if (!item?.quoteId) continue;
    map.set(String(item.quoteId), item);
  }
  return map;
}

function stripChapterTitleFromFirstGap(text, segmentCount) {
  if (segmentCount > 0) return text;
  const lines = String(text || '').split(/\r?\n/);
  if (lines.length <= 1) return text;
  const first = lines[0].trim();
  if (/^(第[一二三四五六七八九十百千万零〇\d]+[章节回卷部]|【\d+】|\d+[、.．])/.test(first)) {
    return lines.slice(1).join('\n');
  }
  return text;
}

function normalizeNarrationGap(text) {
  return String(text || '')
    .replace(/[“”"【】]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInnerVoiceText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function groupInnerVoiceSpans(spans) {
  const map = new Map();
  for (const span of Array.isArray(spans) ? spans : []) {
    if (!span?.gapId) continue;
    const list = map.get(span.gapId) || [];
    list.push(span);
    map.set(span.gapId, list);
  }
  return map;
}

function mapVoiceTypeToSegmentType(voiceType) {
  if (voiceType === 'inner_monologue') return 'inner_monologue';
  return 'dialogue';
}

module.exports = {
  composeScriptFromSpans,
};
