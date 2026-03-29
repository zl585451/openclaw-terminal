import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnFSM } from '../turnFSM';
import { StreamRouter } from '../streamRouter';
import { StreamState } from '../streamRouter/streamTypes';
import { deriveStreamFlags } from '../streamRouter/streamAdapter';

function fsmReadyForStream(): TurnFSM {
  const fsm = new TurnFSM();
  fsm.onUserTyping();
  fsm.onUserSubmit();
  fsm.onRequestStart();
  return fsm;
}

describe('StreamRouter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('follows valid state transitions for a full stream lifecycle', () => {
    const fsm = fsmReadyForStream();
    const router = new StreamRouter(fsm);
    const states: StreamState[] = [];

    router.subscribe((e) => {
      if (e.type === 'state') states.push(e.payload.state);
    });

    router.open();
    expect(router.getState()).toBe(StreamState.OPENING);

    router.pushToken('x');
    expect(router.getState()).toBe(StreamState.STREAMING);

    vi.advanceTimersByTime(16);
    router.end();
    expect(router.getState()).toBe(StreamState.FLUSHING);

    vi.advanceTimersByTime(16);
    expect(router.getState()).toBe(StreamState.COMPLETED);

    router.close();
    expect(router.getState()).toBe(StreamState.IDLE);

    expect(states).toContain(StreamState.OPENING);
    expect(states).toContain(StreamState.OPEN);
    expect(states).toContain(StreamState.STREAMING);
    expect(states).toContain(StreamState.FLUSHING);
    expect(states).toContain(StreamState.COMPLETED);
    expect(states).toContain(StreamState.CLOSED);
    expect(states).toContain(StreamState.IDLE);
  });

  it('rejects invalid transitions', () => {
    const router = new StreamRouter(fsmReadyForStream());
    expect(() => router.pushToken('a')).toThrow('Invalid StreamState transition');

    const r2 = new StreamRouter(fsmReadyForStream());
    r2.open();
    r2.pushToken('a');
    expect(() => r2.open()).toThrow('Invalid StreamState transition');
  });

  it('buffers tokens and emits paced batches', () => {
    const router = new StreamRouter(fsmReadyForStream());
    const batches: string[] = [];
    router.subscribe((e) => {
      if (e.type === 'tokens') batches.push(e.payload.batch);
    });

    router.open();
    'abcdefghij'.split('').forEach((t) => router.pushToken(t));

    vi.advanceTimersByTime(16);
    expect(batches[0]?.length).toBeLessThanOrEqual(3);

    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);

    const joined = batches.join('');
    expect(joined).toBe('abcdefghij');
  });

  it('pause stops flush; resume drains buffered tokens', () => {
    const router = new StreamRouter(fsmReadyForStream());
    const batches: string[] = [];
    router.subscribe((e) => {
      if (e.type === 'tokens') batches.push(e.payload.batch);
    });

    router.open();
    router.pushToken('a');
    router.pushToken('b');
    vi.advanceTimersByTime(16);
    expect(batches.length).toBeGreaterThanOrEqual(1);

    router.pause();
    router.pushToken('c');
    router.pushToken('d');
    vi.advanceTimersByTime(100);
    const nAfterPause = batches.length;

    router.resume();
    vi.advanceTimersByTime(16);
    expect(batches.length).toBeGreaterThan(nAfterPause);
    expect(batches.join('')).toContain('c');
    expect(batches.join('')).toContain('d');
  });

  it('end() drains buffer then calls FSM onStreamEnd then onRenderDone', () => {
    const fsm = fsmReadyForStream();
    const onEnd = vi.spyOn(fsm, 'onStreamEnd');
    const onRender = vi.spyOn(fsm, 'onRenderDone');
    const router = new StreamRouter(fsm);
    const batches: string[] = [];
    router.subscribe((e) => {
      if (e.type === 'tokens') batches.push(e.payload.batch);
    });

    router.open();
    router.pushToken('a');
    router.pushToken('b');
    router.end();

    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);
    expect(router.getState()).toBe(StreamState.COMPLETED);
    expect(batches.join('')).toBe('ab');

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.invocationCallOrder[0]).toBeLessThan(onRender.mock.invocationCallOrder[0]);
  });

  it('subscribe can be unsubscribed', () => {
    const router = new StreamRouter(fsmReadyForStream());
    const fn = vi.fn();
    const unsub = router.subscribe(fn);
    unsub();
    router.open();
    router.pushToken('z');
    vi.advanceTimersByTime(16);
    expect(fn).not.toHaveBeenCalled();
  });

  it('end() from OPENING handles empty AI response gracefully', () => {
    const fsm = fsmReadyForStream();
    const router = new StreamRouter(fsm);

    router.open();
    expect(router.getState()).toBe(StreamState.OPENING);

    router.end();
    expect(router.getState()).toBe(StreamState.FLUSHING);

    vi.advanceTimersByTime(16);
    expect(router.getState()).toBe(StreamState.COMPLETED);

    router.close();
    expect(router.getState()).toBe(StreamState.IDLE);
  });

  it('subscriber errors do not break StreamRouter', () => {
    const router = new StreamRouter(fsmReadyForStream());
    router.subscribe(() => { throw new Error('bad'); });
    const good = vi.fn();
    router.subscribe(good);

    router.open();
    router.pushToken('a');
    vi.advanceTimersByTime(16);

    expect(good).toHaveBeenCalled();
    expect(router.getState()).toBe(StreamState.STREAMING);
  });
});

describe('deriveStreamFlags', () => {
  it('maps stream states to legacy flags', () => {
    expect(deriveStreamFlags(StreamState.STREAMING)).toEqual({
      isStreaming: true,
      isPaused: false,
      isFlushing: false,
      isComplete: false,
    });
    expect(deriveStreamFlags(StreamState.PAUSED).isPaused).toBe(true);
    expect(deriveStreamFlags(StreamState.FLUSHING).isFlushing).toBe(true);
    expect(deriveStreamFlags(StreamState.COMPLETED).isComplete).toBe(true);
  });
});
