import type { ActivityEntry } from '../../hooks/useMessages';

const INLINE_TOOL_DUPLICATE_TYPES = new Set<ActivityEntry['type']>([
  'tool_call',
  'tool_result',
]);

export function filterActivityEntriesForInlineTools(
  entries: ActivityEntry[],
  inlineToolsActive: boolean,
): ActivityEntry[] {
  if (!inlineToolsActive) return entries;
  return entries.filter((entry) => !INLINE_TOOL_DUPLICATE_TYPES.has(entry.type));
}
