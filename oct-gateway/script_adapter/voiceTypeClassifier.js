'use strict';

const SFX_TEXT_RE = /^(?:(?:咔|咚|砰|啪|哗啦|滋啦|吱呀|滴|嗡|轰|咔嚓|咳|嘶|沙|咯)(?:[~…。.！!？?\-—，,、]*)\s*)+$/;
const SYSTEM_CUE_TEXT_RE = /^(?:叮|滴)(?:[~…。.！!？?\-—]*|[，,、：:])|(?:系统|宿主|绑定|检测|面板|任务|奖励|惩罚|积分|商城|签到|属性|加载|启动|激活|发布|完成|失败|权限|警告|提示)/;
const SYSTEM_SPEAKER_RE = /^(?:系统音|系统|提示音|电子提示音)$/;
const DEVICE_SPEAKER_RE = /^(?:对讲机|广播|电话|录音|无线电|通讯器|通讯设备|电台|收音机)$/;
const SFX_SPEAKER_RE = /^(?:SFX|音效|拟声|机械音|警报|门铃|铃声)$/i;
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
    if (isSystemVoiceText(text)) return 'system_voice';
    return 'narrator';
  }
  if (type === 'inner_monologue') return 'inner_monologue';
  if (isSystemSpeaker(speaker) && isSystemVoiceText(text)) return 'system_voice';
  if (isDeviceSpeaker(speaker)) return 'device_voice';
  if (isSfxSpeaker(speaker) || isSfxText(text)) return 'sfx';
  if (isSystemSpeaker(speaker)) return 'system_voice';
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

function isSystemSpeaker(speaker) {
  return SYSTEM_SPEAKER_RE.test(String(speaker || '').trim());
}

function isDeviceSpeaker(speaker) {
  return DEVICE_SPEAKER_RE.test(String(speaker || '').trim());
}

function isSystemVoiceText(text) {
  return SYSTEM_CUE_TEXT_RE.test(String(text || '').trim());
}

function normalizeFunctionalSpeaker(item = {}) {
  const speaker = String(item.speaker || '').trim();
  const text = String(item.text || '').trim();
  if (!speaker && isSfxText(text)) return 'SFX';
  if (isSystemSpeaker(speaker) && isSfxText(text) && !isSystemVoiceText(text)) return 'SFX';
  if (isSfxSpeaker(speaker) && !/^SFX$/i.test(speaker)) return 'SFX';
  return speaker;
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
  isDeviceSpeaker,
  isSfxSpeaker,
  isSfxText,
  isSystemSpeaker,
  isSystemVoiceText,
  normalizeFunctionalSpeaker,
  isUnresolvedSpeaker,
};
