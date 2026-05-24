const assert = require('assert');

function freshToolLoaderWithCapturedLogs() {
  const modulePath = require.resolve('../tool_loader');
  delete require.cache[modulePath];
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const toolLoader = require('../tool_loader');
    return { toolLoader, logs, restore: () => { console.log = originalLog; } };
  } catch (error) {
    console.log = originalLog;
    throw error;
  }
}

function testRequireDoesNotLoadStaticTools() {
  const { logs, restore } = freshToolLoaderWithCapturedLogs();
  try {
    assert.equal(logs.some((line) => line.includes('[ToolLoader] 已加载工具')), false);
    assert.equal(logs.some((line) => line.includes('[ToolLoader] 共加载')), false);
  } finally {
    restore();
  }
}

function testFirstDefinitionsCallLoadsStaticToolsOnce() {
  const { toolLoader, logs, restore } = freshToolLoaderWithCapturedLogs();
  try {
    const defs = toolLoader.getDefinitions();
    const firstLoadCount = logs.filter((line) => line.includes('[ToolLoader] 共加载')).length;
    assert(Array.isArray(defs));
    assert.equal(firstLoadCount, 1);

    toolLoader.getDefinitions();
    const secondLoadCount = logs.filter((line) => line.includes('[ToolLoader] 共加载')).length;
    assert.equal(secondLoadCount, 1);
  } finally {
    restore();
  }
}

testRequireDoesNotLoadStaticTools();
testFirstDefinitionsCallLoadsStaticToolsOnce();
console.log('PASS ToolLoader defers static tool loading until first use');
