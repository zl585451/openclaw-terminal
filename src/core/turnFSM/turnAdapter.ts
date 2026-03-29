import { TurnPhase } from './turnTypes';

/** Legacy UI / bridge flags derived only from current FSM phase (no extra state). */
export interface LegacyTurnFlags {
  isStreaming: boolean;
  isThinking: boolean;
  isRendering: boolean;
  hasResponse: boolean;
}

/**
 * Deterministic mapping: phase → legacy booleans.
 * | Phase           | isStreaming | isThinking | isRendering |
 * |-----------------|-------------|------------|-------------|
 * | MODEL_THINKING  | false       | true       | false       |
 * | STREAMING       | true        | false      | true        |
 * | STREAM_COMPLETE | false       | false      | true        |
 * | TURN_FINISHED   | false       | false      | false       |
 * (plus all other phases — see implementation)
 */
export function deriveLegacyFlags(phase: TurnPhase): LegacyTurnFlags {
  switch (phase) {
    case TurnPhase.IDLE:
      return { isStreaming: false, isThinking: false, isRendering: false, hasResponse: false };
    case TurnPhase.USER_TYPING:
    case TurnPhase.USER_SUBMIT:
    case TurnPhase.USER_COMMITTED:
    case TurnPhase.REQUEST_DISPATCHED:
      return { isStreaming: false, isThinking: false, isRendering: false, hasResponse: false };
    case TurnPhase.MODEL_THINKING:
      return { isStreaming: false, isThinking: true, isRendering: false, hasResponse: false };
    case TurnPhase.STREAM_OPEN:
      return { isStreaming: false, isThinking: false, isRendering: true, hasResponse: false };
    case TurnPhase.STREAMING:
      return { isStreaming: true, isThinking: false, isRendering: true, hasResponse: true };
    case TurnPhase.STREAM_PAUSED:
      return { isStreaming: false, isThinking: false, isRendering: true, hasResponse: true };
    case TurnPhase.STREAM_COMPLETE:
      return { isStreaming: false, isThinking: false, isRendering: true, hasResponse: true };
    case TurnPhase.RENDER_COMPLETE:
      return { isStreaming: false, isThinking: false, isRendering: true, hasResponse: true };
    case TurnPhase.TURN_FINISHED:
      return { isStreaming: false, isThinking: false, isRendering: false, hasResponse: true };
    case TurnPhase.ERROR:
      return { isStreaming: false, isThinking: false, isRendering: false, hasResponse: false };
    case TurnPhase.CANCELLED:
      return { isStreaming: false, isThinking: false, isRendering: false, hasResponse: true };
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
