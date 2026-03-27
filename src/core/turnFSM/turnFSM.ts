import { TurnPhase } from './turnTypes';

/** Set `true` locally to log every transition as `[TurnFSM] A → B`. */
export const TURN_FSM_DEBUG = false;

const INVALID = 'Invalid TurnPhase transition';

/**
 * Explicit allowed edges only — no dynamic inference.
 */
export const allowedTransitions: Record<TurnPhase, TurnPhase[]> = {
  [TurnPhase.IDLE]: [TurnPhase.USER_TYPING],
  [TurnPhase.USER_TYPING]: [TurnPhase.USER_SUBMIT],
  [TurnPhase.USER_SUBMIT]: [TurnPhase.USER_COMMITTED],
  [TurnPhase.USER_COMMITTED]: [TurnPhase.REQUEST_DISPATCHED],

  [TurnPhase.REQUEST_DISPATCHED]: [TurnPhase.MODEL_THINKING],
  [TurnPhase.MODEL_THINKING]: [TurnPhase.STREAM_OPEN],

  [TurnPhase.STREAM_OPEN]: [TurnPhase.STREAMING],
  [TurnPhase.STREAMING]: [TurnPhase.STREAM_PAUSED, TurnPhase.STREAM_COMPLETE],
  [TurnPhase.STREAM_PAUSED]: [TurnPhase.STREAMING],

  [TurnPhase.STREAM_COMPLETE]: [TurnPhase.RENDER_COMPLETE],
  [TurnPhase.RENDER_COMPLETE]: [TurnPhase.TURN_FINISHED],
  [TurnPhase.TURN_FINISHED]: [TurnPhase.IDLE],
};

function logTransition(from: TurnPhase, to: TurnPhase): void {
  if (!TURN_FSM_DEBUG) return;
  console.log(`[TurnFSM] ${from} → ${to}`);
}

export class TurnFSM {
  private phase: TurnPhase = TurnPhase.IDLE;

  private listeners = new Set<(p: TurnPhase) => void>();

  constructor(initial: TurnPhase = TurnPhase.IDLE) {
    this.phase = initial;
  }

  getPhase(): TurnPhase {
    return this.phase;
  }

  transition(next: TurnPhase): void {
    const allowed = allowedTransitions[this.phase];
    if (!allowed?.includes(next)) {
      throw new Error(INVALID);
    }
    const from = this.phase;
    this.phase = next;
    logTransition(from, next);
    for (const fn of this.listeners) {
      fn(this.phase);
    }
  }

  subscribe(fn: (p: TurnPhase) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // --- Semantic API (UI / streaming must use these, not transition directly) ---

  onUserTyping(): void {
    this.transition(TurnPhase.USER_TYPING);
  }

  /** USER_TYPING → USER_SUBMIT → USER_COMMITTED */
  onUserSubmit(): void {
    this.transition(TurnPhase.USER_SUBMIT);
    this.transition(TurnPhase.USER_COMMITTED);
  }

  /** USER_COMMITTED → REQUEST_DISPATCHED → MODEL_THINKING */
  onRequestStart(): void {
    this.transition(TurnPhase.REQUEST_DISPATCHED);
    this.transition(TurnPhase.MODEL_THINKING);
  }

  onStreamOpen(): void {
    this.transition(TurnPhase.STREAM_OPEN);
  }

  /** First token: STREAM_OPEN → STREAMING; already STREAMING is a no-op. */
  onToken(): void {
    if (this.phase === TurnPhase.STREAM_OPEN) {
      this.transition(TurnPhase.STREAMING);
    }
  }

  onStreamPause(): void {
    this.transition(TurnPhase.STREAM_PAUSED);
  }

  onStreamResume(): void {
    this.transition(TurnPhase.STREAMING);
  }

  onStreamEnd(): void {
    this.transition(TurnPhase.STREAM_COMPLETE);
  }

  onRenderDone(): void {
    this.transition(TurnPhase.RENDER_COMPLETE);
  }

  /** RENDER_COMPLETE → TURN_FINISHED → IDLE */
  onTurnFinish(): void {
    this.transition(TurnPhase.TURN_FINISHED);
    this.transition(TurnPhase.IDLE);
  }
}
