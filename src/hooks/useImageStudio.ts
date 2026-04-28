import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../ui/chat/ChatTab.v2';
import { extractOptimizedImagePrompt } from '../utils/extractOptimizedImagePrompt';

/**
 * ImageStudio 侧栏：开关、初始 prompt，以及与「AMY 优化提示词」回流注入相关的 pending 逻辑。
 * 依赖 `messages` 以便在 assistant 非流式成文后将优化结果写入工作台。
 */
export function useImageStudio(messages: ChatMessage[]) {
  const [imageStudioOpen, setImageStudioOpen] = useState(false);
  const [imageStudioInitialPrompt, setImageStudioInitialPrompt] = useState('');
  const imagePromptInjectorRef = useRef<((prompt: string) => void) | null>(null);
  const pendingImagePromptRef = useRef(false);
  const lastImagePromptAssistantIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!imageStudioOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImageStudioOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imageStudioOpen]);

  const openImageStudio = useCallback((prefill?: string) => {
    const next = (prefill || '').trim();
    setImageStudioInitialPrompt(next);
    setImageStudioOpen(true);
  }, []);

  const closeImageStudio = useCallback(() => {
    setImageStudioOpen(false);
  }, []);

  const toggleImageStudio = useCallback(() => {
    setImageStudioOpen((v) => !v);
  }, []);

  const registerPromptInjector = useCallback((fn: (prompt: string) => void) => {
    imagePromptInjectorRef.current = fn;
  }, []);

  const markPendingPromptOptimization = useCallback(() => {
    pendingImagePromptRef.current = true;
  }, []);

  useEffect(() => {
    if (!pendingImagePromptRef.current) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isStreaming) return;
    if (lastImagePromptAssistantIdRef.current === lastMsg.id) return;

    lastImagePromptAssistantIdRef.current = lastMsg.id;
    pendingImagePromptRef.current = false;
    const cleanedPrompt = extractOptimizedImagePrompt(lastMsg.content);
    imagePromptInjectorRef.current?.(cleanedPrompt || lastMsg.content.trim());
  }, [messages]);

  return {
    imageStudioOpen,
    imageStudioInitialPrompt,
    openImageStudio,
    closeImageStudio,
    toggleImageStudio,
    registerPromptInjector,
    markPendingPromptOptimization,
  };
}
