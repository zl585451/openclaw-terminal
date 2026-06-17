'use strict';

const assert = require('node:assert');
const SlashHandler = require('../gateway/slash');

function createConnection() {
  const sent = [];
  return {
    sent,
    send(payload) {
      sent.push(payload);
    },
  };
}

function createHandler() {
  const thinkModes = new Map();
  const resolvedModels = [];
  const history = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'world' },
  ];
  const providers = {
    mock: {
      id: 'mock',
      name: 'Mock Provider',
      baseUrl: 'https://mock.example/v1',
      apiKey: 'sk-mock',
      defaultModel: 'mock-default',
      supportsStreamOptions: false,
      models: [
        { id: 'mock-default', label: 'Mock Default', tools: true, thinking: false },
        { id: 'mock-think', label: 'Mock Think', tools: false, thinking: true },
      ],
    },
    other: {
      id: 'other',
      name: 'Other Provider',
      baseUrl: 'https://other.example/v1',
      apiKey: '',
      defaultModel: 'other-default',
      supportsStreamOptions: false,
      models: [{ id: 'other-default', label: 'Other Default', tools: true, thinking: false }],
    },
  };
  const config = {
    memory: { vectorRecall: { enabled: false } },
    ai_library: { enabled: false },
    DASHSCOPE_MODEL: 'mock-default',
    currentProvider: 'mock',
    PROVIDERS: providers,
    getProviderConfig: () => providers[config.currentProvider],
    getModelCaps: (model) => ({
      toolsSupport: model === 'mock-think' ? 'unsupported' : 'supported',
      supportsTools: model !== 'mock-think',
      capabilitySource: 'test_registry',
      supportsThinking: model === 'mock-think',
    }),
  };
  const handler = new SlashHandler({
    session: {
      getHistory: () => history,
      listSessions: () => ['main'],
      getThinkMode: (sessionKey) => thinkModes.get(sessionKey),
      setThinkMode: (sessionKey, level) => thinkModes.set(sessionKey, level),
      clearSession: () => {},
      clearThinkMode: () => {},
    },
    memory: { isAlive: async () => false },
    config,
    aiLibrary: { checkHealth: async () => false },
    tools: {},
    systemPromptReady: Promise.resolve('system prompt'),
    providerRouter: {
      resolve(model) {
        resolvedModels.push(model);
        return {
          provider: providers[config.currentProvider],
          caps: config.getModelCaps(model),
        };
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  });
  handler.__resolvedModels = resolvedModels;
  return handler;
}

async function main() {
  const handler = createHandler();

  {
    const connection = createConnection();
    await handler.handle('/help', { params: { sessionKey: 'main' } }, connection);
    assert.equal(connection.sent.length, 1);
    assert.equal(connection.sent[0].event, 'chat');
    assert.equal(connection.sent[0].payload.isSystemReply, true);
    assert.match(connection.sent[0].payload.text, /OCT Gateway 命令/);
    assert.match(connection.sent[0].payload.text, /\/status/);
    assert.match(connection.sent[0].payload.text, /\/new\s+— 保存并清空当前会话/);
  }

  {
    const connection = createConnection();
    await handler.handle('/unknown', { params: { sessionKey: 'main' } }, connection);
    assert.equal(connection.sent.length, 1);
    assert.equal(connection.sent[0].payload.isSystemReply, true);
    assert.match(connection.sent[0].payload.text, /未知命令：\/unknown/);
  }

  {
    const connection = createConnection();
    await handler.handle('/model', { params: { sessionKey: 'main' } }, connection);
    assert.equal(connection.sent.length, 1);
    assert.equal(connection.sent[0].payload.isSystemReply, undefined);
    assert.match(connection.sent[0].payload.text, /当前服务商：Mock Provider/);
    assert.match(connection.sent[0].payload.text, /mock-default/);
  }

  {
    const connection = createConnection();
    await handler.handle('/model mock-think', { params: { sessionKey: 'main' } }, connection);
    assert.equal(handler.config.DASHSCOPE_MODEL, 'mock-think');
    assert.ok(handler.__resolvedModels.includes('mock-think'));
    assert.match(connection.sent[0].payload.text, /已切换为：`mock-think`/);
    assert.match(connection.sent[0].payload.text, /不支持工具调用/);
  }

  {
    const connection = createConnection();
    await handler.handle('/provider', { params: { sessionKey: 'main' } }, connection);
    assert.match(connection.sent[0].payload.text, /当前服务商：`mock`/);
    assert.match(connection.sent[0].payload.text, /`other`/);
  }

  {
    const connection = createConnection();
    await handler.handle('/provider other', { params: { sessionKey: 'main' } }, connection);
    assert.equal(handler.config.currentProvider, 'other');
    assert.equal(handler.config.DASHSCOPE_MODEL, 'other-default');
    assert.match(connection.sent[0].payload.text, /已切换为：`other`/);
  }

  {
    const connection = createConnection();
    await handler.handle('/status', { params: { sessionKey: 'main' } }, connection);
    assert.equal(connection.sent.length, 1);
    assert.ok(handler.__resolvedModels.includes('other-default'));
    assert.equal(connection.sent[0].payload.isSystemReply, undefined);
    assert.match(connection.sent[0].payload.text, /OCT Gateway/);
    assert.match(connection.sent[0].payload.text, /Model: `other-default`/);
    assert.match(connection.sent[0].payload.text, /Tool 执行:/);
    assert.match(connection.sent[0].payload.text, /Memory v2: ❌ 离线/);
    assert.match(connection.sent[0].payload.text, /当前会话：2 条消息/);
  }

  {
    const connection = createConnection();
    await handler.handle('/think high', { params: { sessionKey: 'main' } }, connection);
    assert.equal(handler.session.getThinkMode('main'), 'high');
    assert.match(connection.sent[0].payload.text, /已开启高强度思考引导/);
  }

  {
    const connection = createConnection();
    await handler.handle('/cot', { params: { sessionKey: 'main' } }, connection);
    assert.match(connection.sent[0].payload.text, /当前状态：HIGH/);
    assert.match(connection.sent[0].payload.text, /\/cot off/);
  }

  console.log('PASS SlashHandler command regressions are covered');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
