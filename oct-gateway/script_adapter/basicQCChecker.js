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

const VALID_SCRIPT_TYPES = new Set(['dialogue', 'inner_monologue']);

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
  checkConsecutiveNarration(segments, issues);

  return buildReport(issues);
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
      `台本文本包含 AI 污染关键词“${keyword}”。`,
      '删除 AI 套话并重新检查该段上下文。',
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

function checkConsecutiveNarration(segments, issues) {
  let streak = 0;
  let startSegmentId = '';
  for (const segment of segments) {
    if (segment?.type === 'narration') {
      streak += 1;
      if (streak === 1) startSegmentId = segment.segmentId || '全局';
      if (streak === 6) {
        issues.push(issue(
          'P1',
          'consecutive_narration',
          startSegmentId,
          '连续旁白 segment 超过 5 个。',
          '复核是否需要拆出对白、内心独白，或压缩连续叙述。',
        ));
      }
      continue;
    }
    streak = 0;
    startSegmentId = '';
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
  checkBasicQC,
};
