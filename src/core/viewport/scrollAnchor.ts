/**
 * ScrollAnchor — Phase 5 viewport controller.
 *
 * Keeps the user's latest message pinned near the top of the viewport
 * while AI content grows below it, preventing the "content flies off
 * screen" problem.
 *
 * Usage:
 *   const anchor = new ScrollAnchor(containerEl);
 *   // After user sends message and DOM updates:
 *   anchor.anchorToUserMessage(userMsgEl);
 *   // On every DOM mutation / resize during streaming:
 *   anchor.reconcile();
 *   // When user scrolls manually:
 *   anchor.onUserScroll(distanceFromBottom);
 *   // When streaming ends:
 *   anchor.release();
 */

const raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (fn: () => void) => setTimeout(fn, 0);

export class ScrollAnchor {
  private container: HTMLElement | null = null;
  private anchorEl: HTMLElement | null = null;
  private anchorTopOffset: number = 0;
  private locked: boolean = false;
  private programmaticScroll: boolean = false;

  attach(container: HTMLElement): void {
    this.container = container;
  }

  detach(): void {
    this.release();
    this.container = null;
  }

  /**
   * Pin the viewport so `el` stays at its current visual position.
   * Call this right after the user message DOM node is rendered.
   */
  anchorToUserMessage(el: HTMLElement): void {
    if (!this.container) return;
    this.anchorEl = el;
    this.anchorTopOffset = el.getBoundingClientRect().top - this.container.getBoundingClientRect().top;
    this.locked = true;
  }

  /**
   * Snap the container so `el` appears at the top of the viewport
   * (with a small padding), then lock the anchor.
   */
  snapAndAnchor(el: HTMLElement, topPadding = 8): void {
    if (!this.container) return;
    this.anchorEl = el;
    this.programmaticScroll = true;

    const containerRect = this.container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const drift = elRect.top - containerRect.top - topPadding;
    this.container.scrollTop += drift;

    this.anchorTopOffset = topPadding;
    this.locked = true;

    // 延长保护窗口到 3 帧：
    // assistant 气泡在下一个 rAF 里插入 DOM，会触发 ResizeObserver → reconcile。
    // 1 帧保护不够，reconcile 会把 assistant 气泡插入导致的高度变化误判为用户消息漂移，
    // 将 scrollTop 往上推，造成历史消息上移。
    raf(() => raf(() => raf(() => { this.programmaticScroll = false; })));
  }

  /**
   * Compensate scroll position so the anchor element stays put.
   * Call this from ResizeObserver / MutationObserver / after DOM changes.
   */
  reconcile(): void {
    if (!this.locked || !this.anchorEl || !this.container) return;
    if (this.programmaticScroll) {
      console.log('[ScrollAnchor] reconcile SKIPPED (programmaticScroll)');
      return;
    }

    const containerRect = this.container.getBoundingClientRect();
    const currentOffset = this.anchorEl.getBoundingClientRect().top - containerRect.top;
    const drift = currentOffset - this.anchorTopOffset;

    console.log(`[ScrollAnchor] reconcile drift=${drift.toFixed(1)} anchorOffset=${this.anchorTopOffset.toFixed(1)} currentOffset=${currentOffset.toFixed(1)}`);

    if (Math.abs(drift) > 1) {
      console.log(`[ScrollAnchor] reconcile APPLYING drift=${drift.toFixed(1)}`);
      this.programmaticScroll = true;
      this.container.scrollTop += drift;
      raf(() => { this.programmaticScroll = false; });
    }
  }

  /**
   * Call from the scroll event handler.
   * Returns true if this scroll was programmatic (anchor compensation).
   */
  isProgrammatic(): boolean {
    return this.programmaticScroll;
  }

  /**
   * Let the user break free of anchor lock by scrolling away.
   * Call with distance-from-bottom from the scroll handler.
   */
  onUserScroll(_distFromBottom: number): void {
    if (this.programmaticScroll) return;
    if (!this.locked) return;

    if (!this.anchorEl || !this.container) {
      this.locked = false;
      return;
    }

    const containerRect = this.container.getBoundingClientRect();
    const anchorRect = this.anchorEl.getBoundingClientRect();
    const anchorBelowViewport = anchorRect.top > containerRect.bottom;
    const anchorAboveViewport = anchorRect.bottom < containerRect.top - 100;

    if (anchorBelowViewport || anchorAboveViewport) {
      this.locked = false;
    }
  }

  /** Release the anchor (streaming finished or user explicitly dismissed). */
  release(): void {
    this.locked = false;
    this.anchorEl = null;
    this.anchorTopOffset = 0;
  }

  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Ensure the bottom of the content is visible (auto-follow during streaming).
   * Only scrolls down, never up, and only if the anchor is still locked.
   */
  followBottom(): void {
    if (!this.container || !this.locked) return;

    const el = this.container;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

    if (distFromBottom > 2) {
      this.programmaticScroll = true;
      el.scrollTop = el.scrollHeight - el.clientHeight;
      raf(() => { this.programmaticScroll = false; });
    }
  }
}
