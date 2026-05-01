'use strict';

const SPEECH_VERBS = '(?:开门见山|低声|沉声|冷声|笑着|冷笑|怒声|厉声|淡淡|缓缓|忽然|突然|问|说|喊|叫|道|骂|吼|答|回答|提醒|嘀咕|喃喃|应声|出声)';
const BAD_SPEAKERS = new Set(['角色名', '未知角色', '旁白', '对白', '内心', '他说', '她说']);

function extractSpeakerCandidates(spanDoc, options = {}) {
  const quotes = Array.isArray(spanDoc?.quotes) ? spanDoc.quotes : [];
  const knownRoles = Array.isArray(options.knownRoles) ? options.knownRoles.map(String) : [];
  let previousSpeaker = '';

  return quotes.map((quote, index) => {
    const candidates = [];
    addCandidate(candidates, systemCandidate(quote));
    addCandidates(candidates, fromPreCue(quote, knownRoles));
    addCandidates(candidates, fromPostCue(quote, knownRoles));
    addCandidates(candidates, fromSceneVoice(quote, knownRoles));
    addCandidates(candidates, fromGroupCue(quote));

    if (previousSpeaker && candidates.length === 0 && index > 0) {
      addCandidate(candidates, {
        speaker: previousSpeaker,
        evidenceType: 'continuous_dialogue',
        evidenceText: '连续对白弱继承上一句说话人',
        confidenceHint: 'low',
      });
    }

    const strongest = candidates.find((item) => item.confidenceHint === 'high') || candidates[0];
    if (strongest?.speaker && strongest.speaker !== '系统音') previousSpeaker = strongest.speaker;

    return {
      quoteId: quote.quoteId,
      candidates,
    };
  });
}

function systemCandidate(quote) {
  if (quote?.kindHint !== 'system_voice') return null;
  return {
    speaker: '系统音',
    evidenceType: 'system_mark',
    evidenceText: quote.rawText || quote.text,
    confidenceHint: 'high',
  };
}

function fromPreCue(quote, knownRoles) {
  const left = normalizeContext(quote?.leftContext);
  const tail = left.slice(-80);
  const results = [];

  for (const role of knownRoles) {
    if (!role) continue;
    const pattern = new RegExp(`${escapeRegExp(role)}[^。！？“”"\\n]{0,12}${SPEECH_VERBS}(?:道|说|问|喊|叫)?[：:]?\\s*$`);
    if (pattern.test(tail)) {
      results.push(makeCandidate(role, 'pre_cue', tail, 'high'));
    }
  }

  const generic = tail.match(/([一-龥A-Za-z0-9·]{1,12})[^。！？“”"\n]{0,12}(?:道|说道|问道|喊道|叫道|骂道|开口|开门见山道|低声道|沉声道|冷声道)[：:]?\s*$/);
  if (generic) results.push(makeCandidate(generic[1], 'pre_cue', generic[0], 'high'));

  return results;
}

function fromPostCue(quote, knownRoles) {
  const right = normalizeContext(quote?.rightContext).slice(0, 90);
  const results = [];

  for (const role of knownRoles) {
    if (!role) continue;
    const pattern = new RegExp(`^\\s*[，,。！？!?、]*\\s*${escapeRegExp(role)}[^。！？“”"\\n]{0,12}${SPEECH_VERBS}`);
    if (pattern.test(right)) {
      results.push(makeCandidate(role, 'post_cue', right, 'high'));
    }
  }

  const generic = right.match(/^\s*[，,。！？!?、]*\s*([一-龥A-Za-z0-9·]{1,12})[^。！？“”"\n]{0,12}(?:道|说道|问道|喊道|叫道|骂道|低声道|沉声道|冷声道|开口)/);
  if (generic) results.push(makeCandidate(generic[1], 'post_cue', generic[0], 'high'));

  return results;
}

function fromSceneVoice(quote, knownRoles) {
  const left = normalizeContext(quote?.leftContext).slice(-100);
  const results = [];
  const scene = left.match(/([一-龥A-Za-z0-9·]{1,12})的声音[^。！？“”"\n]{0,24}$/);
  if (scene) results.push(makeCandidate(normalizeSceneSpeaker(scene[1], knownRoles), 'scene_voice', scene[0], 'high'));

  for (const role of knownRoles) {
    if (!role) continue;
    const pattern = new RegExp(`${escapeRegExp(role)}的声音`);
    if (pattern.test(left)) results.push(makeCandidate(role, 'scene_voice', left, 'high'));
  }
  return results;
}

function fromGroupCue(quote) {
  const ctx = `${normalizeContext(quote?.leftContext).slice(-80)} ${normalizeContext(quote?.rightContext).slice(0, 40)}`;
  const cues = [
    { pattern: /(众人|众弟子|众官兵|众犯人)/, speaker: '$1' },
    { pattern: /(外门弟子|村民|犯人|狱卒|士兵|弟子|百姓)们?/, speaker: '$1群' },
    { pattern: /(几名|几个|一群|一众)(外门弟子|村民|犯人|狱卒|士兵|弟子|百姓)/, speaker: '$2群' },
  ];

  for (const cue of cues) {
    const matched = ctx.match(cue.pattern);
    if (!matched) continue;
    const speaker = cue.speaker.replace(/\$(\d+)/g, (_, n) => matched[Number(n)] || '');
    return [makeCandidate(speaker, 'group_cue', matched[0], 'medium')];
  }
  return [];
}

function addCandidates(list, items) {
  for (const item of Array.isArray(items) ? items : []) addCandidate(list, item);
}

function addCandidate(list, candidate) {
  if (!candidate) return;
  const speaker = sanitizeSpeaker(candidate.speaker);
  if (!speaker) return;
  if (list.some((item) => item.speaker === speaker && item.evidenceType === candidate.evidenceType)) return;
  list.push({ ...candidate, speaker });
}

function makeCandidate(speaker, evidenceType, evidenceText, confidenceHint) {
  return {
    speaker,
    evidenceType,
    evidenceText: String(evidenceText || '').trim().slice(0, 80),
    confidenceHint,
  };
}

function sanitizeSpeaker(value) {
  const raw = String(value || '').trim();
  if (/[|"'“”‘’【】]/.test(raw)) return '';
  const speaker = raw.replace(/[：:\s]/g, '');
  if (!speaker || speaker.length > 12) return '';
  if (BAD_SPEAKERS.has(speaker)) return '';
  return speaker;
}

function normalizeContext(value) {
  return String(value || '').replace(/\s+/g, ' ');
}

function normalizeSceneSpeaker(value, knownRoles = []) {
  const raw = String(value || '').trim();
  const known = knownRoles.find((role) => role && raw.includes(role));
  if (known) return known;
  return raw.replace(/^(一个|一名|那名|这个|那个|有个|有名)/, '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  extractSpeakerCandidates,
  sanitizeSpeaker,
};
