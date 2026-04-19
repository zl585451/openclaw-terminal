import { useState, useCallback, useRef } from 'react';
import type { ClarifyCardSpec, ClarifyReply } from '../core/clarifyCard/types';
import { parseClarifyCard } from '../core/clarifyCard/parser';
import { formatClarifyReply } from '../core/clarifyCard/formatter';

export interface ActiveClarify {
  /** 触发此卡片的 AMY 消息 ID */
  sourceMessageId: string | number;
  spec: ClarifyCardSpec;
}

export interface UseClarifyCardOptions {
  /** 当用户提交/跳过后调用，参数是已格式化的文本，应该以"用户消息"的名义 send */
  onReply: (text: string) => void;
}

export function useClarifyCard({ onReply }: UseClarifyCardOptions) {
  const [active, setActive] = useState<ActiveClarify | null>(null);
  /** 已处理过的消息 ID，避免重复弹 */
  const handledIds = useRef<Set<string>>(new Set());

  /**
   * 检查一条 assistant 消息，若包含 clarify_card 且未处理过，则弹出
   * 返回是否触发了弹出
   */
  const maybeTrigger = useCallback((messageId: string | number, content: string): boolean => {
    const key = String(messageId);
    if (handledIds.current.has(key)) return false;
    if (active) return false; // 已有活跃卡片，排队等下次触发
    const { spec } = parseClarifyCard(content);
    if (!spec) return false;
    handledIds.current.add(key);
    setActive({ sourceMessageId: messageId, spec });
    return true;
  }, [active]);

  const handleSubmit = useCallback((reply: ClarifyReply) => {
    const text = formatClarifyReply(reply);
    setActive(null);
    onReply(text);
  }, [onReply]);

  const handleSkip = useCallback(() => {
    if (!active) return;
    const text = formatClarifyReply({
      cardTitle: active.spec.title ?? '',
      fields: [],
      skipped: true,
    });
    setActive(null);
    onReply(text);
  }, [active, onReply]);

  /** 开发期/外部直接触发：不经过文本解析，直接展示卡片 */
  const openSpec = useCallback((messageId: string | number, spec: ClarifyCardSpec): boolean => {
    if (active) return false;
    const key = String(messageId);
    handledIds.current.add(key);
    setActive({ sourceMessageId: messageId, spec });
    return true;
  }, [active]);

  /** 供重置使用（如切换会话） */
  const reset = useCallback(() => {
    setActive(null);
    handledIds.current.clear();
  }, []);

  return {
    activeSpec: active?.spec ?? null,
    hasActive: active !== null,
    maybeTrigger,
    handleSubmit,
    handleSkip,
    openSpec,
    reset,
  };
}
