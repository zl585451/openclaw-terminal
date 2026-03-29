import { describe, expect, it, vi } from 'vitest';
import { TurnFSM, TurnPhase, deriveLegacyFlags } from '../turnFSM';

describe('TurnFSM', () => {
  it('runs a valid semantic chain', () => {
    const fsm = new TurnFSM();
    expect(fsm.getPhase()).toBe(TurnPhase.IDLE);

    fsm.onUserTyping();
    expect(fsm.getPhase()).toBe(TurnPhase.USER_TYPING);

    fsm.onUserSubmit();
    expect(fsm.getPhase()).toBe(TurnPhase.USER_COMMITTED);

    fsm.onRequestStart();
    expect(fsm.getPhase()).toBe(TurnPhase.MODEL_THINKING);

    fsm.onStreamOpen();
    expect(fsm.getPhase()).toBe(TurnPhase.STREAM_OPEN);

    fsm.onToken();
    expect(fsm.getPhase()).toBe(TurnPhase.STREAMING);

    fsm.onStreamPause();
    expect(fsm.getPhase()).toBe(TurnPhase.STREAM_PAUSED);

    fsm.onStreamResume();
    expect(fsm.getPhase()).toBe(TurnPhase.STREAMING);

    fsm.onStreamEnd();
    expect(fsm.getPhase()).toBe(TurnPhase.STREAM_COMPLETE);

    fsm.onRenderDone();
    expect(fsm.getPhase()).toBe(TurnPhase.RENDER_COMPLETE);

    fsm.onTurnFinish();
    expect(fsm.getPhase()).toBe(TurnPhase.IDLE);
  });

  it('rejects invalid transition with fixed error message', () => {
    const fsm = new TurnFSM();
    expect(() => fsm.transition(TurnPhase.STREAMING)).toThrow('Invalid TurnPhase transition');
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const fsm = new TurnFSM();
    const fn = vi.fn();
    const unsub = fsm.subscribe(fn);

    fsm.onUserTyping();
    expect(fn).toHaveBeenCalledWith(TurnPhase.USER_TYPING);

    unsub();
    fsm.onUserSubmit();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onToken is idempotent when already STREAMING', () => {
    const fsm = new TurnFSM();
    fsm.onUserTyping();
    fsm.onUserSubmit();
    fsm.onRequestStart();
    fsm.onStreamOpen();
    fsm.onToken();
    fsm.onToken();
    fsm.onToken();
    expect(fsm.getPhase()).toBe(TurnPhase.STREAMING);
  });

  it('onStreamEnd from STREAM_PAUSED is invalid', () => {
    const fsm = new TurnFSM();
    fsm.onUserTyping();
    fsm.onUserSubmit();
    fsm.onRequestStart();
    fsm.onStreamOpen();
    fsm.onToken();
    fsm.onStreamPause();
    expect(() => fsm.onStreamEnd()).toThrow('Invalid TurnPhase transition');
  });

  it('onError from STREAMING transitions through ERROR to IDLE', () => {
    const fsm = new TurnFSM();
    fsm.onUserTyping();
    fsm.onUserSubmit();
    fsm.onRequestStart();
    fsm.onStreamOpen();
    fsm.onToken();
    expect(fsm.getPhase()).toBe(TurnPhase.STREAMING);

    fsm.onError();
    expect(fsm.getPhase()).toBe(TurnPhase.IDLE);
  });

  it('onError from MODEL_THINKING works', () => {
    const fsm = new TurnFSM();
    fsm.onUserTyping();
    fsm.onUserSubmit();
    fsm.onRequestStart();
    expect(fsm.getPhase()).toBe(TurnPhase.MODEL_THINKING);

    fsm.onError();
    expect(fsm.getPhase()).toBe(TurnPhase.IDLE);
  });

  it('onError from IDLE is a no-op', () => {
    const fsm = new TurnFSM();
    fsm.onError();
    expect(fsm.getPhase()).toBe(TurnPhase.IDLE);
  });

  it('onCancel from STREAMING transitions through CANCELLED to IDLE', () => {
    const fsm = new TurnFSM();
    fsm.onUserTyping();
    fsm.onUserSubmit();
    fsm.onRequestStart();
    fsm.onStreamOpen();
    fsm.onToken();
    fsm.onCancel();
    expect(fsm.getPhase()).toBe(TurnPhase.IDLE);
  });

  it('resetToIdle force-resets from any phase', () => {
    const fsm = new TurnFSM();
    fsm.onUserTyping();
    fsm.onUserSubmit();
    fsm.onRequestStart();
    expect(fsm.getPhase()).toBe(TurnPhase.MODEL_THINKING);

    fsm.resetToIdle();
    expect(fsm.getPhase()).toBe(TurnPhase.IDLE);
  });

  it('subscriber errors do not break FSM transitions', () => {
    const fsm = new TurnFSM();
    fsm.subscribe(() => { throw new Error('bad subscriber'); });
    const good = vi.fn();
    fsm.subscribe(good);

    fsm.onUserTyping();
    expect(fsm.getPhase()).toBe(TurnPhase.USER_TYPING);
    expect(good).toHaveBeenCalledWith(TurnPhase.USER_TYPING);
  });
});

describe('deriveLegacyFlags', () => {
  it('matches required table rows', () => {
    expect(deriveLegacyFlags(TurnPhase.MODEL_THINKING)).toEqual({
      isStreaming: false,
      isThinking: true,
      isRendering: false,
      hasResponse: false,
    });
    expect(deriveLegacyFlags(TurnPhase.STREAMING)).toEqual({
      isStreaming: true,
      isThinking: false,
      isRendering: true,
      hasResponse: true,
    });
    expect(deriveLegacyFlags(TurnPhase.STREAM_COMPLETE)).toEqual({
      isStreaming: false,
      isThinking: false,
      isRendering: true,
      hasResponse: true,
    });
    expect(deriveLegacyFlags(TurnPhase.TURN_FINISHED)).toEqual({
      isStreaming: false,
      isThinking: false,
      isRendering: false,
      hasResponse: true,
    });
  });
});
