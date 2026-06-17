'use strict';

const { describe, expect, it } = globalThis;
const { analyzeIntent } = require('../orchestrator');

describe('orchestrator routing rules', () => {
  it('routes research and summary requests to Researcher', async () => {
    await expect(analyzeIntent('帮我搜一下今天 AI 新闻，整理成要点')).resolves.toMatchObject({
      intent: 'research',
      agent: 'Researcher',
      shouldDelegate: true,
      source: 'keyword',
    });
  });

  it('routes implementation requests to Coder', async () => {
    await expect(analyzeIntent('帮我写一个 typescript 函数处理日志')).resolves.toMatchObject({
      intent: 'code',
      agent: 'Coder',
      shouldDelegate: true,
      source: 'keyword',
    });
  });

  it('routes content creation requests to Writer', async () => {
    await expect(analyzeIntent('帮我写一篇关于焦虑管理的文章')).resolves.toMatchObject({
      intent: 'write',
      agent: 'Writer',
      shouldDelegate: true,
      source: 'keyword',
    });
  });

  it('keeps video script requests in Writer instead of Coder', async () => {
    await expect(analyzeIntent('帮我写一个短视频脚本')).resolves.toMatchObject({
      intent: 'write',
      agent: 'Writer',
      shouldDelegate: true,
      source: 'keyword',
    });
  });

  it('keeps emotional support in AMY even when technical words appear', async () => {
    await expect(analyzeIntent('这个 bug 把我搞崩溃了想放弃')).resolves.toMatchObject({
      intent: 'chat',
      agent: 'AMY',
      shouldDelegate: false,
      source: 'emotion',
    });
  });

  it('keeps short conversational messages in AMY', async () => {
    await expect(analyzeIntent('你好')).resolves.toMatchObject({
      intent: 'chat',
      agent: 'AMY',
      shouldDelegate: false,
      source: 'pattern',
    });
  });
});
