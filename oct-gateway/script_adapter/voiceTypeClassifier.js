'use strict';

const SFX_TEXT_RE = /^(?:咔|咚|砰|啪|哗啦|滋啦|吱呀|叮|滴|嗡|轰|咔嚓|咳|嘶)(?:[~…。.！!？?\-—]*)$/;
const SFX_SPEAKER_RE = /^(?:系统音|对讲机|广播|电话|录音|警报|提示音|机械音|门铃|铃声)$/;
const UNRESOLVED_SPEAKER_RE = /^(?:未定|未知|神秘).*(?:声|音|人|男|女)|.*(?:女声|男声)[A-Z]?$/;
const GROUP_SPEAKER_RE = /(?:群|众人|弟子们|百姓|人群|同门)$/;
const CUE_ONLY_RE = /^([一-龥]{1,8}|他|她|众人|几人|大家)?(?:忽然|突然|闻言|连忙|低声|冷声|笑着|恭声|平淡|解释|承认|问)?(?:开口|说道|说|道|问道|问|笑道|低声道|冷声道|解释道|承认道|吐槽道|附和)[：:]?$/;
const SPEAKER_CUE_RE = /^[一-龥]{2,6}[：:]$/;

function classifyVoiceType(item = {}) {
  const speaker = String(item.speaker || '').trim();
  const text = String(item.text || '').trim();
  const type = String(item.type || '').trim();

  if (type === 'narration') {
    if (isCueOnlyText(text)) return 'cue';
    if (isSfxText(text)) return 'sfx';
    return 'narrator';
  }
  if (type === 'inner_monologue') return 'inner_monologue';
  if (isSfxSpeaker(speaker) || isSfxText(text)) return 'sfx';
  if (isUnresolvedSpeaker(speaker)) return 'unresolved_voice';
  if (GROUP_SPEAKER_RE.test(speaker)) return 'group_voice';
  return 'character';
}

function isSfxText(text) {
  return SFX_TEXT_RE.test(String(text || '').trim());
}

function isSfxSpeaker(speaker) {
  return SFX_SPEAKER_RE.test(String(speaker || '').trim());
}

function isUnresolvedSpeaker(speaker) {
  return UNRESOLVED_SPEAKER_RE.test(String(speaker || '').trim());
}

function isCueOnlyText(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (SPEAKER_CUE_RE.test(value)) return true;
  if (CUE_ONLY_RE.test(value)) return true;
  return false;
}

module.exports = {
  classifyVoiceType,
  isCueOnlyText,
  isSfxSpeaker,
  isSfxText,
  isUnresolvedSpeaker,
};
