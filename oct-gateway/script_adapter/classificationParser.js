'use strict';

/**
 * 分类结果解析与校验。
 *
 * 职责：
 * 1. 解析行协议格式的分类结果
 * 2. 校验 speaker 污染词
 * 3. 将错误分类（动作标对白、第三人称心理描写标内心独白）降级
 */

const SPEAKER_POLLUTION_KEYWORDS = [
  '检查字数比例',
  '输出最终版本',
  '格式采用',
  '原文约',
  '符合',
  '作为AI',
  '语言模型',
  '根据您的要求',
  '我来帮你',
];

const THIRD_PERSON_PSYCHOLOGICAL_PATTERNS = [
  { pattern: /^她(心里|觉得|感觉|似乎|仿佛|想起|记得|意识|明白|懂得|以为|脑子里|隐约觉得)/, reason: 'third_person_psychological' },
  { pattern: /^他(心里|觉得|感觉|似乎|仿佛|想起|记得|意识|明白|懂得|以为|脑子里|隐约觉得)/, reason: 'third_person_psychological' },
  { pattern: /^周佳宁(心里|觉得|感觉|似乎|仿佛|想起|意识到|明白)/, reason: 'third_person_psychological' },
  { pattern: /^母亲(心里|觉得|感觉|似乎|仿佛|想起|意识到|明白)/, reason: 'third_person_psychological' },
  { pattern: /^老人(心里|觉得|感觉|似乎|仿佛|想起|意识到|明白)/, reason: 'third_person_psychological' },
];

const DIALOGUE_ACTION_DEMOTION_PATTERNS = [
  { pattern: /^[她他周佳宁母亲老人小孩孩子男人女人小姐][一-龥]{0,6}(站|走|推|拉|抬|转|伸|拿|放|捡|握|攥|打开|关|拧|插|按|摸|擦)/, reason: 'action_misclassified_as_dialogue' },
];

/**
 * 校验分类结果列表，返回降级后的分类列表 + warnings。
 * @param {Array} classifications - 原始分类结果
 * @returns {{ validated: Array, warnings: Array }}
 */
function validateClassifications(classifications) {
  const validated = [];
  const warnings = [];

  for (const cls of classifications) {
    const { item: validatedItem, itemWarnings } = validateSingleClassification(cls);
    if (validatedItem) {
      validated.push(validatedItem);
    }
    warnings.push(...itemWarnings);
  }

  return { validated, warnings };
}

function validateSingleClassification(cls) {
  const itemWarnings = [];
  let { type, speaker, text } = cls;

  // 1. speaker 污染检查
  if (speaker && isSpeakerPolluted(speaker)) {
    itemWarnings.push({
      paraId: cls.paraId,
      raw: cls.raw,
      reason: 'speaker_contamination',
      detail: `speaker含污染词: ${speaker}`,
    });
    // 不进入 segments，但记 warning
    return { item: null, itemWarnings };
  }

  // 2. dialogue 文本是否为第三人称动作，降级为 narration
  if (type === 'dialogue' && isThirdPersonAction(text)) {
    itemWarnings.push({
      paraId: cls.paraId,
      raw: cls.raw,
      reason: 'dialogue_action_misclassified',
      detail: `dialogue降级为narration: ${text.slice(0, 30)}`,
    });
    return { item: { ...cls, type: 'narration', speaker: undefined }, itemWarnings };
  }

  // 3. inner_monologue 文本是否为第三人称心理描写，降级为 narration
  if (type === 'inner_monologue' && isThirdPersonPsychological(text)) {
    itemWarnings.push({
      paraId: cls.paraId,
      raw: cls.raw,
      reason: 'inner_monologue_third_person',
      detail: `inner_monologue降级为narration: ${text.slice(0, 30)}`,
    });
    return { item: { ...cls, type: 'narration', speaker: undefined }, itemWarnings };
  }

  // 4. narration 文本中 speaker 不应有值（理论上不会发生）
  if (type === 'narration' && speaker) {
    speaker = undefined;
  }

  return {
    item: { ...cls, type, speaker },
    itemWarnings,
  };
}

function isSpeakerPolluted(speaker) {
  if (!speaker) return false;
  const s = String(speaker);
  return SPEAKER_POLLUTION_KEYWORDS.some((kw) => s.includes(kw));
}

function isThirdPersonAction(text) {
  if (!text) return false;
  return DIALOGUE_ACTION_DEMOTION_PATTERNS.some(({ pattern }) => pattern.test(text));
}

function isThirdPersonPsychological(text) {
  if (!text) return false;
  return THIRD_PERSON_PSYCHOLOGICAL_PATTERNS.some(({ pattern }) => pattern.test(text));
}

module.exports = {
  validateClassifications,
  isSpeakerPolluted,
  isThirdPersonAction,
  isThirdPersonPsychological,
  SPEAKER_POLLUTION_KEYWORDS,
};
