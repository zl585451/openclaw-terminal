// Hook 负责「能力栏 / 首屏引导」相关的所有操作逻辑
// 不涉及流式主链路，不使用 TurnFSM / StreamRouter

import { useCallback } from 'react';
import type React from 'react';
import type { ChatMessage, UploadedFile } from '../ui/chat/chatTypes';
import type { CardDef } from '../ui/onboarding/CapabilityCards';
import type { CapabilityId, CapabilityStatus } from '../core/capabilities/types';
import type { WorkbenchRoundtripContext } from '../workbench/types';

export interface UseCapabilityActionsOptions {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getNextMessageId: () => number;
  sendMessage: (
    text: string,
    imageDataUrl: string | null,
    files?: UploadedFile[],
    workbenchContext?: WorkbenchRoundtripContext,
  ) => Promise<void>;
  quickSend: (content: string) => void;
  openImageStudio: (prefill?: string) => void;
  markPendingPromptOptimization: () => void;
  dismissOnboarding: () => void;
  onSwitchTab?: (tab: 'chat' | 'sound' | 'reaper') => void;
  setInjectInputText: React.Dispatch<React.SetStateAction<string | null>>;
  setCapBarSetupTarget: React.Dispatch<React.SetStateAction<CapabilityId | null>>;
}

export function useCapabilityActions(options: UseCapabilityActionsOptions) {
  const {
    setMessages,
    getNextMessageId,
    sendMessage,
    quickSend,
    openImageStudio,
    markPendingPromptOptimization,
    dismissOnboarding,
    onSwitchTab,
    setInjectInputText,
    setCapBarSetupTarget,
  } = options;

  const buildPromptOptimizeRequest = useCallback((prompt: string) => (
    `请帮我优化以下生图提示词。只输出优化后的英文 prompt，不要解释，不要加引号，不要使用 markdown：\n\n生图提示词：${prompt}`
  ), []);

  const appendImageCapabilityGuideMessage = useCallback(() => {
    setMessages((prev) => ([
      ...prev,
      {
        id: getNextMessageId(),
        role: 'assistant',
        content: [
          '我这边检测到你还没有配置生图 Key。',
          '',
          '你可以按以下步继续：',
          '',
          '点击右上方 [⚙️SETTINGS]→[生图配置]→填入可用作生图的key与对应模型名称',
          '',
          '[应用]→点击[SEND]旁边的🎨→输入提示词→[让AMY优化提示词]→[开始生成]',
          '',
          '如果你愿意，我也可以先帮你写一版生图提示词，等你填好 Key 之后直接生成。',
        ].join('\n'),
        timestamp: Date.now(),
      },
    ]));
  }, [getNextMessageId, setMessages]);

  const appendMusicCapabilityGuideMessage = useCallback(() => {
    setMessages((prev) => ([
      ...prev,
      {
        id: getNextMessageId(),
        role: 'assistant',
        content: [
          '我这边检测到你还没有配置音乐 Key（MINIMAX_API_KEY）。',
          '',
          '你可以按以下步继续：',
          '',
          '点击右上方 [⚙️SETTINGS]→[连接]→填入 MINIMAX_API_KEY → [应用]',
          '',
          '然后点顶部 [音频] 标签，输入描述后点击 [Create] 开始生成。',
        ].join('\n'),
        timestamp: Date.now(),
      },
    ]));
  }, [getNextMessageId, setMessages]);

  const handleWelcomeAction = useCallback(
    (card: CardDef, capabilityStatus: CapabilityStatus) => {
      if (card.action.type === 'send_prompt') {
        dismissOnboarding();
        void sendMessage(card.action.prompt, null);
        return;
      }

      if (card.action.type === 'open_panel' && card.action.panelId === 'image_studio') {
        if (capabilityStatus !== 'available') {
          dismissOnboarding();
          appendImageCapabilityGuideMessage();
          return;
        }

        dismissOnboarding();
        openImageStudio(card.action.prefill);
        const prefill = (card.action.prefill || '').trim();
        if (prefill) {
          markPendingPromptOptimization();
          quickSend(buildPromptOptimizeRequest(prefill));
        }
      }

      if (card.action.type === 'open_tab' && card.action.tabId === 'sound') {
        dismissOnboarding();
        if (capabilityStatus !== 'available') {
          appendMusicCapabilityGuideMessage();
        }
        onSwitchTab?.('sound');
        return;
      }
    },
    [
      appendImageCapabilityGuideMessage,
      appendMusicCapabilityGuideMessage,
      buildPromptOptimizeRequest,
      dismissOnboarding,
      markPendingPromptOptimization,
      openImageStudio,
      onSwitchTab,
      quickSend,
      sendMessage,
    ],
  );

  const handleSkipOnboarding = useCallback(() => {
    dismissOnboarding();
  }, [dismissOnboarding]);

  const handleCapabilityBarClick = useCallback((card: CardDef, capabilityStatus: CapabilityStatus) => {
    if (card.action.type === 'send_prompt') {
      setInjectInputText(card.action.prompt);
      return;
    }
    if (card.action.type === 'open_panel' && card.action.panelId === 'image_studio') {
      if (capabilityStatus !== 'available') {
        appendImageCapabilityGuideMessage();
        setCapBarSetupTarget('image_gen');
        return;
      }
      openImageStudio(card.action.prefill);
      return;
    }
    if (card.action.type === 'open_tab' && card.action.tabId === 'sound') {
      if (capabilityStatus !== 'available') {
        appendMusicCapabilityGuideMessage();
        setCapBarSetupTarget('music_gen');
      }
      onSwitchTab?.('sound');
    }
  }, [
    appendImageCapabilityGuideMessage,
    appendMusicCapabilityGuideMessage,
    onSwitchTab,
    openImageStudio,
    setCapBarSetupTarget,
    setInjectInputText,
  ]);

  const handleCapabilityBarSetup = useCallback((capId: CapabilityId) => {
    setCapBarSetupTarget(capId);
  }, [setCapBarSetupTarget]);

  const insertImageToChat = useCallback((imageUrl: string, prompt: string) => {
    setMessages((prev) => ([
      ...prev,
      {
        id: getNextMessageId(),
        role: 'assistant',
        content: `✅ 生图完成\n\n![生成图片](${imageUrl})\n\n> ${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}\n\n[查看原图](${imageUrl})`,
        timestamp: Date.now(),
      },
    ]));
  }, [getNextMessageId, setMessages]);

  return {
    handleWelcomeAction,
    handleSkipOnboarding,
    handleCapabilityBarClick,
    handleCapabilityBarSetup,
    insertImageToChat,
  };
}
