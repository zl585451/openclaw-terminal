'use strict';

const DEFAULT_MIN_FINAL_CHARS = 60;

const FINAL_ANSWER_INSTRUCTION = [
  '请基于以上已获取的全部工具结果，直接输出完整的最终结论。',
  '不要再调用工具，不要再写过渡句。',
  '如果信息不足以形成确定结论，请如实说明你已经查到了什么、还缺什么、下一步建议是什么。',
  'content 字段就是用户看到的最终答案。',
].join('');

function getTrimmedLength(text) {
  return String(text || '').trim().length;
}

function isSuspiciouslyShortFinal(text, minChars = DEFAULT_MIN_FINAL_CHARS) {
  return getTrimmedLength(text) < minChars;
}

function evaluateFinalAnswerGuard({
  text,
  hasToolEvidence,
  toolChoice,
  forcedFinalAttempt,
  minChars = DEFAULT_MIN_FINAL_CHARS,
} = {}) {
  const length = getTrimmedLength(text);
  if (!hasToolEvidence) {
    return { shouldForce: false, reason: 'no_tool_evidence', length, minChars };
  }
  if (toolChoice === 'none') {
    return { shouldForce: false, reason: 'tool_choice_none', length, minChars };
  }
  if (forcedFinalAttempt) {
    return { shouldForce: false, reason: 'already_forced', length, minChars };
  }
  if (length === 0) {
    return { shouldForce: true, reason: 'empty', length, minChars };
  }
  if (length < minChars) {
    return { shouldForce: true, reason: 'too_short', length, minChars };
  }
  return { shouldForce: false, reason: 'long_enough', length, minChars };
}

function buildFinalAnswerInstruction() {
  return FINAL_ANSWER_INSTRUCTION;
}

function appendFinalAnswerInstruction(messages, instruction = FINAL_ANSWER_INSTRUCTION) {
  const base = Array.isArray(messages) ? messages : [];
  return [
    ...base,
    { role: 'user', content: instruction },
  ];
}

module.exports = {
  DEFAULT_MIN_FINAL_CHARS,
  evaluateFinalAnswerGuard,
  isSuspiciouslyShortFinal,
  buildFinalAnswerInstruction,
  appendFinalAnswerInstruction,
};
