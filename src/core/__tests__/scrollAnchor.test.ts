import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ScrollAnchor } from '../viewport';

function mockEl(rect: Partial<DOMRect> = {}): HTMLElement {
  const el = {
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 600,
    getBoundingClientRect: () => ({
      top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
      ...rect,
    }),
  } as unknown as HTMLElement;
  return el;
}

function mockAnchor(topOffset: number, container: HTMLElement): HTMLElement {
  const containerTop = container.getBoundingClientRect().top;
  return {
    getBoundingClientRect: () => ({
      top: containerTop + topOffset,
      bottom: containerTop + topOffset + 40,
      left: 0, right: 800, width: 800, height: 40, x: 0, y: containerTop + topOffset,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement;
}

describe('ScrollAnchor', () => {
  let anchor: ScrollAnchor;
  let container: HTMLElement;

  beforeEach(() => {
    anchor = new ScrollAnchor();
    container = mockEl({ top: 0, bottom: 600 });
    anchor.attach(container);
  });

  it('starts unlocked', () => {
    expect(anchor.isLocked()).toBe(false);
  });

  it('locks after anchorToUserMessage', () => {
    const msg = mockAnchor(50, container);
    anchor.anchorToUserMessage(msg);
    expect(anchor.isLocked()).toBe(true);
  });

  it('release unlocks', () => {
    const msg = mockAnchor(50, container);
    anchor.anchorToUserMessage(msg);
    anchor.release();
    expect(anchor.isLocked()).toBe(false);
  });

  it('snapAndAnchor scrolls container and locks', () => {
    const msg = mockAnchor(200, container);
    anchor.snapAndAnchor(msg, 10);
    expect(anchor.isLocked()).toBe(true);
    expect(container.scrollTop).toBe(190);
  });

  it('reconcile compensates drift', () => {
    const initialOffset = 50;
    let currentTop = initialOffset;
    const msg = {
      getBoundingClientRect: () => ({
        top: currentTop, bottom: currentTop + 40,
        left: 0, right: 800, width: 800, height: 40, x: 0, y: currentTop,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement;

    anchor.anchorToUserMessage(msg);
    expect(container.scrollTop).toBe(0);

    currentTop = 80;
    anchor.reconcile();
    expect(container.scrollTop).toBe(30);
  });

  it('does not reconcile when unlocked', () => {
    anchor.reconcile();
    expect(container.scrollTop).toBe(0);
  });

  it('detach cleans up', () => {
    const msg = mockAnchor(50, container);
    anchor.anchorToUserMessage(msg);
    anchor.detach();
    expect(anchor.isLocked()).toBe(false);
  });

  it('followBottom scrolls to bottom when locked', () => {
    const msg = mockAnchor(50, container);
    anchor.anchorToUserMessage(msg);
    container.scrollTop = 0;
    anchor.followBottom();
    expect(container.scrollTop).toBe(400);
  });
});
