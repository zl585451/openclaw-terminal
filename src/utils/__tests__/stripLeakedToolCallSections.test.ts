import { describe, expect, it } from 'vitest';
import { getAssistantVisibleMain, stripLeakedToolCallSections } from '../cotExtract';

describe('stripLeakedToolCallSections', () => {
  it('removes a closed Kimi-style tool_calls section', () => {
    const before = '你好\n\n';
    const leak =
      '<|tool_calls_section_begin|><|tool_call_argument_begin|>' +
      '{"name":"canvas","arguments":{"action":"create"}}' +
      '<|tool_calls_section_end|>';
    expect(stripLeakedToolCallSections(before + leak)).toBe(before.trimEnd());
  });

  it('truncates at section_begin when end marker is missing (streaming)', () => {
    const visible = '前半段说明';
    const partial = visible + '<|tool_calls_section_begin|>{"x":1}';
    expect(stripLeakedToolCallSections(partial)).toBe(visible);
  });

  it('getAssistantVisibleMain strips leak then preserves non-cot text', () => {
    const t = '可见正文<|tool_calls_section_begin|>garbage';
    expect(getAssistantVisibleMain(t)).toBe('可见正文');
  });

  it('removes xml tool_call blocks from visible text', () => {
    const input =
      '先把这个事情放到任务看板\n' +
      '<tool_call>{"name":"task_add","arguments":{"title":"搭建多AGENT并行系统","priority":"medium"}}</tool_call>';
    expect(getAssistantVisibleMain(input)).toBe('先把这个事情放到任务看板');
  });
});
