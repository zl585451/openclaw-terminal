import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from '../../hooks/useMessages';
import { filterActivityEntriesForInlineTools } from './activityTimelineFilters';

const timeline: ActivityEntry[] = [
  { id: 'cot', type: 'cot', timestamp: 1, content: 'thinking' },
  { id: 'call', type: 'tool_call', timestamp: 2, toolName: 'read_file', callId: 'c1' },
  { id: 'result', type: 'tool_result', timestamp: 3, toolName: 'read_file', callId: 'c1' },
  { id: 'keepalive', type: 'keepalive_hint', timestamp: 4, hint: 'working' },
];

describe('filterActivityEntriesForInlineTools', () => {
  it('keeps the existing timeline when inline tool cards are inactive', () => {
    expect(filterActivityEntriesForInlineTools(timeline, false)).toBe(timeline);
  });

  it('removes tool activity entries when inline tool cards are active', () => {
    expect(filterActivityEntriesForInlineTools(timeline, true)).toEqual([
      { id: 'cot', type: 'cot', timestamp: 1, content: 'thinking' },
      { id: 'keepalive', type: 'keepalive_hint', timestamp: 4, hint: 'working' },
    ]);
  });
});
