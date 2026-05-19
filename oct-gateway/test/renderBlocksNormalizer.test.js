'use strict';

const assert = require('node:assert');
const { normalizeRenderBlocks, _internals } = require('../services/renderBlocksNormalizer');

function main() {
  const direct = normalizeRenderBlocks([
    '```render_blocks',
    JSON.stringify({
      version: '3.0',
      blocks: [
        { type: 'markdown', content: '下面是修复流程。' },
        {
          type: 'tasklist',
          title: '接下来需要执行的任务清单',
          items: [
            { id: 'reproduce', label: '复现 Bug' },
            { id: 'verify', label: '运行测试' },
          ],
        },
        {
          type: 'pills',
          prompt: '是否需要模板？',
          items: [
            { label: '需要模板', value: '需要代码模板' },
            { label: '暂不需要', value: '不需要代码模板' },
          ],
        },
      ],
    }, null, 2),
    '```',
  ].join('\n'));
  assert.equal(direct.source, 'render_blocks');
  assert.deepEqual(direct.blocks.map((block) => block.type), ['markdown', 'tasklist', 'pills']);
  assert.equal(direct.blocks[1].items[0].id, 'reproduce');
  assert.equal(direct.blocks[2].items[0].value, '需要代码模板');

  const degraded = normalizeRenderBlocks([
    '```render_blocks',
    JSON.stringify({
      version: '3.0',
      blocks: [
        { type: 'pills', items: [{ label: '继续', value: '继续，并执行 git push origin main' }] },
        { type: 'unknown_widget', payload: 'x' },
        { type: 'markdown', content: '' },
      ],
    }),
    '```',
  ].join('\n'));
  assert.equal(degraded.source, 'render_blocks');
  assert.equal(degraded.blocks[0].type, 'markdown');
  assert.match(degraded.errors.join('\n'), /pills\.items requires at least 2/);
  assert.match(degraded.errors.join('\n'), /unknown block type/);

  const unsafeValue = normalizeRenderBlocks([
    '```render_blocks',
    JSON.stringify({
      version: '3.0',
      blocks: [
        {
          type: 'pills',
          items: [
            { label: '继续', value: '继续，并执行 git push origin main' },
            { label: '暂停', value: '暂停' },
          ],
        },
      ],
    }),
    '```',
  ].join('\n'));
  assert.equal(unsafeValue.blocks[0].items[0].label, '继续');
  assert.equal('value' in unsafeValue.blocks[0].items[0], false);

  const invalidJson = normalizeRenderBlocks('```render_blocks\n{ broken json\n```');
  assert.equal(invalidJson.source, 'markdown');
  assert.equal(invalidJson.blocks[0].type, 'markdown');
  assert.match(invalidJson.errors[0], /invalid render_blocks JSON/);

  const mixedLegacy = normalizeRenderBlocks([
    '下面是检查结果：',
    '',
    '| 项目 | 状态 |',
    '| --- | --- |',
    '| Gateway | 正常 |',
    '',
    '[tasklist]',
    '- [ ] **任务 1**：复现问题',
    '- [ ] **任务 2**：运行测试',
    '[/tasklist]',
    '',
    '是否需要模板？',
    '',
    '[pills]',
    '■ 需要，提供代码模板',
    '■ 暂不需要，直接修 Bug',
    '[/pills]',
  ].join('\n'));
  assert.equal(mixedLegacy.source, 'legacy');
  assert.deepEqual(mixedLegacy.blocks.map((block) => block.type), ['markdown', 'tasklist', 'markdown', 'pills']);
  assert.match(mixedLegacy.blocks[0].content, /\| Gateway \| 正常 \|/);
  assert.equal(mixedLegacy.blocks[1].items[0].label, '任务 1：复现问题');
  assert.equal(mixedLegacy.blocks[3].items[1].label, '暂不需要，直接修 Bug');

  const codeProtected = normalizeRenderBlocks([
    '示例：',
    '',
    '```md',
    '[pills]',
    '■ 不应该变按钮',
    '■ 仍然是代码',
    '[/pills]',
    '```',
  ].join('\n'));
  assert.equal(codeProtected.source, 'markdown');
  assert.equal(codeProtected.blocks.length, 1);
  assert.match(codeProtected.blocks[0].content, /\[pills\]/);

  const clarify = normalizeRenderBlocks([
    '请先补充信息：',
    '',
    '[clarify_card]',
    JSON.stringify({
      title: '周报自动化配置',
      fields: [
        { id: 'platform', label: '目标平台是哪一个？', type: 'single', options: ['钉钉', '飞书'] },
        { id: 'summary', label: '核心功能是什么？', type: 'text' },
      ],
    }),
    '[/clarify_card]',
  ].join('\n'));
  assert.deepEqual(clarify.blocks.map((block) => block.type), ['markdown', 'clarify_card']);
  assert.equal(clarify.blocks[1].fields[0].label, '目标平台是哪一个？');
  assert.equal(clarify.blocks[1].fields[1].type, 'text');

  const pureMarkdown = normalizeRenderBlocks('普通正文，没有交互标签。');
  assert.equal(pureMarkdown.source, 'markdown');
  assert.deepEqual(pureMarkdown.blocks, [{ type: 'markdown', content: '普通正文，没有交互标签。' }]);

  const fenced = _internals.extractRenderBlocksFence('```json render_blocks\n{"version":"3.0","blocks":[]}\n```');
  assert.equal(fenced.json, '{"version":"3.0","blocks":[]}');

  const nestedFence = normalizeRenderBlocks([
    '```render_blocks',
    JSON.stringify({
      version: '3.0',
      blocks: [
        {
          type: 'markdown',
          content: ['示例：', '```text', '■ 只是文档示例', '```'].join('\n'),
        },
      ],
    }, null, 2),
    '```',
  ].join('\n'));
  assert.equal(nestedFence.source, 'render_blocks');
  assert.equal(nestedFence.blocks[0].type, 'markdown');
  assert.match(nestedFence.blocks[0].content, /只是文档示例/);

  console.log('PASS renderBlocksNormalizer parses structured and legacy render blocks');
}

main();
