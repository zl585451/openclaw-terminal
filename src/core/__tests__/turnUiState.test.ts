import { describe, expect, it } from 'vitest';
import {
  emptyTurnUiState,
  reduceTurnUi,
  type TurnUiEvent,
  type TurnUiState,
} from '../turnUiState';

function run(events: TurnUiEvent[]): TurnUiState {
  return events.reduce(reduceTurnUi, emptyTurnUiState());
}

function phases(events: TurnUiEvent[]): string[] {
  const seen: string[] = [];
  events.reduce((state, ev) => {
    const next = reduceTurnUi(state, ev);
    seen.push(next.phase);
    return next;
  }, emptyTurnUiState());
  return seen;
}

describe('turnUiState reducer', () => {
  it('tracks a plain text answer from submit to completion', () => {
    expect(phases([
      { kind: 'submit', turnId: 't1' },
      { kind: 'agent_phase', phase: 'thinking' },
      { kind: 'seg_text_delta' },
      { kind: 'done' },
    ])).toEqual(['submitted', 'thinking', 'answering', 'completed']);
  });

  it('tracks a single tool round and waits for model continuation before answering', () => {
    expect(phases([
      { kind: 'submit', turnId: 't1' },
      { kind: 'tool_call' },
      { kind: 'tool_result' },
      { kind: 'seg_text_delta' },
      { kind: 'done' },
    ])).toEqual(['submitted', 'tool_running', 'waiting_continuation', 'answering', 'completed']);
  });

  it('keeps multi-tool rounds running until every tool has returned', () => {
    const events: TurnUiEvent[] = [
      { kind: 'submit', turnId: 't1' },
      { kind: 'tool_call' },
      { kind: 'tool_call' },
      { kind: 'tool_result' },
      { kind: 'tool_result' },
    ];
    const counts: number[] = [];
    const phasesSeen: string[] = [];

    events.reduce((state, ev) => {
      const next = reduceTurnUi(state, ev);
      counts.push(next.activeToolCount);
      phasesSeen.push(next.phase);
      return next;
    }, emptyTurnUiState());

    expect(counts).toEqual([0, 1, 2, 1, 0]);
    expect(phasesSeen).toEqual([
      'submitted',
      'tool_running',
      'tool_running',
      'tool_running',
      'waiting_continuation',
    ]);
  });

  it('keeps error sticky until a new submit resets the turn', () => {
    const errored = run([
      { kind: 'submit', turnId: 't1' },
      { kind: 'tool_call' },
      { kind: 'error', message: 'tool failed' },
      { kind: 'tool_result' },
      { kind: 'seg_text_delta' },
      { kind: 'done' },
    ]);

    expect(errored.phase).toBe('error');
    expect(errored.error?.message).toBe('tool failed');

    const reset = reduceTurnUi(errored, { kind: 'submit', turnId: 't2' });
    expect(reset.phase).toBe('submitted');
    expect(reset.turnId).toBe('t2');
    expect(reset.activeToolCount).toBe(0);
  });

  it('keeps clarify awaiting-user state sticky until the next submit', () => {
    const awaiting = run([
      { kind: 'submit', turnId: 't1' },
      { kind: 'clarify' },
      { kind: 'agent_phase', phase: 'thinking' },
      { kind: 'done' },
    ]);

    expect(awaiting.phase).toBe('awaiting_user');
    expect(awaiting.awaitingUser).toEqual({ kind: 'clarify' });

    const reset = reduceTurnUi(awaiting, { kind: 'submit', turnId: 't2' });
    expect(reset.phase).toBe('submitted');
    expect(reset.awaitingUser).toBeUndefined();
  });

  it('handles tool continuation reset followed by another tool call', () => {
    expect(phases([
      { kind: 'submit', turnId: 't1' },
      { kind: 'tool_call' },
      { kind: 'tool_result' },
      { kind: 'reset' },
      { kind: 'tool_call' },
    ])).toEqual([
      'submitted',
      'tool_running',
      'waiting_continuation',
      'waiting_continuation',
      'tool_running',
    ]);
  });

  it('never lets tool result count go below zero', () => {
    const state = run([
      { kind: 'submit', turnId: 't1' },
      { kind: 'tool_result' },
      { kind: 'tool_result' },
    ]);

    expect(state.activeToolCount).toBe(0);
    expect(state.phase).toBe('waiting_continuation');
  });
});
