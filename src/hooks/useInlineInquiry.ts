import { useState, useCallback, useRef, useMemo } from 'react';
import type { ClarifyCardSpec, ClarifyFieldReply, ClarifyReply } from '../core/clarifyCard/types';
import { parseClarifyCard } from '../core/clarifyCard/parser';
import { formatClarifyReply } from '../core/clarifyCard/formatter';

export interface ActiveInquiry {
  /** 触发此询问的 AMY 消息 ID 或 manual-xxx（DEV 模式） */
  sourceMessageId: string | number;
  spec: ClarifyCardSpec;
}

/** 单字段的用户当前输入值 */
export interface FieldDraft {
  value: string | string[];
  isCustomMode: boolean;
  customText: string;
  skipped: boolean;
}

export interface UseInlineInquiryOptions {
  onReply: (text: string) => void;
}

export function useInlineInquiry({ onReply }: UseInlineInquiryOptions) {
  const [active, setActive] = useState<ActiveInquiry | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [drafts, setDrafts] = useState<Record<string, FieldDraft>>({});
  const handledIds = useRef<Set<string>>(new Set());
  const activeRef = useRef<ActiveInquiry | null>(null);
  const draftsRef = useRef<Record<string, FieldDraft>>({});

  const totalPages = active?.spec.fields.length ?? 0;

  /** 初始化 drafts 并激活 */
  const activateWithSpec = useCallback((messageId: string, spec: ClarifyCardSpec) => {
    const init: Record<string, FieldDraft> = {};
    for (const f of spec.fields) {
      init[f.id] = {
        value: f.type === 'multi' ? [] : '',
        isCustomMode: false,
        customText: '',
        skipped: false,
      };
    }
    draftsRef.current = init;
    setDrafts(init);
    setCurrentPage(0);
    const nextActive = { sourceMessageId: messageId, spec };
    activeRef.current = nextActive;
    setActive(nextActive);
  }, []);

  /**
   * 从 AMY 消息中解析并触发（生产路径）
   */
  const maybeTrigger = useCallback((messageId: string | number, content: string): boolean => {
    const key = String(messageId);
    if (handledIds.current.has(key)) return false;
    if (active) return false;
    const { spec } = parseClarifyCard(content);
    if (!spec) return false;
    handledIds.current.add(key);
    activateWithSpec(key, spec);
    return true;
  }, [active, activateWithSpec]);

  /**
   * 直接用已构造的 spec 打开询问器（DEV / 测试路径）
   * 不走解析，不记录到 handledIds（允许反复打开）
   */
  const openSpec = useCallback((spec: ClarifyCardSpec): boolean => {
    if (active) return false;
    if (!spec.fields || spec.fields.length === 0) return false;
    activateWithSpec(`manual-${Date.now()}`, spec);
    return true;
  }, [active, activateWithSpec]);

  const updateDraft = useCallback((fieldId: string, next: Partial<FieldDraft>) => {
    setDrafts((prev) => {
      const nextDrafts = {
        ...prev,
        [fieldId]: { ...prev[fieldId], ...next, skipped: false },
      };
      draftsRef.current = nextDrafts;
      return nextDrafts;
    });
  }, []);

  const collectReplies = useCallback((): ClarifyFieldReply[] => {
    const activeNow = activeRef.current;
    if (!activeNow) return [];
    const replies: ClarifyFieldReply[] = [];
    const snapshot = draftsRef.current;
    for (const f of activeNow.spec.fields) {
      const d = snapshot[f.id];
      if (!d || d.skipped) continue;

      let finalValue: string | string[];
      let isCustom = false;

      if (f.type === 'text') {
        finalValue = typeof d.value === 'string' ? d.value.trim() : '';
        isCustom = true;
        if (!finalValue) continue;
      } else if (f.type === 'multi') {
        finalValue = Array.isArray(d.value) ? d.value : [];
        if ((finalValue as string[]).length === 0) continue;
      } else {
        if (d.isCustomMode) {
          finalValue = d.customText.trim();
          isCustom = true;
          if (!finalValue) continue;
        } else {
          finalValue = typeof d.value === 'string' ? d.value : '';
          if (!finalValue) continue;
        }
      }

      replies.push({
        fieldId: f.id,
        label: f.label,
        value: finalValue,
        isCustom,
      });
    }
    return replies;
  }, []);

  const completeAndSubmit = useCallback(() => {
    const activeNow = activeRef.current;
    if (!activeNow) return;
    const fields = collectReplies();

    activeRef.current = null;
    setActive(null);
    setCurrentPage(0);
    draftsRef.current = {};
    setDrafts({});

    // 全跳过 / 全空 → 聊天流零痕迹
    if (fields.length === 0) return;

    const reply: ClarifyReply = {
      cardTitle: activeNow.spec.title ?? '',
      fields,
      skipped: false,
    };
    onReply(formatClarifyReply(reply));
  }, [collectReplies, onReply]);

  const goNext = useCallback(() => {
    if (!active) return;
    if (currentPage < totalPages - 1) {
      setCurrentPage((p) => p + 1);
    } else {
      completeAndSubmit();
    }
  }, [active, currentPage, totalPages, completeAndSubmit]);

  const goPrev = useCallback(() => {
    if (currentPage > 0) setCurrentPage((p) => p - 1);
  }, [currentPage]);

  const goPage = useCallback((page: number) => {
    if (!active) return;
    if (page < 0 || page >= totalPages) return;
    setCurrentPage(page);
  }, [active, totalPages]);

  const skipCurrentField = useCallback(() => {
    if (!active) return;
    const field = active.spec.fields[currentPage];
    if (!field) return;
    setDrafts((prev) => {
      const nextDrafts = {
        ...prev,
        [field.id]: { ...prev[field.id], skipped: true },
      };
      draftsRef.current = nextDrafts;
      return nextDrafts;
    });
    goNext();
  }, [active, currentPage, goNext]);

  /** 纯关闭（X 或 Esc）：零痕迹 */
  const dismiss = useCallback(() => {
    activeRef.current = null;
    setActive(null);
    setCurrentPage(0);
    draftsRef.current = {};
    setDrafts({});
  }, []);

  /** 会话切换时重置（包括已处理 ID 集合） */
  const reset = useCallback(() => {
    activeRef.current = null;
    setActive(null);
    setCurrentPage(0);
    draftsRef.current = {};
    setDrafts({});
    handledIds.current.clear();
  }, []);

  const currentField = useMemo(() => {
    if (!active) return null;
    return active.spec.fields[currentPage] ?? null;
  }, [active, currentPage]);

  const currentDraft = useMemo(() => {
    if (!currentField) return null;
    return drafts[currentField.id] ?? null;
  }, [currentField, drafts]);

  return {
    activeSpec: active?.spec ?? null,
    hasActive: active !== null,
    currentPage,
    totalPages,
    currentField,
    currentDraft,
    maybeTrigger,
    openSpec,
    updateDraft,
    goNext,
    goPrev,
    goPage,
    skipCurrentField,
    completeAndSubmit,
    dismiss,
    reset,
  };
}
