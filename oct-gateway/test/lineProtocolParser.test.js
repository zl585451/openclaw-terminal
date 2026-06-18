'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseLineProtocol } = require('../script_adapter/lineProtocolParser');

const realOutputDir = 'E:\\windows-window\\内容做做平台MVP计划\\prompt-iterations\\round9';
const realOutputFiles = [
  'ch-test-01-output.txt',
  'ch-test-02-output.txt',
  'ch-test-03-output.txt',
];
const missingRealOutputFiles = realOutputFiles
  .map((file) => path.join(realOutputDir, file))
  .filter((filePath) => !fs.existsSync(filePath));
const maybeRealOutputIt = missingRealOutputFiles.length === 0 ? it : it.skip;

function nonEmptyLineCount(text) {
  return String(text || '').split(/\r?\n/).filter((line) => line.trim()).length;
}

function expectContinuousSegmentIds(segments) {
  for (let index = 0; index < segments.length; index += 1) {
    expect(segments[index].segmentId).toBe(`seg-${String(index + 1).padStart(3, '0')}`);
  }
}

describe('parseLineProtocol', () => {
  it('parses narration, dialogue, and inner monologue lines', () => {
    const result = parseLineProtocol([
      '旁白|风从楼道吹进来。',
      '周佳宁|知道了。',
      '内心:周佳宁|她觉得这件事不简单。',
    ].join('\n'), { chapterTitle: '测试章' });

    expect(result.chapterTitle).toBe('测试章');
    expect(result.warnings).toEqual([]);
    expect(result.segments).toEqual([
      { segmentId: 'seg-001', type: 'narration', text: '风从楼道吹进来。' },
      { segmentId: 'seg-002', type: 'dialogue', speaker: '周佳宁', text: '知道了。' },
      { segmentId: 'seg-003', type: 'inner_monologue', speaker: '周佳宁', text: '她觉得这件事不简单。' },
    ]);
  });

  it('skips empty lines', () => {
    const result = parseLineProtocol('\n旁白|第一句。\n\n周佳宁|嗯。\n');
    expect(result.warnings).toEqual([]);
    expect(result.segments).toHaveLength(2);
    expectContinuousSegmentIds(result.segments);
  });

  it('collects malformed lines as warnings without throwing', () => {
    const result = parseLineProtocol([
      '没有分隔符',
      '旁白|',
      '|右侧有文本',
      '内心:   |没有角色名',
      '旁白|有效行',
    ].join('\n'));

    expect(result.segments).toEqual([
      { segmentId: 'seg-001', type: 'narration', text: '有效行' },
    ]);
    expect(result.warnings).toEqual([
      { line: 1, raw: '没有分隔符', reason: 'missing_separator' },
      { line: 2, raw: '旁白|', reason: 'empty_text' },
      { line: 3, raw: '|右侧有文本', reason: 'empty_left' },
      { line: 4, raw: '内心:   |没有角色名', reason: 'empty_inner_speaker' },
    ]);
  });

  it('keeps pipes inside text and trims speaker/text whitespace', () => {
    const result = parseLineProtocol('  周佳宁  |  A|B|C  ');
    expect(result.warnings).toEqual([]);
    expect(result.segments).toEqual([
      { segmentId: 'seg-001', type: 'dialogue', speaker: '周佳宁', text: 'A|B|C' },
    ]);
  });

  it('assigns continuous segment ids and computes totalCharCount', () => {
    const result = parseLineProtocol([
      '旁白|一二三',
      '甲|四五',
      '内心:乙|六',
    ].join('\n'));

    expectContinuousSegmentIds(result.segments);
    expect(result.totalCharCount).toBe(6);
  });

  it('uses default chapter title when absent or blank', () => {
    expect(parseLineProtocol('旁白|文本').chapterTitle).toBe('未命名片段');
    expect(parseLineProtocol('旁白|文本', { chapterTitle: '   ' }).chapterTitle).toBe('未命名片段');
  });

  maybeRealOutputIt('parses phase 1 real outputs with at least 95% success', () => {
    for (const file of realOutputFiles) {
      const filePath = path.join(realOutputDir, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const result = parseLineProtocol(raw, { chapterTitle: file });
      const total = nonEmptyLineCount(raw);
      const successRate = total === 0 ? 0 : result.segments.length / total;

      expect(successRate, `${file} successRate`).toBeGreaterThanOrEqual(0.95);
      expect(result.segments.length, `${file} segments`).toBeGreaterThan(0);
      expectContinuousSegmentIds(result.segments);
      for (const segment of result.segments) {
        if (segment.speaker) expect(segment.speaker).toBe(segment.speaker.trim());
      }
    }
  });
});
