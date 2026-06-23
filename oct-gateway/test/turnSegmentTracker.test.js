'use strict';

const assert = require('node:assert');
const { TurnSegmentTracker } = require('../runtime/turnSegmentTracker');

function collect() {
  const events = [];
  const tracker = new TurnSegmentTracker({ turnId: 't1', emit: (seg) => events.push(seg) });
  return { events, tracker };
}

// 工具调用前的正文段与最终答案段必须是不同的 segId（结构上消除重复）
function testToolBoundarySeparatesSegments() {
  const { events, tracker } = collect();

  // 第一轮：工具前正文
  tracker.text('我来查一下');
  // 工具开始 → 闭文本段，开 tool_use 段
  tracker.toolOpen('web_search', 'call_1');
  // 工具结束 → 闭 tool_use 段
  tracker.toolResult();
  // 第二轮：最终答案
  tracker.text('完整报告内容');
  tracker.finish('end_turn');

  const opens = events.filter((e) => e.op === 'open');
  const deltas = events.filter((e) => e.op === 'delta');
  const finish = events.find((e) => e.op === 'finish');

  // 3 个段：text / tool_use / text
  assert.equal(opens.length, 3);
  assert.equal(opens[0].type, 'text');
  assert.equal(opens[1].type, 'tool_use');
  assert.equal(opens[2].type, 'text');

  // 工具前正文段与最终答案段 segId 不同 → 不可能拼接
  assert.notEqual(opens[0].segId, opens[2].segId);
  assert.equal(opens[0].segId, 't1:s0');
  assert.equal(opens[2].segId, 't1:s2');

  // 两段文本各自归属正确的 segId
  assert.equal(deltas[0].segId, 't1:s0');
  assert.equal(deltas[0].text, '我来查一下');
  assert.equal(deltas[1].segId, 't1:s2');
  assert.equal(deltas[1].text, '完整报告内容');

  // tool_use 段带 meta
  assert.equal(opens[1].meta.tool, 'web_search');
  assert.equal(opens[1].meta.callId, 'call_1');

  // finish 带显式 stopReason
  assert.equal(finish.stopReason, 'end_turn');

  // 每个 open 都有对应的 close
  const closes = events.filter((e) => e.op === 'close');
  assert.equal(closes.length, 3);

  // 工具前正文段（s0）在 close 时被重标为 preamble；最终答案段（s2）不重标
  const closeS0 = closes.find((e) => e.segId === 't1:s0');
  const closeS2 = closes.find((e) => e.segId === 't1:s2');
  assert.equal(closeS0.type, 'preamble');
  assert.equal(closeS2.type, undefined);
}

// 无工具调用的纯答案：close 不带 preamble 重标（不影响普通回复）
function testPlainAnswerNotRelabeled() {
  const { events, tracker } = collect();
  tracker.text('普通回复');
  tracker.finish('end_turn');
  const close = events.find((e) => e.op === 'close');
  assert.equal(close.type, undefined);
}

// 连续文本 chunk 累积进同一段
function testConsecutiveTextStaysInOneSegment() {
  const { events, tracker } = collect();
  tracker.text('一');
  tracker.text('二');
  tracker.text('三');
  tracker.finish();

  const opens = events.filter((e) => e.op === 'open');
  const deltas = events.filter((e) => e.op === 'delta');
  assert.equal(opens.length, 1);
  assert.equal(deltas.length, 3);
  assert.ok(deltas.every((d) => d.segId === 't1:s0'));
}

function main() {
  testToolBoundarySeparatesSegments();
  testConsecutiveTextStaysInOneSegment();
  testPlainAnswerNotRelabeled();
  console.log('PASS turn segment tracker separates tool-boundary segments');
}

main();
