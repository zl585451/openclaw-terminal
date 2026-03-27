import { StreamState } from './streamTypes';

export interface StreamLegacyFlags {
  isStreaming: boolean;
  isPaused: boolean;
  isFlushing: boolean;
  isComplete: boolean;
}

export function deriveStreamFlags(state: StreamState): StreamLegacyFlags {
  return {
    isStreaming: state === StreamState.STREAMING,
    isPaused: state === StreamState.PAUSED,
    isFlushing: state === StreamState.FLUSHING,
    isComplete: state === StreamState.COMPLETED || state === StreamState.CLOSED,
  };
}
