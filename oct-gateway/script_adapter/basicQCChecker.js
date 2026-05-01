'use strict';

const AI_CONTAMINATION_KEYWORDS = [
  '作为AI',
  '作为一个AI',
  '语言模型',
  '我来帮你',
  '根据您的要求',
  '我无法',
  '作为人工智能',
];

const SPEAKER_POLLUTION_KEYWORDS = [
  '检查字数比例',
  '输出最终版本',
  '格式采用',
  '原文约',
  '符合',
  '作为AI',
  '语言模型',
  '根据您的要求',
];

const VALID_SCRIPT_TYPES = new Set(['dialogue', 'inner_monologue']);
const { isCueOnlyText, isSfxSpeaker, isSfxText } = require('./voiceTypeClassifier');

/**
 * 基础规则质检，不调用模型。
 * @param {object} params
 * @param {object} params.adaptedScript - AdaptedScriptPayload 或 adapted_script artifact
 * @param {string} [params.sourceText] - 原文，用于字数比检查
 * @param {Array} [params.parseWarnings] - 行协议解析 warnings
 * @param {number} [params.totalLineCount] - 行协议总非空行数
 * @returns {{ conclusion: 'pass'|'pass_with_changes'|'reject', issues: Array }}
 */
function checkBasicQC(params = {}) {
  const payload = normalizeAdaptedPayload(params.adaptedScript);
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const sourceText = String(params.sourceText || '');
  const parseWarnings = Array.isArray(params.parseWarnings) ? params.parseWarnings : [];
  const totalLineCount = Number(params.totalLineCount || 0);
  const issues = [];

  if (segments.length === 0) {
    issues.push(issue('P0', 'empty_script', '全局', '台本 segments 为空。', '重新执行文本改编，确保至少产出一个有效 segment。'));
    return buildReport(issues);
  }

  checkMissingSpeakers(segments, issues);
  checkAiContamination(segments, issues);
  checkNarrationOnly(segments, issues);
  checkCharRatio(payload, sourceText, issues);
  checkParseWarningHigh(parseWarnings, totalLineCount, issues);
  checkDialogueActionMisclassified(segments, issues);
  checkInnerMonologueActionMisclassified(segments, issues);
  checkInnerMonologueThirdPerson(segments, issues);
  checkSpeakerContamination(segments, issues);
  checkSpeakerProtocolResidue(segments, issues);
  checkDialogueDuplicatedInNarration(segments, issues);
  checkVoiceRegistryPollution(segments, issues);
  checkNarrationCueResidue(segments, issues);
  checkSfxRoleMisclassified(segments, issues);
  checkForeignInnerVoiceSpeaker(segments, sourceText, issues);

  return buildReport(issues);
}

function checkNarrationCueResidue(segments, issues) {
  for (const segment of segments) {
    if (segment?.type !== 'narration') continue;
    const text = String(segment.text || '').trim();
    if (!isCueOnlyText(text)) continue;
    issues.push(issue(
      'P1',
      'narration_cue_residue',
      segment.segmentId || '全局',
      `旁白段疑似只剩说话 cue：${text.slice(0, 30)}。`,
      '纯 cue 不应进入台本正文，应在 composer 阶段删除或并入归因证据。',
    ));
  }
}

function checkSfxRoleMisclassified(segments, issues) {
  for (const segment of segments) {
    if (segment?.type !== 'dialogue') continue;
    const text = String(segment.text || '').trim();
    const speaker = String(segment.speaker || '').trim();
    if (!isSfxText(text)) continue;
    if (speaker === 'SFX' || isSfxSpeaker(speaker)) continue;
    issues.push(issue(
      'P1',
      'sfx_role_misclassified',
      segment.segmentId || '全局',
      `拟声词疑似被当成角色对白：${speaker} -> ${text}。`,
      '拟声词、设备杂音应标为 SFX / 设备音，不应归到人物角色。',
    ));
  }
}

function checkForeignInnerVoiceSpeaker(segments, sourceText, issues) {
  const source = String(sourceText || '');
  if (!source.trim()) return;
  for (const segment of segments) {
    if (segment?.type !== 'inner_monologue') continue;
    const speaker = String(segment.speaker || '').trim();
    if (!speaker || source.includes(speaker)) continue;
    issues.push(issue(
      'P0',
      'foreign_inner_voice_speaker',
      segment.segmentId || '全局',
      `OS speaker "${speaker}" 未出现在本章原文，疑似跨书默认角色污染。`,
      '禁止使用测试期默认视角角色；应重新执行 viewpoint resolver 或降级为旁白。',
    ));
  }
}

function checkInnerMonologueActionMisclassified(segments, issues) {
  const actionPatterns = [
    /^(他|她|宁默|王大山|狱卒|男人|女人|老人|老犯人)(撑开|睁开|闭上|皱|抬|低|走|站|坐|蹲|放|端|看|盯|伸|拿|摆|退|推|打开|弯腰|咳)/,
  ];

  for (const segment of segments) {
    if (segment?.type !== 'inner_monologue') continue;
    const text = String(segment?.text || '');
    const matched = actionPatterns.some((p) => p.test(text));
    if (!matched) continue;
    issues.push(issue(
      'P1',
      'inner_monologue_action_misclassified',
      segment.segmentId || '全局',
      `inner_monologue 文本疑似第三人称动作：${text.slice(0, 30)}。`,
      '角色动作应归旁白；OS 只保留直接念头、即时反应和自我判断。',
    ));
  }
}

function checkSpeakerProtocolResidue(segments, issues) {
  const residuePattern = /[|"'“”‘’【】]/;
  for (const segment of segments) {
    if (!VALID_SCRIPT_TYPES.has(segment?.type)) continue;
    const speaker = String(segment.speaker || '').trim();
    if (!speaker) continue;
    if (!residuePattern.test(speaker) && speaker !== '角色名' && speaker !== '未知角色') continue;
    issues.push(issue(
      'P0',
      'speaker_protocol_residue',
      segment.segmentId || '全局',
      `speaker含协议残留或占位名：${speaker}。`,
      'speaker必须是干净角色名；请重新执行台词归因或过滤污染行。',
    ));
  }
}

function checkDialogueDuplicatedInNarration(segments, issues) {
  const narrations = segments
    .filter((segment) => segment?.type === 'narration')
    .map((segment) => ({ id: segment.segmentId || '旁白', text: normalizeForDupCheck(segment.text) }))
    .filter((segment) => segment.text);

  if (narrations.length === 0) return;

  for (const segment of segments) {
    if (!VALID_SCRIPT_TYPES.has(segment?.type)) continue;
    const dialogue = normalizeForDupCheck(segment.text);
    if (dialogue.length < 4) continue;
    const duplicatedIn = narrations.find((item) => item.text.includes(dialogue));
    if (!duplicatedIn) continue;
    issues.push(issue(
      'P0',
      'dialogue_duplicated_in_narration',
      segment.segmentId || '全局',
      `对白文本同时出现在旁白 ${duplicatedIn.id} 中：${String(segment.text || '').slice(0, 30)}。`,
      '同一 quote span 只能生成 dialogue/inner_monologue，不应保留在 narration 中。',
    ));
  }
}

function normalizeForDupCheck(value) {
  return String(value || '')
    .replace(/[“”"‘’【】\s]/g, '')
    .trim();
}

function normalizeAdaptedPayload(adaptedScript) {
  if (adaptedScript?.payload && Array.isArray(adaptedScript.payload.segments)) return adaptedScript.payload;
  return adaptedScript || {};
}

function checkMissingSpeakers(segments, issues) {
  for (const segment of segments) {
    if (!VALID_SCRIPT_TYPES.has(segment?.type)) continue;
    const speaker = String(segment.speaker || '').trim();
    if (speaker) continue;
    issues.push(issue(
      'P0',
      'missing_speaker',
      segment.segmentId || '全局',
      `${segment.type} segment 缺少 speaker。`,
      '为 dialogue 和 inner_monologue segment 补齐 speaker。',
    ));
  }
}

function checkAiContamination(segments, issues) {
  for (const segment of segments) {
    const text = String(segment?.text || '');
    const keyword = AI_CONTAMINATION_KEYWORDS.find((item) => text.includes(item));
    if (!keyword) continue;
    issues.push(issue(
      'P0',
      'ai_contamination',
      segment.segmentId || '全局',
      `台本文本包含 AI 污染关键词"${keyword}"。`,
      '删除 AI 套话并重新检查该段上下文。',
    ));
  }
}

function checkSpeakerContamination(segments, issues) {
  for (const segment of segments) {
    if (!VALID_SCRIPT_TYPES.has(segment?.type)) continue;
    const speaker = String(segment.speaker || '').trim();
    if (!speaker) continue;
    const polluted = SPEAKER_POLLUTION_KEYWORDS.find((kw) => speaker.includes(kw));
    if (!polluted) continue;
    issues.push(issue(
      'P0',
      'speaker_contamination',
      segment.segmentId || '全局',
      `speaker含污染词"${polluted}"：${speaker}。`,
      'speaker不能包含自检、元话语、AI套话。请重新执行分类。',
    ));
  }
}

function checkNarrationOnly(segments, issues) {
  if (segments.length > 0 && segments.every((segment) => segment?.type === 'narration')) {
    issues.push(issue(
      'P1',
      'narration_only',
      '全局',
      '台本全部为旁白，没有 dialogue 或 inner_monologue segment。',
      '复核原文是否确为纯叙述；如有对白或心理活动，应重新改写并拆出角色行。',
    ));
  }
}

function checkCharRatio(payload, sourceText, issues) {
  const sourceCharCount = sourceText.trim().length;
  if (sourceCharCount <= 0) return;
  const scriptCharCount = Number(payload?.totalCharCount)
    || (Array.isArray(payload?.segments) ? payload.segments.reduce((sum, segment) => sum + String(segment?.text || '').length, 0) : 0);
  const ratio = scriptCharCount / sourceCharCount;
  if (ratio >= 0.3 && ratio <= 1.2) return;
  issues.push(issue(
    'P1',
    'char_ratio_abnormal',
    '全局',
    `台本字数/原文字数异常：${ratio.toFixed(3)}。`,
    '检查是否过度压缩、扩写，或 sourceText/totalCharCount 是否传入错误。',
  ));
}

function checkParseWarningHigh(parseWarnings, totalLineCount, issues) {
  if (totalLineCount <= 0) return;
  const ratio = parseWarnings.length / totalLineCount;
  if (ratio <= 0.1) return;
  issues.push(issue(
    'P1',
    'parse_warning_high',
    '全局',
    `行协议解析 warning 过高：${parseWarnings.length}/${totalLineCount}。`,
    '检查模型输出是否混入解释文字、空左侧、空正文或缺少分隔符。',
  ));
}

function checkDialogueActionMisclassified(segments, issues) {
  const actionPatterns = [
    /^[她他周佳宁母亲老人小孩孩子男人女人小姐][一-龥]{0,6}(站|走|推|拉|抬|转|伸|拿|放|捡|握|攥|打开|关|拧|插|按|摸|擦)/,
  ];

  for (const segment of segments) {
    if (segment?.type !== 'dialogue') continue;
    const text = String(segment?.text || '');
    const matched = actionPatterns.some((p) => p.test(text));
    if (!matched) continue;
    issues.push(issue(
      'P1',
      'dialogue_action_misclassified',
      segment.segmentId || '全局',
      `dialogue segment 文本疑似动作/第三人称叙述：${text.slice(0, 30)}。`,
      '角色动作和身体感受应归旁白。检查该 segment 是否被误标为对白。',
    ));
  }
}

function checkInnerMonologueThirdPerson(segments, issues) {
  const thirdPersonPatterns = [
    /^她(心里|觉得|感觉|似乎|仿佛|想起|记得|意识|明白|懂得|以为|脑子里|隐约觉得)/,
    /^他(心里|觉得|感觉|似乎|仿佛|想起|记得|意识|明白|懂得|以为|脑子里|隐约觉得)/,
    /^周佳宁(心里|觉得|感觉|似乎|仿佛|想起|意识到|明白)/,
    /^母亲(心里|觉得|感觉|似乎|仿佛|想起|意识到|明白)/,
    /^老人(心里|觉得|感觉|似乎|仿佛|想起|意识到|明白)/,
  ];

  for (const segment of segments) {
    if (segment?.type !== 'inner_monologue') continue;
    const text = String(segment?.text || '');
    const matched = thirdPersonPatterns.some((p) => p.test(text));
    if (!matched) continue;
    issues.push(issue(
      'P1',
      'inner_monologue_third_person',
      segment.segmentId || '全局',
      `inner_monologue 文本疑似第三人称心理描写：${text.slice(0, 30)}。`,
      '第三人称心理描写应归旁白。只有直接念头才可标为内心独白。',
    ));
  }
}

function checkVoiceRegistryPollution(segments, issues) {
  const KNOWN_SPECIAL_VOICES = new Set(['旁白', '旁白女', '旁白男']);

  for (const segment of segments) {
    if (!VALID_SCRIPT_TYPES.has(segment?.type)) continue;
    const speaker = String(segment?.speaker || '').trim();
    if (!speaker) continue;
    if (speaker.length > 12 && !KNOWN_SPECIAL_VOICES.has(speaker)) {
      issues.push(issue(
        'P1',
        'voice_registry_pollution_risk',
        segment.segmentId || '全局',
        `speaker名疑似异常长：${speaker}（${speaker.length}字符）。`,
        '检查该 speaker 是否为污染词或分类错误。',
      ));
    }
  }
}

function buildReport(issues) {
  let conclusion = 'pass';
  if (issues.some((item) => item.severity === 'P0')) conclusion = 'reject';
  else if (issues.length > 0) conclusion = 'pass_with_changes';
  return { conclusion, issues };
}

function issue(severity, category, location, description, suggestion) {
  return {
    severity,
    category,
    location,
    description,
    suggestion,
  };
}

module.exports = {
  AI_CONTAMINATION_KEYWORDS,
  SPEAKER_POLLUTION_KEYWORDS,
  checkBasicQC,
};
