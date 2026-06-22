'use strict';

// 自运行断言脚本（与 slashHandlerRegression.test.js 同风格）：node test/thinkTagStreamParser.test.js
// 锁定从 ai.js 抽离的思考标签流式解析器行为。
const assert = require('assert');
const {
  createThinkTagStreamParser,
  normalizeThinkTags,
  findPartialTag,
  stripToolCallMarkers,
} = require('../runtime/thinkTagStreamParser');

// 收集 emit / onRawContent 输出的小工具
function makeParser(opts = {}) {
  const emitted = [];
  const rawContent = [];
  const parser = createThinkTagStreamParser({
    emit: (t) => emitted.push(t),
    onRawContent: (t) => rawContent.push(t),
    logger: { warn: () => {} },
    ...opts,
  });
  return {
    parser,
    visible: () => emitted.join(''),
    raw: () => rawContent.join(''),
  };
}

// ── 纯函数 ────────────────────────────────────────────────────
assert.strictEqual(stripToolCallMarkers('a[TOOL_CALL]b[TOOL_CALLS]c'), 'abc', 'strip 工具标记');
assert.strictEqual(findPartialTag('hello<redac', '<redacted_thinking>'), '<redac', 'findPartialTag 末尾残缺标签');
assert.strictEqual(findPartialTag('hello', '<redacted_thinking>'), '', 'findPartialTag 无重叠返回空');
{
  const n = normalizeThinkTags('foo<think>bar</think>baz');
  assert.ok(n.hadCotOpen && n.hadCotClose, 'normalizeThinkTags 识别标准标签');
  assert.ok(n.normalized.includes('<redacted_thinking>') && n.normalized.includes('</redacted_thinking>'), '标准标签转内部格式');
}

// ── 非思考模式：原样透传，不产生 [cot] ─────────────────────────
{
  const t = makeParser({ thinkTagMode: false });
  t.parser.processChunk('你好');
  t.parser.processChunk('世界');
  t.parser.flush();
  assert.strictEqual(t.visible(), '你好世界', '非思考模式透传');
  assert.strictEqual(t.raw(), '你好世界', '非思考模式记录原始 content');
  assert.strictEqual(t.parser.isThinkTagMode(), false, '非思考模式保持关闭');
}

// ── 思考模式：单个 redacted_thinking 块包成 [cot]...[/cot] ──────
{
  const t = makeParser({ thinkTagMode: true });
  t.parser.processChunk('<redacted_thinking>思考中</redacted_thinking>正文');
  t.parser.flush();
  assert.strictEqual(t.visible(), '[cot]思考中[/cot]正文', '单思考块包裹 + 正文释放');
}

// ── 交织式思考：多块共用同一个 CoT，块间用分隔线 ───────────────
{
  const t = makeParser({ thinkTagMode: true });
  t.parser.processChunk('<redacted_thinking>A</redacted_thinking>正文1<redacted_thinking>B</redacted_thinking>正文2');
  t.parser.flush();
  // 正文1 在 CoT 打开期间被暂存，flush 时释放；第二个思考块前插入分隔线
  assert.strictEqual(t.visible(), '[cot]A\n\n---\n\nB[/cot]正文1正文2', '交织思考共用 CoT 并暂存正文');
}

// ── 跨 chunk 的残缺标签：标签被切成两半也能正确解析 ────────────
{
  const t = makeParser({ thinkTagMode: true });
  t.parser.processChunk('<redacted_thin');
  t.parser.processChunk('king>思考</redacted_thinking>答案');
  t.parser.flush();
  assert.strictEqual(t.visible(), '[cot]思考[/cot]答案', '跨 chunk 残缺标签拼接');
}

// ── 标准 <think> 标签在未声明 thinkTagMode 时强制启用 ──────────
{
  const t = makeParser({ thinkTagMode: false });
  t.parser.processChunk('<think>隐式</think>结果');
  t.parser.flush();
  assert.strictEqual(t.parser.isThinkTagMode(), true, '检测到 <think> 强制启用标签模式');
  assert.strictEqual(t.visible(), '[cot]隐式[/cot]结果', '强制启用后按思考模式渲染');
}

// ── flush 幂等：未开启 CoT 时 flush 不产生输出 ─────────────────
{
  const t = makeParser({ thinkTagMode: true });
  t.parser.processChunk('纯正文');
  t.parser.flush();
  t.parser.flush();
  assert.strictEqual(t.visible(), '纯正文', '无思考块时 flush 不注入 [cot]/[/cot]');
}

console.log('PASS thinkTagStreamParser behavior is covered');
