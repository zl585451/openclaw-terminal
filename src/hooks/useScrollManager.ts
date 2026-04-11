import { useState, useRef, useCallback, useLayoutEffect, useEffect, MutableRefObject } from 'react';
import type React from 'react';
import { ScrollAnchor } from '../core/viewport';
import { TurnFSM, TurnPhase } from '../core/turnFSM';

const MAX_VISIBLE_MESSAGES = 50;
const VISIBLE_MESSAGES_STEP = 30;
const SHOW_SCROLL_BUTTON_THRESHOLD = 300;

export interface UseScrollManagerOptions {
  fsm: TurnFSM;
  isStreaming: boolean;
  awaitingResponse: boolean;
  messagesLength: number;
}

export interface UseScrollManagerReturn {
  messagesContainerRef: MutableRefObject<HTMLDivElement | null>;
  bottomRef: MutableRefObject<HTMLDivElement | null>;
  showScrollBtn: boolean;
  scrollToBottom: (force?: boolean) => void;
  scheduleScrollAfterLayout: (force?: boolean) => void;
  /** Ref 桥梁：供 handleIncomingMessage 在消息到达时调用 */
  scheduleScrollAfterLayoutRef: MutableRefObject<((force?: boolean) => void) | null>;
  /** 外部触发锚点补偿（如工具卡片出现时）*/
  reconcile: () => void;
  scrollAfterUserSend: () => void;
  handleChatScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  visibleCount: number;
}

export function useScrollManager({
  fsm,
  isStreaming,
  awaitingResponse,
  messagesLength,
}: UseScrollManagerOptions): UseScrollManagerReturn {
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE_MESSAGES);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUp = useRef<boolean>(false);
  const snapJustFiredRef = useRef<boolean>(false);
  const pendingSnapMsgIdRef = useRef<number | null>(null);
  const scrollAnchorRef = useRef(new ScrollAnchor());
  const scheduleScrollAfterLayoutRef = useRef<((force?: boolean) => void) | null>(null);

  const scrollToBottom = useCallback(
    (force = false) => {
      if (snapJustFiredRef.current) return;
      const el = messagesContainerRef.current;
      if (!el) return;
      if (!force && !scrollAnchorRef.current.isLocked()) return;
      // TOP_ANCHORED（locked）+ 流式：不主动改 scrollTop，让内容在视口内自然向下增长
      if (!force && isStreaming && scrollAnchorRef.current.isLocked()) return;
      if (!bottomRef.current) return;

      const containerRect = el.getBoundingClientRect();
      const bottomRect = bottomRef.current.getBoundingClientRect();

      // 只向下滚：仅当 bottomRef 在视口下方（内容溢出）时才追
      if (bottomRect.top <= containerRect.bottom + 10) return;

      // 不 release anchor — 只有 scrollBtn 点击时 force=true 才应 release
      if (force) scrollAnchorRef.current.release();
      bottomRef.current.scrollIntoView({ behavior: 'instant', block: 'end' });
    },
    [isStreaming]
  );

  /** 布局稳定后再滚动（ResizeObserver / 流式 tick 共用） */
  const scheduleScrollAfterLayout = useCallback(
    (force = false) => {
      if (snapJustFiredRef.current) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom(force);
        });
      });
    },
    [scrollToBottom]
  );

  /** 发送后标记需要顶置，由 useLayoutEffect 在 DOM 提交后执行 */
  const scrollAfterUserSend = useCallback(() => {
    pendingSnapMsgIdRef.current = -1;
  }, []);

  // 每帧同步 ref（供外部代码通过 ref 调用）
  useLayoutEffect(() => {
    scheduleScrollAfterLayoutRef.current = scheduleScrollAfterLayout;
  });

  // FSM 相变：TURN_FINISHED / IDLE 时释放锚点
  useEffect(() => {
    return fsm.subscribe((phase) => {
      if (phase === TurnPhase.TURN_FINISHED || phase === TurnPhase.IDLE) {
        userScrolledUp.current = false;
        if (snapJustFiredRef.current || pendingSnapMsgIdRef.current !== null) return;
        scrollAnchorRef.current.release();
        requestAnimationFrame(() => {
          if (snapJustFiredRef.current) return;
          const el = messagesContainerRef.current;
          if (el) {
            const maxScroll = el.scrollHeight - el.clientHeight;
            if (el.scrollTop > maxScroll) {
              el.scrollTop = maxScroll;
            }
          }
        });
      }
    });
  }, [fsm]);

  // ScrollAnchor: 初始化 attach 容器
  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      scrollAnchorRef.current.attach(el);
    }
  }, []);

  // ResizeObserver: 非流式时 reconcile 锚点
  useLayoutEffect(() => {
    const wrap = messagesContainerRef.current;
    if (!wrap) return;
    const inner = wrap.querySelector('.chat-messages');
    const target = inner ?? wrap;
    const ro = new ResizeObserver(() => {
      if (snapJustFiredRef.current) return;
      if (!scrollAnchorRef.current.isLocked()) return;
      if (isStreaming) return;
      if (awaitingResponse) return;
      scrollAnchorRef.current.reconcile();
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [isStreaming, awaitingResponse, messagesLength]);

  // 用户发送消息后顶置滚动
  useLayoutEffect(() => {
    if (pendingSnapMsgIdRef.current === null) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    const userMsgs = container.querySelectorAll('.chat-message.user');
    if (userMsgs.length === 0) return;

    const lastUserMsg = userMsgs[userMsgs.length - 1] as HTMLElement;
    pendingSnapMsgIdRef.current = null;

    snapJustFiredRef.current = true;
    scrollAnchorRef.current.snapAndAnchor(lastUserMsg, 16);

    const snapTime = Date.now();
    const checkRelease = () => {
      if (Date.now() - snapTime < 800) {
        requestAnimationFrame(checkRelease);
      } else {
        snapJustFiredRef.current = false;
      }
    };
    requestAnimationFrame(checkRelease);
  }, [messagesLength]);

  // 新消息时确保可见窗口覆盖最新的 MAX_VISIBLE_MESSAGES
  useEffect(() => {
    setVisibleCount((prev) => Math.max(prev, Math.min(messagesLength, MAX_VISIBLE_MESSAGES)));
  }, [messagesLength]);

  const handleChatScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distFromBottom > SHOW_SCROLL_BUTTON_THRESHOLD);

      if (scrollAnchorRef.current.isProgrammatic()) return;

      scrollAnchorRef.current.onUserScroll(distFromBottom);
      userScrolledUp.current = !scrollAnchorRef.current.isLocked();

      if (el.scrollTop < 120 && messagesLength > visibleCount) {
        setVisibleCount((prev) => Math.min(prev + VISIBLE_MESSAGES_STEP, messagesLength));
      }
    },
    [messagesLength, visibleCount]
  );

  const reconcile = useCallback(() => {
    scrollAnchorRef.current.reconcile();
  }, []);

  return {
    messagesContainerRef,
    bottomRef,
    showScrollBtn,
    scrollToBottom,
    scheduleScrollAfterLayout,
    scheduleScrollAfterLayoutRef,
    scrollAfterUserSend,
    handleChatScroll,
    visibleCount,
    reconcile,
  };
}
