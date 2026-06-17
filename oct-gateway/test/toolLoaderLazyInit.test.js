const assert = require('assert');
const path = require('path');

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

function testMemorySearchIsSingleExposedRecallTool() {
  const { toolLoader, restore } = freshToolLoaderWithCapturedLogs();
  try {
    const names = toolLoader.getDefinitions()
      .map((def) => def?.function?.name)
      .filter(Boolean);
    assert(names.includes('memory_search'));
    assert(names.includes('memory_read'));
    assert.equal(names.includes('memory_vector_search'), false);
    assert.equal(names.includes('memory_recall'), false);

    const memorySearch = toolLoader.getDefinitions()
      .find((def) => def?.function?.name === 'memory_search');
    const props = memorySearch?.function?.parameters?.properties || {};
    assert.deepEqual(props.mode.enum, ['keyword', 'vector', 'date', 'auto']);
    assert.equal(typeof props.date.description, 'string');
    assert.equal(typeof props.threshold.description, 'string');
  } finally {
    restore();
  }
}

function testOptionalToolDependenciesStayOutOfCoreGateway() {
  const gatewayPackage = require('../package.json');
  const optionalToolsPackage = require('../optional-tools/package.json');
  const optionalDeps = ['imapflow', 'mammoth', 'nodemailer', 'pdf-parse', 'xlsx'];

  for (const dep of optionalDeps) {
    assert.equal(
      gatewayPackage.dependencies[dep],
      undefined,
      `${dep} must stay out of oct-gateway core dependencies`
    );
    assert.equal(
      typeof optionalToolsPackage.dependencies[dep],
      'string',
      `${dep} must be declared by oct-gateway/optional-tools`
    );
  }
}

function testMissingOptionalDependencyMessageIsActionable() {
  const { loadOptionalDependency, formatMissingOptionalDependency } = require('../tools/optionalDependency');
  try {
    loadOptionalDependency('__oct_missing_optional_dependency__', { installName: 'missing-package' });
    assert.fail('missing optional dependency should throw');
  } catch (error) {
    const formatted = formatMissingOptionalDependency(error);
    assert.equal(error.code, 'OCT_OPTIONAL_DEPENDENCY_MISSING');
    assert.equal(formatted.success, false);
    assert(formatted.error.includes('缺少可选工具依赖'));
    assert(formatted.hint.includes(path.join('oct-gateway', 'optional-tools')) || formatted.hint.includes('oct-gateway/optional-tools'));
  }
}

testRequireDoesNotLoadStaticTools();
testFirstDefinitionsCallLoadsStaticToolsOnce();
testMemorySearchIsSingleExposedRecallTool();
testOptionalToolDependenciesStayOutOfCoreGateway();
testMissingOptionalDependencyMessageIsActionable();
console.log('PASS ToolLoader defers static tool loading until first use');
