import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatMessage } from '../../ui/chat/chatTypes';
import type { CardDef } from '../../ui/onboarding/CapabilityCards';
import { useCapabilityActions } from '../useCapabilityActions';

function applySetMessagesUpdate(
  setMessagesMock: ReturnType<typeof vi.fn>,
  prev: ChatMessage[] = [],
): ChatMessage[] {
  const updater = setMessagesMock.mock.calls.at(-1)?.[0];
  if (typeof updater !== 'function') {
    throw new Error('expected functional setState');
  }
  return updater(prev);
}

function makeOptions(overrides: Partial<Parameters<typeof useCapabilityActions>[0]> = {}) {
  return {
    setMessages: vi.fn(),
    getNextMessageId: vi.fn(() => 1),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    quickSend: vi.fn(),
    openImageStudio: vi.fn(),
    markPendingPromptOptimization: vi.fn(),
    dismissOnboarding: vi.fn(),
    onSwitchTab: vi.fn(),
    setInjectInputText: vi.fn(),
    setCapBarSetupTarget: vi.fn(),
    ...overrides,
  };
}

const sendPromptCard: CardDef = {
  id: 'chat',
  icon: '💬',
  title: '对话',
  subtitle: 'subtitle',
  capabilityId: 'chat',
  action: { type: 'send_prompt', prompt: '帮我写一段悬疑广播剧的开头' },
};

const imageStudioCard: CardDef = {
  id: 'image',
  icon: '🖼️',
  title: '生图',
  subtitle: 'subtitle',
  capabilityId: 'image_gen',
  action: {
    type: 'open_panel',
    panelId: 'image_studio',
    prefill: '赛博朋克风格的终端海报',
  },
};

describe('useCapabilityActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleSkipOnboarding 调用 dismissOnboarding', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useCapabilityActions(opts));
    act(() => {
      result.current.handleSkipOnboarding();
    });
    expect(opts.dismissOnboarding).toHaveBeenCalledTimes(1);
  });

  it('handleCapabilityBarSetup 调用 setCapBarSetupTarget 且参数正确', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useCapabilityActions(opts));
    act(() => {
      result.current.handleCapabilityBarSetup('music_gen');
    });
    expect(opts.setCapBarSetupTarget).toHaveBeenCalledTimes(1);
    expect(opts.setCapBarSetupTarget).toHaveBeenCalledWith('music_gen');
  });

  it('handleCapabilityBarClick — send_prompt 写入 setInjectInputText', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useCapabilityActions(opts));
    act(() => {
      result.current.handleCapabilityBarClick(sendPromptCard, 'available');
    });
    expect(opts.setInjectInputText).toHaveBeenCalledTimes(1);
    expect(opts.setInjectInputText).toHaveBeenCalledWith('帮我写一段悬疑广播剧的开头');
  });

  it('handleCapabilityBarClick — image_studio 且 available 调用 openImageStudio', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useCapabilityActions(opts));
    act(() => {
      result.current.handleCapabilityBarClick(imageStudioCard, 'available');
    });
    expect(opts.openImageStudio).toHaveBeenCalledTimes(1);
    expect(opts.openImageStudio).toHaveBeenCalledWith('赛博朋克风格的终端海报');
  });

  it('handleCapabilityBarClick — image_studio 且 unavailable 时 setMessages 含「生图 Key」引导', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useCapabilityActions(opts));
    act(() => {
      result.current.handleCapabilityBarClick(imageStudioCard, 'missing_key');
    });
    expect(opts.setMessages).toHaveBeenCalled();
    const next = applySetMessagesUpdate(opts.setMessages, []);
    expect(next).toHaveLength(1);
    expect(next[0].role).toBe('assistant');
    expect(String(next[0].content)).toContain('生图 Key');
    expect(opts.setCapBarSetupTarget).toHaveBeenCalledWith('image_gen');
  });

  it('handleWelcomeAction — send_prompt 类型调用 dismissOnboarding 与 sendMessage 各一次', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useCapabilityActions(opts));
    act(() => {
      result.current.handleWelcomeAction(sendPromptCard, 'available');
    });
    expect(opts.dismissOnboarding).toHaveBeenCalledTimes(1);
    expect(opts.sendMessage).toHaveBeenCalledTimes(1);
    expect(opts.sendMessage).toHaveBeenCalledWith('帮我写一段悬疑广播剧的开头', null);
  });

  it('insertImageToChat 调用 setMessages，新消息 content 含图片 URL', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useCapabilityActions(opts));
    const url = 'https://example.com/generated.png';
    const prompt = 'a sunset';
    act(() => {
      result.current.insertImageToChat(url, prompt);
    });
    expect(opts.setMessages).toHaveBeenCalledTimes(1);
    const next = applySetMessagesUpdate(opts.setMessages, []);
    expect(next).toHaveLength(1);
    expect(String(next[0].content)).toContain(url);
  });
});
