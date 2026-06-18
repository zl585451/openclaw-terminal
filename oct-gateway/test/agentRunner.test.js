'use strict';

const assert = require('node:assert');
const agentRunner = require('../agents/agent_runner');
const toolLoader = require('../tool_loader');

async function testRequestClarifyStopsAgentLoopAndForwardsClarifyEvent() {
  const originalExecuteTool = toolLoader.executeTool;
  const originalGetDefinitions = toolLoader.getDefinitions;
  const originalFetch = globalThis.fetch;

  let fetchCount = 0;
  let receivedContext = null;
  const events = [];

  toolLoader.getDefinitions = () => [
    { type: 'function', function: { name: 'request_clarify', description: 'clarify tool' } },
  ];
  toolLoader.executeTool = async (_toolName, _args, context) => {
    receivedContext = context;
    context?.onToolEvent?.({
      type: 'clarify_open',
      payload: {
        spec: {
          title: '开始写作前',
          fields: [
            { id: 'genre', label: '想写什么类型？', type: 'single', options: ['小说', '专栏'] },
          ],
        },
      },
    });
    return {
      status: 'waiting_user_reply',
      message: '澄清询问器已展示给用户。请停止继续生成。',
    };
  };

  globalThis.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: '先问你几个关键问题。',
            tool_calls: [{
              id: 'tc_clarify',
              type: 'function',
              function: {
                name: 'request_clarify',
                arguments: '{"fields":[{"id":"genre","label":"想写什么类型？","type":"single","options":["小说","专栏"]}]}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { total_tokens: 9 },
      }),
    };
  };

  try {
    const result = await agentRunner.runAgent({
      agent: {
        name: 'Researcher',
        model: 'test-model',
        systemPrompt: 'system',
        formatUserMessage: () => 'user prompt',
        maxTurns: 3,
        timeoutMs: 5000,
      },
      task: {
        taskId: 'agent-clarify',
        instruction: '帮我先问几个问题',
      },
      onAgentEvent: (event) => events.push(event),
    });

    assert.equal(fetchCount, 1);
    assert.equal(result.status, 'waiting_user_reply');
    assert.equal(result.result, '');
    assert.equal(typeof receivedContext?.onToolEvent, 'function');
    assert(events.some((event) => event.type === 'clarify_open'));
  } finally {
    toolLoader.executeTool = originalExecuteTool;
    toolLoader.getDefinitions = originalGetDefinitions;
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  await testRequestClarifyStopsAgentLoopAndForwardsClarifyEvent();
  console.log('PASS agent runner clarify handling');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
