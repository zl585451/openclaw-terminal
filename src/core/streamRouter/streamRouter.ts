import type { TurnFSM } from '../turnFSM';
import { StreamState, type StreamRouterEvent } from './streamTypes';

/** Set `true` locally to log state changes and buffer depth. */
export const STREAM_ROUTER_DEBUG = false;

const INVALID = 'Invalid StreamState transition';
const FLUSH_MS = 16;
const BATCH_MAX_TOKENS = 3;

const allowedTransitions: Record<StreamState, StreamState[]> = {
  [StreamState.IDLE]: [StreamState.OPENING],
  [StreamState.OPENING]: [StreamState.OPEN],
  [StreamState.OPEN]: [StreamState.STREAMING],
  [StreamState.STREAMING]: [StreamState.PAUSED, StreamState.FLUSHING],
  [StreamState.PAUSED]: [StreamState.STREAMING],
  [StreamState.FLUSHING]: [StreamState.COMPLETED],
  [StreamState.COMPLETED]: [StreamState.CLOSED],
  [StreamState.CLOSED]: [StreamState.IDLE],
};

function logState(from: StreamState, to: StreamState): void {
  if (!STREAM_ROUTER_DEBUG) return;
  console.log(`[StreamRouter] ${from} → ${to}`);
}

function logBuffer(depth: number): void {
  if (!STREAM_ROUTER_DEBUG) return;
  console.log(`[StreamRouter] BUFFER: ${depth} tokens`);
}

export class StreamRouter {
  private state: StreamState = StreamState.IDLE;

  private buffer: string[] = [];

  private listeners = new Set<(e: StreamRouterEvent) => void>();

  private intervalId: ReturnType<typeof setInterval> | null = null;

  private readonly fsm: TurnFSM;

  constructor(fsm: TurnFSM) {
    this.fsm = fsm;
  }

  getState(): StreamState {
    return this.state;
  }

  private transition(next: StreamState): void {
    const allowed = allowedTransitions[this.state];
    if (!allowed?.includes(next)) {
      throw new Error(INVALID);
    }
    const from = this.state;
    this.state = next;
    logState(from, next);
    this.emit({ type: 'state', payload: { state: this.state } });
  }

  private emit(event: StreamRouterEvent): void {
    for (const fn of this.listeners) {
      fn(event);
    }
  }

  subscribe(fn: (e: StreamRouterEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private startFlushTimer(): void {
    if (this.intervalId != null) return;
    this.intervalId = setInterval(() => this.flushTick(), FLUSH_MS);
  }

  private stopFlushTimer(): void {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Release a small batch from the buffer (paced emission). */
  private flushTick(): void {
    if (this.state === StreamState.PAUSED) return;
    if (
      this.state !== StreamState.STREAMING &&
      this.state !== StreamState.FLUSHING &&
      this.state !== StreamState.OPENING
    ) {
      return;
    }

    if (this.buffer.length === 0) {
      if (this.state === StreamState.FLUSHING) {
        this.stopFlushTimer();
        this.transition(StreamState.COMPLETED);
        this.fsm.onStreamEnd();
        this.fsm.onRenderDone();
      }
      return;
    }

    const take = Math.min(BATCH_MAX_TOKENS, this.buffer.length);
    const parts = this.buffer.splice(0, take);
    const batch = parts.join('');
    logBuffer(this.buffer.length);
    if (batch.length > 0) {
      this.emit({ type: 'tokens', payload: { batch } });
    }
  }

  open(): void {
    if (this.state !== StreamState.IDLE) {
      throw new Error(INVALID);
    }
    this.transition(StreamState.OPENING);
    this.fsm.onStreamOpen();
    this.startFlushTimer();
  }

  pushToken(token: string): void {
    if (this.state === StreamState.OPENING) {
      this.transition(StreamState.OPEN);
      this.transition(StreamState.STREAMING);
      this.fsm.onToken();
      this.buffer.push(token);
      logBuffer(this.buffer.length);
      return;
    }
    if (this.state === StreamState.STREAMING || this.state === StreamState.PAUSED) {
      this.buffer.push(token);
      logBuffer(this.buffer.length);
      return;
    }
    throw new Error(INVALID);
  }

  pause(): void {
    if (this.state !== StreamState.STREAMING) {
      throw new Error(INVALID);
    }
    this.stopFlushTimer();
    this.transition(StreamState.PAUSED);
    this.fsm.onStreamPause();
  }

  resume(): void {
    if (this.state !== StreamState.PAUSED) {
      throw new Error(INVALID);
    }
    this.transition(StreamState.STREAMING);
    this.fsm.onStreamResume();
    this.startFlushTimer();
  }

  end(): void {
    if (this.state !== StreamState.STREAMING) {
      throw new Error(INVALID);
    }
    this.transition(StreamState.FLUSHING);
    // Keep timer running so FLUSHING drains via flushTick; empty buffer completes on next tick(s).
    this.startFlushTimer();
  }

  close(): void {
    if (this.state !== StreamState.COMPLETED) {
      throw new Error(INVALID);
    }
    this.stopFlushTimer();
    this.buffer.length = 0;
    this.transition(StreamState.CLOSED);
    this.transition(StreamState.IDLE);
  }

  /** Error / cancel: bypass transition table, stop timers and return to IDLE. */
  abortToIdle(): void {
    this.stopFlushTimer();
    this.buffer.length = 0;
    if (this.state !== StreamState.IDLE) {
      const from = this.state;
      this.state = StreamState.IDLE;
      logState(from, StreamState.IDLE);
      this.emit({ type: 'state', payload: { state: StreamState.IDLE } });
    }
  }
}
