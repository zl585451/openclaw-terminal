'use strict';

const DEFAULT_CHAPTER_TITLE = '未命名片段';

/**
 * 解析行协议文本为 segments 数组 + warnings 数组。
 * @param {string} rawText - 模型输出的行协议文本
 * @param {object} [options]
 * @param {string} [options.chapterTitle] - 章节标题，无则填"未命名片段"
 * @returns {{ segments: Array, warnings: Array, chapterTitle: string, totalCharCount: number }}
 */
function parseLineProtocol(rawText, options = {}) {
  const warnings = [];
  const segments = [];
  const chapterTitle = String(options.chapterTitle || DEFAULT_CHAPTER_TITLE).trim() || DEFAULT_CHAPTER_TITLE;
  const lines = String(rawText || '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const lineNumber = index + 1;
    if (!raw.trim()) continue;

    const pipeIndex = raw.indexOf('|');
    if (pipeIndex < 0) {
      warnings.push(makeWarning(lineNumber, raw, 'missing_separator'));
      continue;
    }

    const left = raw.slice(0, pipeIndex).trim();
    const text = raw.slice(pipeIndex + 1).trim();
    if (!left) {
      warnings.push(makeWarning(lineNumber, raw, 'empty_left'));
      continue;
    }
    if (!text) {
      warnings.push(makeWarning(lineNumber, raw, 'empty_text'));
      continue;
    }

    const parsed = parseLeft(left);
    if (!parsed.ok) {
      warnings.push(makeWarning(lineNumber, raw, parsed.reason));
      continue;
    }

    const segment = {
      segmentId: formatSegmentId(segments.length + 1),
      type: parsed.type,
      text,
    };
    if (parsed.speaker) segment.speaker = parsed.speaker;
    segments.push(segment);
  }

  return {
    segments,
    warnings,
    chapterTitle,
    totalCharCount: segments.reduce((sum, segment) => sum + segment.text.length, 0),
  };
}

function parseLeft(left) {
  if (left === '旁白') {
    return { ok: true, type: 'narration' };
  }

  if (left.startsWith('内心:')) {
    const speaker = left.slice('内心:'.length).trim();
    if (!speaker) return { ok: false, reason: 'empty_inner_speaker' };
    return { ok: true, type: 'inner_monologue', speaker };
  }

  const speaker = left.trim();
  if (!speaker) return { ok: false, reason: 'empty_speaker' };
  return { ok: true, type: 'dialogue', speaker };
}

function makeWarning(line, raw, reason) {
  return { line, raw, reason };
}

function formatSegmentId(index) {
  return `seg-${String(index).padStart(3, '0')}`;
}

module.exports = {
  parseLineProtocol,
  formatSegmentId,
};
