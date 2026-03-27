export enum StreamState {
  IDLE = 'IDLE',
  OPENING = 'OPENING',
  OPEN = 'OPEN',
  STREAMING = 'STREAMING',
  PAUSED = 'PAUSED',
  FLUSHING = 'FLUSHING',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
}

export type StreamRouterEvent =
  | { type: 'tokens'; payload: { batch: string } }
  | { type: 'state'; payload: { state: StreamState } };
