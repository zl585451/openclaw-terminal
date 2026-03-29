/**
 * Viewport Anchoring System - Phase 5
 * LOCKED（流式）: 保持 scrollTop 不变，让正文在视口里「向下长高」（配合发送后用户气泡顶对齐）。
 * 不再在每次增高时 pin-bottom，否则会像从下往上顶、与 Claude 网页式体验相反。
 * FREE: 仅对可能的前置历史插入做 scrollTop 补偿。
 */

import type { TurnFSM } from '../turnFSM/turnFSM';
import { TurnPhase } from '../turnFSM/turnTypes';
import { ViewportMode, type ViewportAnchor, type LayoutChange, type ScrollPosition, type ViewportControllerOptions } from './viewportTypes';

const VIEWPORT_DEBUG = false;

/** 认为「靠近列表顶部」的 scrollTop 上限：仅在此情况下对高度增加做 FREE 补偿（历史前置加载）。 */
const TOP_PREPEND_SCROLL_THRESHOLD = 120;

function logDebug(message: string): void {
  if (VIEWPORT_DEBUG) {
    console.log(`[Viewport] ${message}`);
  }
}

export class ViewportController {
  private container: HTMLElement;
  private fsm: TurnFSM;
  private getBottomElement?: () => HTMLElement | null;
  private onModeChange?: (mode: ViewportMode, previousMode: ViewportMode) => void;

  private reattachThreshold = 40;
  private freeScrollThreshold = 30;

  private mode: ViewportMode = ViewportMode.LOCKED;
  private anchor: ViewportAnchor = {
    element: null,
    offsetTop: 0,
    previousTop: 0,
  };

  private lastScrollTop = 0;
  private isProgrammaticScroll = false;
  private lastScrollHeight = 0;
  private fsmUnsubscribe?: () => void;

  constructor(options: ViewportControllerOptions) {
    this.container = options.container;
    this.fsm = options.fsm;
    this.getBottomElement = options.getBottomElement;
    this.onModeChange = options.onModeChange;
    this.reattachThreshold = options.reattachThreshold ?? 40;
    this.freeScrollThreshold = options.freeScrollThreshold ?? 30;

    this.lastScrollTop = this.container.scrollTop;
    this.lastScrollHeight = this.container.scrollHeight;
  }

  attach(): void {
    this.fsmUnsubscribe = this.fsm.subscribe((phase) => {
      this.handleFsmPhaseChange(phase);
    });

    const currentPhase = this.fsm.getPhase();
    this.handleFsmPhaseChange(currentPhase);
    this.captureAnchor();

    logDebug('ViewportController attached');
  }

  detach(): void {
    if (this.fsmUnsubscribe) {
      this.fsmUnsubscribe();
      this.fsmUnsubscribe = undefined;
    }
    logDebug('ViewportController detached');
  }

  getMode(): ViewportMode {
    return this.mode;
  }

  /** 外部编程式改 scrollTop 后调用，避免下一帧 Mutation/Resize 用旧的 lastScrollHeight 算出虚假 delta */
  syncMetricsAfterProgrammaticScroll(): void {
    this.lastScrollHeight = this.container.scrollHeight;
    this.lastScrollTop = this.container.scrollTop;
  }

  private handleFsmPhaseChange(phase: TurnPhase): void {
    switch (phase) {
      case TurnPhase.USER_COMMITTED:
        // Cursor 风格：用户提交后进入 TOP_ANCHORED 模式，保持用户消息在视口顶部
        this.setMode(ViewportMode.TOP_ANCHORED);
        this.captureAnchor();
        break;
      case TurnPhase.STREAMING:
        // Cursor 风格：流式阶段保持 TOP_ANCHORED，除非用户手动上滚
        if (this.mode !== ViewportMode.FREE) {
          this.setMode(ViewportMode.TOP_ANCHORED);
        }
        this.captureAnchor();
        break;
      case TurnPhase.TURN_FINISHED:
      case TurnPhase.IDLE:
        this.setMode(ViewportMode.FREE);
        logDebug('Turn finished, viewport FREE');
        break;
    }
  }

  setMode(newMode: ViewportMode): void {
    if (this.mode === newMode) return;
    const oldMode = this.mode;
    this.mode = newMode;
    logDebug(`Mode: ${ViewportMode[oldMode]} → ${ViewportMode[newMode]}`);
    if (this.onModeChange) {
      this.onModeChange(newMode, oldMode);
    }
  }

  onUserScroll(): void {
    if (this.isProgrammaticScroll) return;

    const currentScrollTop = this.container.scrollTop;
    const scrollDelta = this.lastScrollTop - currentScrollTop;
    this.lastScrollTop = currentScrollTop;

    // Cursor 风格：TOP_ANCHORED 模式下用户上滚超过阈值则进入 FREE
    if (scrollDelta > this.freeScrollThreshold) {
      if (this.mode === ViewportMode.LOCKED || this.mode === ViewportMode.TOP_ANCHORED) {
        this.setMode(ViewportMode.FREE);
        logDebug('User scrolled up, entering FREE mode');
      }
    }

    // Cursor 风格：TOP_ANCHORED 模式下不自动滚底，只有 FREE 模式下才检查
    if (this.mode === ViewportMode.FREE) {
      const position = this.getScrollPosition();
      const maxScroll = this.container.scrollHeight - this.container.clientHeight;
      const atBottom = maxScroll <= 0 || this.container.scrollTop >= maxScroll - 2;
      if (position.distanceToBottom < this.reattachThreshold) {
        // 已在底部时不再 scrollIntoView，避免与浏览器取整/子像素导致的「回弹」
        if (atBottom) {
          this.setMode(ViewportMode.LOCKED);
          this.lastScrollTop = this.container.scrollTop;
          logDebug('FREE at bottom → LOCKED (skip redundant snap)');
          return;
        }
        this.setMode(ViewportMode.REATTACHING);
        this.smoothScrollToBottom();
      }
    }
  }

  onDOMMutation(): void {
    const beforeHeight = this.lastScrollHeight;
    const scrollTopBefore = this.container.scrollTop;
    requestAnimationFrame(() => {
      const afterHeight = this.container.scrollHeight;
      const delta = afterHeight - beforeHeight;
      if (delta !== 0) {
        this.handleLayoutChange(
          {
            beforeHeight,
            afterHeight,
            delta,
          },
          scrollTopBefore,
        );
      }
      this.lastScrollHeight = afterHeight;
    });
  }

  private handleLayoutChange(change: LayoutChange, scrollTopBefore: number): void {
    switch (this.mode) {
      case ViewportMode.LOCKED:
        this.compensateAnchorShift(change.delta);
        break;
      case ViewportMode.TOP_ANCHORED:
        // Cursor 风格：内容增长时保持 scrollTop 不变，让内容向下生长
        // 不做任何补偿，保持当前 scrollTop
        break;
      case ViewportMode.FREE:
        this.compensateNewBlock(change.delta, scrollTopBefore);
        break;
      case ViewportMode.REATTACHING:
        break;
    }
  }

  /**
   * 保留对外调用点；LOCKED 语义为贴底跟随，不再维护「最后一条消息顶部」锚点 delta。
   */
  captureAnchor(): void {
    const messages = this.container.querySelectorAll('.chat-message.assistant');
    if (messages.length === 0) {
      this.anchor = { element: null, offsetTop: 0, previousTop: 0 };
      logDebug('Anchor captured: (no assistant row)');
      return;
    }
    const lastMessage = messages[messages.length - 1] as HTMLElement;
    const containerRect = this.container.getBoundingClientRect();
    const messageRect = lastMessage.getBoundingClientRect();
    this.anchor = {
      element: lastMessage,
      offsetTop: messageRect.top - containerRect.top,
      previousTop: 0,
    };
    logDebug(`Anchor captured: tail assistant (visual offsetTop=${this.anchor.offsetTop.toFixed(1)}, LOCKED=pin-bottom)`);
  }

  /**
   * LOCKED：流式增高时不改 scrollTop。
   * 发送后已将用户消息顶到可视区顶部，此处保持锚点，助手气泡在下方自然向下延伸。
   */
  private compensateAnchorShift(_delta: number): void {
    logDebug('LOCKED preserve scrollTop (downward growth)');
  }

  /**
   * FREE：底部流式增高时浏览器会保持 scrollTop，视口稳定，禁止再 +delta（否则会把读历史的用户往下拽）。
   * 仅在「变更前 scrollTop 很小」时假定可能发生顶部插入（如前置历史），做 scrollTop += delta。
   */
  private compensateNewBlock(delta: number, scrollTopBefore: number): void {
    if (delta <= 0) return;
    if (scrollTopBefore > TOP_PREPEND_SCROLL_THRESHOLD) {
      logDebug(
        `FREE skip scroll compensation (bottom growth): delta=${delta}, scrollTopBefore=${scrollTopBefore.toFixed(0)}`,
      );
      return;
    }
    this.withProgrammaticScroll(() => {
      this.container.scrollTop += delta;
    });
    logDebug(`FREE top-prepend compensation: delta=${delta}, scrollTopBefore=${scrollTopBefore.toFixed(0)}`);
  }

  lockToBottom(): void {
    const bottom = this.getBottomElement?.();
    this.withProgrammaticScroll(() => {
      if (bottom?.isConnected) {
        bottom.scrollIntoView({ behavior: 'instant', block: 'end' });
      } else {
        this.container.scrollTop = this.container.scrollHeight - this.container.clientHeight;
      }
    });
    this.captureAnchor();
    logDebug('Locked to bottom');
  }

  private smoothScrollToBottom(): void {
    const bottom = this.getBottomElement?.();
    // 与 lockToBottom 一致用 instant，避免与用户滚轮争用同一滚动动画导致「回弹」感
    this.withProgrammaticScroll(() => {
      if (bottom?.isConnected) {
        bottom.scrollIntoView({ behavior: 'instant', block: 'end' });
      } else {
        const target = this.container.scrollHeight - this.container.clientHeight;
        this.container.scrollTo({ top: target, behavior: 'instant' });
      }
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.setMode(ViewportMode.LOCKED);
        this.captureAnchor();
        this.lastScrollTop = this.container.scrollTop;
      });
    });
    logDebug('Scroll to bottom (reattaching)');
  }

  private withProgrammaticScroll(fn: () => void): void {
    this.isProgrammaticScroll = true;
    fn();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.isProgrammaticScroll = false;
        this.lastScrollTop = this.container.scrollTop;
      });
    });
  }

  private getScrollPosition(): ScrollPosition {
    const scrollTop = this.container.scrollTop;
    const clientHeight = this.container.clientHeight;
    const scrollHeight = this.container.scrollHeight;
    return {
      scrollTop,
      clientHeight,
      scrollHeight,
      distanceToBottom: scrollHeight - scrollTop - clientHeight,
    };
  }
}

export { ViewportMode };
