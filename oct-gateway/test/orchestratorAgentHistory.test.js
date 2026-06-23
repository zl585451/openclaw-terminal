'use strict';

// 自运行测试：node test/orchestratorAgentHistory.test.js
// 锁定 orchestrator.buildRecentHistoryMessages —— 给隔离会话的专职 Agent
// 注入最近对话历史（修复多轮调研丢上下文："看看最新的""你给的不对"指代失败）。
// 用 stub 替换 session.getHistory，零磁盘副作用。

const assert = require('assert');
const session = require('../session');
const orchestrator = require('../orchestrator');

const origGetHistory = session.getHistory;
try {
  // 空历史 → 空数组
  session.getHistory = () => [];
  assert.deepStrictEqual(orchestrator.buildRecentHistoryMessages('k'), [], '空历史返回空数组');

  // getHistory 抛错 → 空数组（不影响派发）
  session.getHistory = () => { throw new Error('boom'); };
  assert.deepStrictEqual(orchestrator.buildRecentHistoryMessages('k'), [], 'getHistory 异常时降级为空');

  // 过滤非 user/assistant + 截断超长 + 保留末条
  const long = 'x'.repeat(1000);
  session.getHistory = () => ([
    { role: 'user', content: '帮我查今天的 AI 新闻' },
    { role: 'system', content: '应被过滤掉' },
    { role: 'assistant', content: long },
    { role: 'user', content: '看看最新的，你给的都是去年的' },
  ]);
  const out = orchestrator.buildRecentHistoryMessages('k', { maxTurns: 6, maxCharsPerMsg: 800 });
  assert.ok(out.every((m) => m.role === 'user' || m.role === 'assistant'), 'system 角色被过滤');
  const truncated = out.find((m) => m.content.startsWith('x'));
  assert.ok(truncated.content.length === 801 && truncated.content.endsWith('…'), '超长内容截断到 800 + 省略号');
  assert.strictEqual(out[out.length - 1].content, '看看最新的，你给的都是去年的', '保留最后一轮用户消息（指代来源）');

  // maxTurns 只取最近 N 轮
  session.getHistory = () => Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `m${i}` }));
  const limited = orchestrator.buildRecentHistoryMessages('k', { maxTurns: 3 });
  assert.strictEqual(limited.length, 3, 'maxTurns 限制为 3');
  assert.strictEqual(limited[0].content, 'm7', '取的是最近 3 轮');

  console.log('PASS orchestrator buildRecentHistoryMessages injects recent context');
} finally {
  session.getHistory = origGetHistory;
}
