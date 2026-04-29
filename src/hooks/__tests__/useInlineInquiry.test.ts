import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ClarifyCardSpec } from '../../core/clarifyCard/types';
import { useInlineInquiry } from '../useInlineInquiry';

/** 单字段 spec（single 类型，有选项，至少两项符合 parser/normalizeField 规则） */
const singleFieldSpec: ClarifyCardSpec = {
  title: 'Single field card',
  fields: [
    {
      id: 'q_pick',
      label: 'Choose',
      type: 'single',
      options: ['Option A', 'Option B'],
    },
  ],
};

/** 双字段 spec（第一个 text，第二个 single） */
const twoFieldSpec: ClarifyCardSpec = {
  title: 'Two field card',
  fields: [
    {
      id: 't_name',
      label: 'Name',
      type: 'text',
      placeholder: 'Your name',
    },
    {
      id: 'q_mode',
      label: 'Mode',
      type: 'single',
      options: ['X', 'Y'],
    },
  ],
};

/** maybeTrigger：可被 parseClarifyCard 解析的最小正文（单字段 single + 两选项） */
const clarifyCardContentForTrigger =
  `[clarify_card]{"title":"Trig","fields":[{"id":"fi","label":"FL","type":"single","options":["one","two"]}]}[/clarify_card]`;

describe('useInlineInquiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始状态 — hasActive 为 false，activeSpec 为 null，currentPage 为 0', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    expect(result.current.hasActive).toBe(false);
    expect(result.current.activeSpec).toBeNull();
    expect(result.current.currentPage).toBe(0);
  });

  it('openSpec — 空 fields 时返回 false，不激活', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    const emptyFieldsSpec: ClarifyCardSpec = { fields: [] };
    let ok = false;
    act(() => {
      ok = result.current.openSpec(emptyFieldsSpec);
    });
    expect(ok).toBe(false);
    expect(result.current.hasActive).toBe(false);
  });

  it('openSpec — 有效 spec 激活成功', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    let ok = false;
    act(() => {
      ok = result.current.openSpec(twoFieldSpec);
    });
    expect(ok).toBe(true);
    expect(result.current.hasActive).toBe(true);
    expect(result.current.activeSpec).toEqual(twoFieldSpec);
    expect(result.current.currentPage).toBe(0);
  });

  it('openSpec — 已有活跃 inquiry 时返回 false', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(twoFieldSpec);
    });
    let second = false;
    act(() => {
      second = result.current.openSpec(singleFieldSpec);
    });
    expect(second).toBe(false);
    expect(result.current.activeSpec).toEqual(twoFieldSpec);
  });

  it('goNext — 非最后一页时翻页', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(twoFieldSpec);
    });
    act(() => {
      result.current.goNext();
    });
    expect(result.current.currentPage).toBe(1);
  });

  it('goPrev — 翻到第二页后可回到第一页', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(twoFieldSpec);
    });
    act(() => {
      result.current.goNext();
    });
    act(() => {
      result.current.goPrev();
    });
    expect(result.current.currentPage).toBe(0);
  });

  it('goPrev — 在第一页不变', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(twoFieldSpec);
    });
    act(() => {
      result.current.goPrev();
    });
    expect(result.current.currentPage).toBe(0);
  });

  it('goNext — 最后一页时触发 completeAndSubmit，inquiry 关闭', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(singleFieldSpec);
    });
    act(() => {
      result.current.updateDraft('q_pick', { value: 'Option A' });
    });
    act(() => {
      result.current.goNext();
    });
    expect(result.current.hasActive).toBe(false);
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it('completeAndSubmit — 全跳过时 onReply 不被调用', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(singleFieldSpec);
    });
    act(() => {
      result.current.completeAndSubmit();
    });
    expect(onReply).not.toHaveBeenCalled();
  });

  it('completeAndSubmit — 有填值时 onReply 被调用一次，参数为非空字符串', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(twoFieldSpec);
    });
    act(() => {
      result.current.updateDraft('t_name', { value: 'Alice' });
    });
    act(() => {
      result.current.completeAndSubmit();
    });
    expect(onReply).toHaveBeenCalledTimes(1);
    const arg = onReply.mock.calls[0][0] as string;
    expect(typeof arg).toBe('string');
    expect(arg.length).toBeGreaterThan(0);
    expect(arg).toContain('[澄清回执]');
  });

  it('skipCurrentField — 跳过后字段 skipped 为 true 且自动翻页', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(twoFieldSpec);
    });
    act(() => {
      result.current.skipCurrentField();
    });
    expect(result.current.currentPage).toBe(1);
    act(() => {
      result.current.goPrev();
    });
    expect(result.current.currentPage).toBe(0);
    expect(result.current.currentDraft?.skipped).toBe(true);
    expect(result.current.currentField?.id).toBe('t_name');
  });

  it('dismiss — 关闭后 hasActive 为 false，onReply 不被调用', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(twoFieldSpec);
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.hasActive).toBe(false);
    expect(onReply).not.toHaveBeenCalled();
  });

  it('reset — 清空状态且清除 handledIds（同 messageId 可再次触发）', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    const msgId = 'thread-msg-1';
    act(() => {
      result.current.maybeTrigger(msgId, clarifyCardContentForTrigger);
    });
    expect(result.current.hasActive).toBe(true);
    act(() => {
      result.current.reset();
    });
    expect(result.current.hasActive).toBe(false);
    let again = false;
    act(() => {
      again = result.current.maybeTrigger(msgId, clarifyCardContentForTrigger);
    });
    expect(again).toBe(true);
    expect(result.current.hasActive).toBe(true);
  });

  it('maybeTrigger — 已处理的 messageId 不重复触发', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    const msgId = 999;
    let first = false;
    let second = false;
    act(() => {
      first = result.current.maybeTrigger(msgId, clarifyCardContentForTrigger);
    });
    act(() => {
      second = result.current.maybeTrigger(msgId, clarifyCardContentForTrigger);
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('updateDraft — 更新后 currentDraft 反映新值', () => {
    const onReply = vi.fn();
    const { result } = renderHook(() => useInlineInquiry({ onReply }));
    act(() => {
      result.current.openSpec(twoFieldSpec);
    });
    act(() => {
      result.current.updateDraft('t_name', { value: 'Bob' });
    });
    expect(result.current.currentField?.id).toBe('t_name');
    expect(result.current.currentDraft?.value).toBe('Bob');
  });
});
