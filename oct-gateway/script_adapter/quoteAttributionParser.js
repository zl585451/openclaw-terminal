'use strict';

const { sanitizeSpeaker } = require('./speakerCandidateExtractor');

const VALID_VOICE_TYPES = new Set(['dialogue', 'inner_monologue', 'system_voice', 'device_voice', 'sfx']);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const POLLUTED_SPEAKERS = new Set(['角色名', '未知角色', 'unknown', 'speaker', '说话人']);

function parseQuoteAttributionLines(rawContent, options = {}) {
  const allowedQuoteIds = new Set(Array.isArray(options.quoteIds) ? options.quoteIds.map(String) : []);
  const attributions = [];
  const warnings = [];
  const lines = String(rawContent || '').split(/\r?\n/).filter((line) => line.trim());

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    const lineNumber = index + 1;
    const parts = raw.split('|').map((part) => part.trim());
    if (parts.length < 5) {
      warnings.push(warning(lineNumber, raw, 'missing_fields'));
      continue;
    }

    const [quoteId, rawVoiceType, rawSpeaker, rawConfidence] = parts;
    const evidence = parts.slice(4).join('|').trim();
    if (!/^q\d+$/i.test(quoteId)) {
      warnings.push(warning(lineNumber, raw, 'invalid_quote_id'));
      continue;
    }
    if (allowedQuoteIds.size > 0 && !allowedQuoteIds.has(quoteId)) {
      warnings.push(warning(lineNumber, raw, 'unknown_quote_id'));
      continue;
    }

    const voiceType = normalizeVoiceType(rawVoiceType);
    if (!voiceType) {
      warnings.push(warning(lineNumber, raw, 'invalid_voice_type'));
      continue;
    }

    const speaker = sanitizeAttributionSpeaker(rawSpeaker, voiceType);
    if (!speaker) {
      warnings.push(warning(lineNumber, raw, 'invalid_speaker'));
      continue;
    }

    const confidence = normalizeConfidence(rawConfidence);
    if (!confidence) {
      warnings.push(warning(lineNumber, raw, 'invalid_confidence'));
      continue;
    }
    if (!evidence) {
      warnings.push(warning(lineNumber, raw, 'empty_evidence'));
      continue;
    }

    attributions.push({ quoteId, voiceType, speaker, confidence, evidence, raw });
  }

  return { attributions, warnings };
}

function sanitizeAttributionSpeaker(value, voiceType = 'dialogue') {
  if (voiceType === 'system_voice' && String(value || '').trim() === '系统音') return '系统音';
  if (voiceType === 'sfx' && /^SFX$/i.test(String(value || '').trim())) return 'SFX';
  const speaker = sanitizeSpeaker(value);
  if (!speaker) return '';
  if (POLLUTED_SPEAKERS.has(speaker)) return '';
  return speaker;
}

function normalizeVoiceType(value) {
  const voiceType = String(value || '').trim();
  if (VALID_VOICE_TYPES.has(voiceType)) return voiceType;
  if (voiceType === '对白') return 'dialogue';
  if (voiceType === '内心' || voiceType === '内心独白') return 'inner_monologue';
  if (voiceType === '系统' || voiceType === '系统音') return 'system_voice';
  if (voiceType === '设备' || voiceType === '设备音') return 'device_voice';
  if (/^(?:音效|拟声|sfx)$/i.test(voiceType)) return 'sfx';
  return '';
}

function normalizeConfidence(value) {
  const confidence = String(value || '').trim().toLowerCase();
  if (VALID_CONFIDENCE.has(confidence)) return confidence;
  if (confidence === '高') return 'high';
  if (confidence === '中') return 'medium';
  if (confidence === '低') return 'low';
  return '';
}

function warning(line, raw, reason) {
  return { line, raw, reason };
}

module.exports = {
  parseQuoteAttributionLines,
  sanitizeAttributionSpeaker,
};
