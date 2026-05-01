'use strict';

const { describe, it, expect } = globalThis;
const { extractQuoteSpans } = require('../script_adapter/quoteSpanExtractor');
const { extractSpeakerCandidates, sanitizeSpeaker } = require('../script_adapter/speakerCandidateExtractor');

function speakersFor(sourceText, knownRoles = []) {
  const doc = extractQuoteSpans({ sourceText });
  return extractSpeakerCandidates(doc, { knownRoles });
}

describe('speakerCandidateExtractor', () => {
  it('extracts scene voice speaker without using addressed name inside quote', () => {
    const sets = speakersFor('监牢中又响起一个狱卒的声音：“宁默，有人来看你！”', ['宁默', '狱卒']);
    expect(sets[0].candidates[0].speaker).toBe('狱卒');
    expect(sets[0].candidates[0].evidenceType).toBe('scene_voice');
  });

  it('extracts post cue speaker', () => {
    const sets = speakersFor('“你终于醒了。”王大山沉声道。', ['王大山']);
    expect(sets[0].candidates[0].speaker).toBe('王大山');
    expect(sets[0].candidates[0].evidenceType).toBe('post_cue');
  });

  it('extracts system voice candidate', () => {
    const sets = speakersFor('【叮，系统已激活】');
    expect(sets[0].candidates[0].speaker).toBe('系统音');
    expect(sets[0].candidates[0].confidenceHint).toBe('high');
  });

  it('rejects polluted speakers', () => {
    expect(sanitizeSpeaker('角色名')).toBe('');
    expect(sanitizeSpeaker('宁默|“醒了？”')).toBe('');
  });
});
