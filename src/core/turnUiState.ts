/**
 * Turn UI State projection.
 *
 * This reducer is a read-only UI-facing projection over existing chat events.
 * It does not replace turnFSM; turnFSM still owns the transport/render lifecycle.
 */

export type TurnUiPhase =
  | 'idle'
  | 'submitted'
  | 'thinking'
  | 'tool_running'
  | 'waiting_continuation'
  | 'answering'
  | 'awaiting_user'
  | 'finalizing'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface TurnUiState {
  turnId: string | null;
  phase: TurnUiPhase;
  activeToolCount: number;
  awaitingUser?: { kind: 'clarify' | 'elicitation' };
  error?: { message: string };
  startedAt?: number;
}

export type TurnUiEvent =
  | { kind: 'submit'; turnId: string }
  | { kind: 'agent_phase'; phase: string }
  | { kind: 'keepalive'; phase?: string }
  | { kind: 'tool_call' }
  | { kind: 'tool_result' }
  | { kind: 'seg_text_delta' }
  | { kind: 'reset' }
  | { kind: 'clarify' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }
  | { kind: 'cancel' };

export function emptyTurnUiState(): TurnUiState {
  return { turnId: null, phase: 'idle', activeToolCount: 0 };
}

function isStickyPhase(phase: TurnUiPhase): boolean {
  return phase === 'awaiting_user' || phase === 'error' || phase === 'cancelled';
}

export function reduceTurnUi(state: TurnUiState, ev: TurnUiEvent): TurnUiState {
  if (isStickyPhase(state.phase) && ev.kind !== 'submit') {
    return state;
  }

  switch (ev.kind) {
    case 'submit':
      return {
        turnId: ev.turnId,
        phase: 'submitted',
        activeToolCount: 0,
        startedAt: Date.now(),
      };
    case 'agent_phase':
      if ((ev.phase === 'thinking' || ev.phase === 'agent_running') && state.activeToolCount === 0) {
        return { ...state, phase: 'thinking' };
      }
      if ((ev.phase === 'typing' || ev.phase === 'answering') && state.activeToolCount === 0) {
        return { ...state, phase: 'answering' };
      }
      if (ev.phase === 'tool_executing') {
        return { ...state, phase: 'tool_running' };
      }
      if (ev.phase === 'idle' && state.phase === 'completed') {
        return state;
      }
      return state;
    case 'keepalive':
      if (ev.phase === 'waiting_continuation') {
        return { ...state, phase: 'waiting_continuation', activeToolCount: 0 };
      }
      if (ev.phase === 'tool_running') {
        return { ...state, phase: 'tool_running' };
      }
      if (!ev.phase && state.activeToolCount === 0) {
        return { ...state, phase: 'thinking' };
      }
      return state;
    case 'tool_call':
      return {
        ...state,
        phase: 'tool_running',
        activeToolCount: state.activeToolCount + 1,
      };
    case 'tool_result': {
      const activeToolCount = Math.max(0, state.activeToolCount - 1);
      return {
        ...state,
        activeToolCount,
        phase: activeToolCount === 0 ? 'waiting_continuation' : 'tool_running',
      };
    }
    case 'seg_text_delta':
      return { ...state, phase: 'answering' };
    case 'reset':
      return { ...state, phase: 'waiting_continuation', activeToolCount: 0 };
    case 'clarify':
      return {
        ...state,
        phase: 'awaiting_user',
        awaitingUser: { kind: 'clarify' },
      };
    case 'done':
      return { ...state, phase: 'completed', activeToolCount: 0 };
    case 'error':
      return {
        ...state,
        phase: 'error',
        activeToolCount: 0,
        error: { message: ev.message },
      };
    case 'cancel':
      return { ...state, phase: 'cancelled', activeToolCount: 0 };
    default:
      return state;
  }
}
